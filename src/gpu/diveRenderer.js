/**
 * Moteur de rendu WebGPU de la plongée.
 *
 * Architecture et shaders repris d'« Abyssal Garden » (Maksymilian Dendura, licence MIT) :
 * une seule passe de scène en HDR (rgba16float, profondeur inversée 32 bits, MSAA), une texture
 * d'eau animée (caustiques + pente de la surface), une carte d'ombres du soleil, des rayons de
 * lumière en demi-résolution, un halo (bloom) et une composition finale ACES.
 *
 * Ce moteur ne connaît rien du jeu : il reçoit la scène Three.js de la plongée (via le pont)
 * et y ajoute ce qui est natif — fond rocheux, forêts de kelp, surface, neige marine.
 */
import { buildShaders } from './shaders.js';
import { Bridge, VERTEX_LAYOUT, INSTANCE_LAYOUT, MAX_PTS } from './bridge.js';
import { buildGarden, buildGroundMap, GRID } from './garden.js';
import { getRoof } from '../world/roof.js';
import { RADIATION, ECHO } from '../config/settings.js';
import { KelpSim } from './kelpSim.js';

const HDR = 'rgba16float', DEPTH = 'depth32float';
const NB = 6; // niveaux du halo
const SUN = (() => { const v = [0.27, 1, -0.24], l = Math.hypot(...v); return v.map((c) => c / l); })();
const EXPO = 0.62, RAYS = 0.54;
const LIGHT_K = 0.05; // conversion des intensités Three.js (candelas) vers ce moteur
const SHADOW_R = 120, SHADOW_D0 = -200, SHADOW_D1 = 90;

// Niveaux de détail (index = preferences.qualityLevel)
const LEVELS = [
  { LV: 2, AA: 1, SHADOW: 1024, WATER: 256, RAYN: 10, SPOTN: 8, flora: 0.4, scale: 0.6, pixels: 0.9e6 },
  { LV: 1, AA: 4, SHADOW: 2048, WATER: 512, RAYN: 18, SPOTN: 12, flora: 0.7, scale: 0.8, pixels: 1.6e6 },
  { LV: 0, AA: 4, SHADOW: 2048, WATER: 512, RAYN: 28, SPOTN: 16, flora: 1, scale: 1, pixels: 2.4e6 },
];

/** Demande une carte graphique WebGPU ; null si le navigateur n'en a pas */
export async function requestGpu() {
  try {
    if (!navigator.gpu) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

export class GpuDiveRenderer {
  constructor(device, container, level = 2) {
    this.device = device;
    const Q = (this.Q = LEVELS[level] ?? LEVELS[2]);
    this.resScale = 1; // résolution dynamique (0.5 à 1)
    this.autoRes = true;
    this.frameMs = 16;

    const canvas = (this.canvas = document.createElement('canvas'));
    canvas.id = 'gpu-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none';
    container.appendChild(canvas);
    // ?gpuoffscreen : rendu hors écran recopié dans un canvas 2D (tests automatiques sans écran,
    // où la présentation WebGPU n'existe pas). En jeu normal : présentation directe.
    this.offscreen = new URLSearchParams(location.search).has('gpuoffscreen');
    if (this.offscreen) {
      this.ctx2d = canvas.getContext('2d');
      this.FMT = 'rgba8unorm';
    } else {
      this.ctx = canvas.getContext('webgpu');
      this.FMT = navigator.gpu.getPreferredCanvasFormat();
      this.ctx.configure({ device, format: this.FMT, alphaMode: 'opaque' });
    }

    const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage, Qu = device.queue;
    const mod = (code) => device.createShaderModule({ code });
    const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1 });
    this.tex = tex;
    const W = buildShaders({ ...Q, DK: 0.42, ECHO_SPEED: ECHO.SPEED });

    /* ---- Ressources fixes */
    const sRep = (this.sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: Q.LV > 1 ? 1 : 8 }));
    const sClamp = (this.sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' }));
    const sCmp = (this.sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' }));
    this.tShadow = tex(Q.SHADOW, Q.SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
    this.tWater = tex(Q.WATER, Q.WATER, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 5 });
    const tDetail = tex(1024, 1024, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 11 });
    const gm = buildGroundMap();
    const tMap = tex(gm.w, gm.h, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);
    Qu.writeTexture({ texture: tMap }, gm.data, { bytesPerRow: gm.w * 4 }, [gm.w, gm.h]);

    /* ---- Le jardin (kelp, herbiers, tapis) et la neige marine */
    const G = (this.garden = buildGarden(Q.flora));
    this.kelp = new KelpSim(device, G.stalks);
    const vbuf = (data) => { const b = device.createBuffer({ size: Math.max(4, (data.byteLength + 3) & ~3), usage: BU.VERTEX | BU.COPY_DST }); Qu.writeBuffer(b, 0, data); return b; };
    this.ibBig = vbuf(new Uint8Array(G.big.buf)); this.ibBigF = vbuf(new Uint8Array(G.bigF.buf));
    this.ibSmall = vbuf(new Uint8Array(G.small.buf)); this.ibGl = vbuf(new Uint8Array(G.glints.buf));
    for (const k of ['big', 'bigF', 'small', 'glints']) G[k].buf = null;
    const snow = new Float32Array(9000 * 4);
    for (let i = 0; i < snow.length; i++) snow[i] = Math.random();
    this.ibSnow = vbuf(snow); this.nSnow = 9000;
    // Particules du jeu (bulles, étincelles, lueurs du portail), remplies à chaque image par le pont
    this.ibPts = device.createBuffer({ size: MAX_PTS * 32, usage: BU.VERTEX | BU.COPY_DST });


    // Bloc d'uniformes : voir struct G dans shaders.js (144 flottants)
    this.UB = new Float32Array(144);
    this.UBS = new Float32Array(144);
    this.ubo = device.createBuffer({ size: 576, usage: BU.UNIFORM | BU.COPY_DST });
    this.uboS = device.createBuffer({ size: 576, usage: BU.UNIFORM | BU.COPY_DST });
    this.WT = new Float32Array(4);
    this.uboW = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });

    const VF = SS.VERTEX | SS.FRAGMENT;
    const bgl0 = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: VF, buffer: {} },
      { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
      { binding: 4, visibility: VF, texture: { sampleType: 'depth' } },
      { binding: 5, visibility: VF, texture: {} }, { binding: 6, visibility: VF, texture: {} }, { binding: 7, visibility: VF, texture: {} },
      { binding: 8, visibility: VF, texture: { sampleType: 'unfilterable-float' } }] });
    const mkBG0 = (u, sh) => device.createBindGroup({ layout: bgl0, entries: [
      { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
      { binding: 4, resource: sh.createView() }, { binding: 5, resource: this.tWater.createView() }, { binding: 6, resource: tDetail.createView() },
      { binding: 7, resource: tMap.createView() }, { binding: 8, resource: this.kelp.texture.createView() }] });
    this.bg0 = mkBG0(this.ubo, this.tShadow);
    this.bg0s = mkBG0(this.uboS, tDummy);
    const bgl1 = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }] });
    const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });
    const pl1 = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bgl1] });

    const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
    const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
    const mBlit = mod(W.W_BLIT);
    const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
    const PREMUL = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
    const blitPipe = (entry, format, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
      fragment: { module: mBlit, entryPoint: entry, targets: [{ format, blend: add ? ADD : undefined }] } });
    const pMip8 = blitPipe('fsMip', 'rgba8unorm');
    this.pMip16 = blitPipe('fsMip', HDR);
    this.pDown0 = blitPipe('fsDown0', HDR); this.pDown = blitPipe('fsDown', HDR); this.pUp = blitPipe('fsUp', HDR, true);
    this.blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
    const colorAtt = (this.colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] }));

    const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
    const ibLeaf = { arrayStride: 40, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4'), A(2, 32, 'unorm8x4'), A(3, 36, 'float32')] };
    const ibGl = { arrayStride: 32, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4')] };
    const ibSnow = { arrayStride: 16, stepMode: 'instance', attributes: [A(0, 0, 'float32x4')] };
    const AAc = Q.AA;
    const scenePipe = (m, vsE, fsE, buffers, o = {}) => device.createRenderPipeline({ layout: o.layout || pl0,
      vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
      fragment: { module: m, entryPoint: fsE, targets: [{ format: HDR, blend: o.blend }] },
      primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
      depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend, depthCompare: o.compare || 'greater' }, multisample: { count: AAc } });
    const shadowPipe = (m, vsE, buffers, o = {}) => device.createRenderPipeline({ layout: o.layout || pl0,
      vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
      primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 } });

    const mMesh = mod(W.W_MESH), mLeaf = mod(W.W_LEAF), mSurf = mod(W.W_SURF), mSpr = mod(W.W_SPR);
    const MB = [VERTEX_LAYOUT, INSTANCE_LAYOUT];
    this.pRock = scenePipe(mMesh, 'vs', 'fsRock', MB, { layout: pl1 });
    this.pMesh = scenePipe(mMesh, 'vs', 'fs', MB, { layout: pl1 });
    this.pMeshA = scenePipe(mMesh, 'vs', 'fs', MB, { layout: pl1, blend: PREMUL });
    this.pMeshAdd = scenePipe(mMesh, 'vs', 'fs', MB, { layout: pl1, blend: ADD });
    this.pMeshSh = shadowPipe(mMesh, 'vs', MB, { layout: pl1 });
    this.pLeaf = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 9 } });
    this.pLeaf5 = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 5 } });
    this.pLeafS = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3, FAR: 70 } });
    this.pLeafF = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });
    this.pLeafSh = shadowPipe(mLeaf, 'vs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });
    this.pGl = scenePipe(mLeaf, 'vsGl', 'fsGl', [ibGl], { strip: true, blend: ADD, constants: { ROWS: 7 } });
    this.pSurf = scenePipe(mSurf, 'vs', 'fs', [], { strip: true });
    // le fond : plan lointain (profondeur 0 = infini), là où rien d'autre n'a été dessiné
    this.pBack = scenePipe(mSurf, 'vsB', 'fsB', [], { strip: true, compare: 'greater-equal' });
    this.pSnow = scenePipe(mSpr, 'vsSnow', 'fsSnow', [ibSnow], { strip: true, blend: ADD });
    this.pPts = scenePipe(mSpr, 'vsPt', 'fsPt', [ibGl], { strip: true, blend: ADD });

    // Texture d'eau animée (une passe par image + mips)
    const mWater = mod(W.W_WATER);
    this.pWater = device.createRenderPipeline({ layout: 'auto', vertex: { module: mWater, entryPoint: 'vs' }, fragment: { module: mWater, entryPoint: 'fs', targets: [{ format: HDR }] } });
    this.bgWater = device.createBindGroup({ layout: this.pWater.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uboW } }] });
    const waterViews = [0, 1, 2, 3, 4].map((m) => this.tWater.createView({ baseMipLevel: m, mipLevelCount: 1 }));
    this.waterBG = waterViews.map((v) => this.blitBG(v));
    this.waterPass = waterViews.map((v) => ({ colorAttachments: [colorAtt(v, true)] }));

    const mRays = mod(W.W_RAYS), mPost = mod(W.W_POST), mRB = mod(W.W_RBLUR);
    this.pRB = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRB, entryPoint: 'vs' }, fragment: { module: mRB, entryPoint: 'fs', targets: [{ format: HDR }] } });
    this.pRays = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRays, entryPoint: 'vs' }, fragment: { module: mRays, entryPoint: 'fs', targets: [{ format: HDR }] } });
    this.pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: this.FMT }] } });

    /* ---- Texture de détail de la roche : dessinée une fois, puis ses mips */
    {
      const mDet = mod(W.W_DETAIL);
      const pDet = device.createRenderPipeline({ layout: 'auto', vertex: { module: mDet, entryPoint: 'vs' }, fragment: { module: mDet, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
      const e = device.createCommandEncoder();
      const views = Array.from({ length: 11 }, (_, m) => tDetail.createView({ baseMipLevel: m, mipLevelCount: 1 }));
      let r = e.beginRenderPass({ colorAttachments: [colorAtt(views[0], true)] }); r.setPipeline(pDet); r.draw(3); r.end();
      for (let i = 1; i < 11; i++) { r = e.beginRenderPass({ colorAttachments: [colorAtt(views[i], true)] }); r.setPipeline(pMip8); r.setBindGroup(0, this.blitBG(views[i - 1])); r.draw(3); r.end(); }
      Qu.submit([e.finish()]);
      const t0 = performance.now();
      Qu.onSubmittedWorkDone().then(() => { this.detailMs = performance.now() - t0; });
    }

    this.bridge = new Bridge(device, bgl1, sRep);
    this.shadowPass = { colorAttachments: [], depthStencilAttachment: { view: this.tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } };
    this.rowOrd = new Uint8Array(GRID.CZ);
    this.cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, tanh: 0.6, asp: 1 };
    this.W = this.H = 0;
    this.lost = false;
    this.pending = 0;
    // Diagnostic : ?gpuskip=leaf,rays… saute des passes
    this.skip = Object.fromEntries((new URLSearchParams(location.search).get('gpuskip') || '').split(',').map((k) => [k, true]));
    device.addEventListener('uncapturederror', (ev) => { if ((this.errors = (this.errors ?? 0) + 1) <= 5) console.error('WebGPU :', ev.error.message); });
    device.lost.then((info) => { if (info.reason !== 'destroyed') { this.lost = true; this.onLost?.(info); } });
  }

  get aspect() { return this.W / Math.max(1, this.H); }

  show(on) { this.canvas.style.display = on ? 'block' : 'none'; }

  /** Cibles de rendu à la taille de la fenêtre (× qualité × résolution dynamique) */
  resize() {
    const { device, Q, canvas } = this;
    const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * Q.scale * this.resScale;
    let w = cw * dpr, h = ch * dpr;
    const k = Math.sqrt(Math.min(1, (Q.pixels * this.resScale * this.resScale) / (w * h)));
    w = Math.max(64, Math.round((w * k) / 2) * 2); h = Math.max(64, Math.round((h * k) / 2) * 2);
    if (w === this.W && h === this.H) return;
    this.W = canvas.width = w; this.H = canvas.height = h;
    for (const t of this.targets ?? []) t.destroy();
    const TU = GPUTextureUsage, RT = TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, AA = Q.AA, tex = this.tex;
    const tRes = tex(w, h, HDR, RT), tDepth = tex(w, h, DEPTH, RT, { samples: AA });
    const tMS = AA > 1 ? tex(w, h, HDR, TU.RENDER_ATTACHMENT, { samples: AA }) : null;
    const hw = w >> 1, hh = h >> 1;
    const tRay = tex(hw, hh, HDR, RT), tRay2 = tex(hw, hh, HDR, RT);
    const bl = []; for (let i = 0, bw = w, bh = h; i < NB; i++) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); bl.push(tex(bw, bh, HDR, RT)); }
    this.targets = [tRes, tDepth, tRay, tRay2, ...bl]; if (tMS) this.targets.push(tMS);
    const vRes = tRes.createView(), vDepth = tDepth.createView(), vRay = tRay.createView(), vRay2 = tRay2.createView(), vBl = bl.map((t) => t.createView());
    const colorAtt = this.colorAtt;
    this.passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: vDepth, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
    this.passRays = { colorAttachments: [colorAtt(vRay, true)] };
    this.passBlur = { colorAttachments: [colorAtt(vRay2, true)] };
    this.bgBlur = device.createBindGroup({ layout: this.pRB.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRay }] });
    this.bgRays = device.createBindGroup({ layout: this.pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.ubo } }, { binding: 1, resource: this.sRep }, { binding: 2, resource: this.sCmp },
      { binding: 3, resource: this.tShadow.createView() }, { binding: 4, resource: this.tWater.createView() }, { binding: 5, resource: vDepth }] });
    this.bgPost = device.createBindGroup({ layout: this.pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.ubo } }, { binding: 1, resource: this.sClamp }, { binding: 2, resource: vRes },
      { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDepth }] });
    this.passPost = { colorAttachments: [colorAtt(null, true)] };
    this.bloomPass = []; this.bloomBG = [];
    for (let i = 0; i < NB; i++) { this.bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); this.bloomBG.push(this.blitBG(i ? vBl[i - 1] : vRes)); }
    for (let i = NB - 1; i > 0; i--) { this.bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); this.bloomBG.push(this.blitBG(vBl[i])); }
    if (this.offscreen) {
      this.tOut = tex(w, h, 'rgba8unorm', RT | TU.COPY_SRC);
      this.targets.push(this.tOut);
      this.rowBytes = (w * 4 + 255) & ~255;
      this.readBuf?.destroy();
      this.readBuf = device.createBuffer({ size: this.rowBytes * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    }
    const UB = this.UB;
    UB[52] = w; UB[53] = h; UB[54] = 1 / w; UB[55] = 1 / h;
  }

  /** Résolution dynamique : vise ~60 images/s en ajustant la taille de rendu */
  adapt(dt) {
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    this.adaptTimer = (this.adaptTimer ?? 2) - dt;
    if (!this.autoRes || this.adaptTimer > 0) return;
    this.adaptTimer = 1;
    if (this.frameMs > 21 && this.resScale > 0.5) this.resScale = Math.max(0.5, this.resScale * 0.88);
    else if (this.frameMs < 17.2 && this.resScale < 1) this.resScale = Math.min(1, this.resScale * 1.06);
  }

  /**
   * Dessine les cellules en vue d'un tampon trié par cellule, entre minD et maxD,
   * par suites contiguës, rangées les plus proches d'abord. frustum = false pour les ombres.
   */
  drawCells(r, L, mar, verts, minD, maxD, frustum = true) {
    const c = this.cam, { OX, OZ, CELLW, CX, CZ } = GRID, { start, lo, hi } = L;
    const tx = c.tanh * c.asp, hw = CELLW * 0.5, ex = hw + mar, min2 = minD * minD, max2 = maxD * maxD;
    const abs = Math.abs, max = Math.max;
    for (let k = 0; k < CZ; k++) {
      const rw = this.rowOrd[k], row = rw * CX, pz = OZ + (rw + 0.5) * CELLW - c.z, hz = max(abs(pz) - hw, 0);
      if (hz * hz >= max2) continue;
      let run = -1;
      for (let x = 0; x <= CX; x++) {
        const cell = row + x; let v = false;
        if (x < CX) {
          const l = lo[cell], h = hi[cell];
          if (l <= h) {
            const px = OX + (x + 0.5) * CELLW - c.x, py = (l + h) * 0.5 - c.y, ey = (h - l) * 0.5 + mar, hx = max(abs(px) - hw, 0), h2 = hx * hx + hz * hz;
            if (h2 < max2 && h2 >= min2) {
              if (!frustum) v = true;
              else {
                const lim = px * c.fx + py * c.fy + pz * c.fz + ex * abs(c.fx) + ey * abs(c.fy) + ex * abs(c.fz);
                if (lim >= 0 && abs(px * c.rx + py * c.ry + pz * c.rz) - ex * (abs(c.rx) + abs(c.rz)) - ey * abs(c.ry) <= lim * tx)
                  v = abs(px * c.ux + py * c.uy + pz * c.uz) - ex * (abs(c.ux) + abs(c.uz)) - ey * abs(c.uy) <= lim * c.tanh;
              }
            }
          }
        }
        if (v) { if (run < 0) run = cell; } else if (run >= 0) {
          const a = start[run], n = start[cell] - a;
          if (n > 0) r.draw(verts, n, 0, a);
          run = -1;
        }
      }
    }
  }

  /**
   * Une image. `dive` fournit la scène, la caméra, le sous-marin et le portail.
   */
  render(dive, time) {
    // Jamais plus de deux images d'avance sur la carte graphique (sinon les commandes s'empilent)
    if (this.lost || this.pending >= (this.offscreen ? 1 : 2)) return;
    this.resize();
    const { device, UB, UBS, bridge, cam: c } = this, Qu = device.queue;
    const camera = dive.camera;
    bridge.collect(dive.scene, camera, time);
    const dt = Math.min(0.1, Math.max(0, time - (this.lastTime ?? time)));
    this.lastTime = time;
    this.kelp.update(dt, dive.sub.position, dive.sub.velocity, dive.sub.forward);
    // Écho du sonar : les points du relevé et des bêtes, allumés par l'onde (voir vsPt)
    if (dive.echoAge != null) bridge.addEcho(dive.radar.cloud, dive.radar.nFloor ?? 0, dive.movers());
    if (bridge.nPts) Qu.writeBuffer(this.ibPts, 0, bridge.pts, 0, bridge.nPts * 8);

    /* ---- Caméra : base et projection à profondeur inversée (plan lointain à l'infini) */
    const e = camera.matrixWorld.elements, near = camera.near;
    c.x = e[12]; c.y = e[13]; c.z = e[14];
    c.rx = e[0]; c.ry = e[1]; c.rz = e[2]; c.ux = e[4]; c.uy = e[5]; c.uz = e[6]; c.fx = -e[8]; c.fy = -e[9]; c.fz = -e[10];
    c.tanh = Math.tan((camera.fov * Math.PI) / 360); c.asp = this.W / this.H;
    const sx = 1 / (c.tanh * c.asp), sy = 1 / c.tanh, m = UB;
    m[0] = c.rx * sx; m[4] = c.ry * sx; m[8] = c.rz * sx; m[12] = -(c.rx * c.x + c.ry * c.y + c.rz * c.z) * sx;
    m[1] = c.ux * sy; m[5] = c.uy * sy; m[9] = c.uz * sy; m[13] = -(c.ux * c.x + c.uy * c.y + c.uz * c.z) * sy;
    m[2] = 0; m[6] = 0; m[10] = 0; m[14] = near;
    m[3] = c.fx; m[7] = c.fy; m[11] = c.fz; m[15] = -(c.fx * c.x + c.fy * c.y + c.fz * c.z);
    m[32] = c.x; m[33] = c.y; m[34] = c.z; m[35] = time;
    m[36] = c.rx; m[37] = c.ry; m[38] = c.rz; m[39] = c.tanh * c.asp;
    m[40] = c.ux; m[41] = c.uy; m[42] = c.uz; m[43] = c.tanh;
    m[44] = c.fx; m[45] = c.fy; m[46] = c.fz; m[47] = near;
    m[48] = SUN[0]; m[49] = SUN[1]; m[50] = SUN[2]; m[51] = 0;
    // Exposition : l'œil s'habitue au noir des grands fonds
    const depth = -c.y;
    const ek = Math.min(1, Math.max(0, (depth - 8) / 26)), dark = Math.min(1, Math.max(0, (depth - 60) / 380));
    const shallow = Math.min(1, depth / 90); // ciel couvert : près de la surface, la lumière reste grise et douce
    m[56] = EXPO * (0.6 + 0.4 * ek) * (1 + 0.7 * dark) * (0.74 + 0.26 * shallow); m[57] = RAYS; m[58] = 1;
    // battement : 1 au bip du sonar, puis ça retombe ; l'eau verte, les veines du sol et l'image pulsent avec lui
    const beat = Math.exp(-(dive.beatPhase ?? 1) * 5);
    m[59] = (dive.survival?.radiation ?? 0) * 0.0035 * (1 + beat * 1.2) * (dive.portal?.open ?? 1); // ondulation de l'image près du portail
    // Sous-marin (il écarte les feuilles), portail (l'eau verdit), lumières
    const sub = dive.sub, S = RADIATION.SOURCE;
    m[60] = sub.position.x; m[61] = sub.position.y; m[62] = sub.position.z; m[63] = dive.echoAge ?? -1; // âge de l'écho du sonar
    m[64] = sub.velocity.x; m[65] = sub.velocity.y; m[66] = sub.velocity.z;
    m[67] = 1 - (dive.survival?.hullRatio ?? 1); // dégâts de coque (rayures, suie)
    const pd = Math.hypot(c.x - S.x, c.z - S.z), pk = Math.min(1, Math.max(0, (300 - pd) / 240));
    m[68] = (pk * pk * 0.7 * (dive.portal?.open ?? 1) + (dive.survival?.radiation ?? 0) * 0.5) * (0.75 + 0.6 * beat);
    // Sous la roche (tunnel, voûte, caverne), la lumière du jour n'arrive plus : il ne reste que le phare et ce qui luit
    const roof = getRoof(c.x, c.z), under = roof && c.y < roof.c ? 1 : 0;
    this.cover = (this.cover ?? 0) + (under - (this.cover ?? 0)) * 0.04;
    m[69] = (0.8 + 0.2 * shallow) * (1 - 0.93 * this.cover);
    m[70] = bridge.writeLights(UB, 72, LIGHT_K);
    m[71] = bridge.spot ? 0.006 + 0.02 * dark : 0; // faisceau visible surtout dans le noir

    /* ---- Soleil : carte d'ombres centrée sur la caméra (calée sur ses texels pour ne pas scintiller) */
    const sunLit = depth < 450;
    {
      const L = SUN, ll = Math.hypot(L[1], L[0]), lr = [L[1] / ll, -L[0] / ll, 0];
      const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
      const R = SHADOW_R, tx = (2 * R) / this.Q.SHADOW, d0 = SHADOW_D0, d1 = SHADOW_D1;
      const ox = Math.round((lr[0] * c.x + lr[1] * c.y + lr[2] * c.z) / tx) * tx, oy = Math.round((lu[0] * c.x + lu[1] * c.y + lu[2] * c.z) / tx) * tx;
      const od = L[0] * c.x + L[1] * c.y + L[2] * c.z;
      const s = UBS;
      s.set(UB);
      s[0] = lr[0] / R; s[4] = lr[1] / R; s[8] = lr[2] / R; s[12] = -ox / R;
      s[1] = lu[0] / R; s[5] = lu[1] / R; s[9] = lu[2] / R; s[13] = -oy / R;
      s[2] = -L[0] / (d1 - d0); s[6] = -L[1] / (d1 - d0); s[10] = -L[2] / (d1 - d0); s[14] = (d1 + od) / (d1 - d0);
      s[3] = 0; s[7] = 0; s[11] = 0; s[15] = 1;
      for (let i = 0; i < 16; i++) { s[16 + i] = s[i]; UB[16 + i] = s[i]; }
      s[52] = 0; s[53] = 0;
    }
    Qu.writeBuffer(this.ubo, 0, UB);
    Qu.writeBuffer(this.uboS, 0, UBS);
    this.WT[0] = time; Qu.writeBuffer(this.uboW, 0, this.WT);

    // Rangées de cellules, de la plus proche à la plus lointaine
    { const CZ = GRID.CZ; let cr = Math.floor((c.z - GRID.OZ) / GRID.CELLW) | 0; cr = cr < 0 ? 0 : cr > CZ - 1 ? CZ - 1 : cr; let n = 0; this.rowOrd[n++] = cr; for (let d = 1; d < CZ; d++) { if (cr - d >= 0) this.rowOrd[n++] = cr - d; if (cr + d < CZ) this.rowOrd[n++] = cr + d; } }

    const G = this.garden, L = bridge.lists, K = this.skip;
    const enc = device.createCommandEncoder();
    // Eau animée + mips
    let r = enc.beginRenderPass(this.waterPass[0]); r.setPipeline(this.pWater); r.setBindGroup(0, this.bgWater); r.draw(3); r.end();
    for (let i = 1; i < 5; i++) { r = enc.beginRenderPass(this.waterPass[i]); r.setPipeline(this.pMip16); r.setBindGroup(0, this.waterBG[i - 1]); r.draw(3); r.end(); }
    // Ombres du soleil (inutile dans le noir des grands fonds)
    if (sunLit && !K.shadow) {
      r = enc.beginRenderPass(this.shadowPass);
      r.setBindGroup(0, this.bg0s);
      r.setPipeline(this.pMeshSh); bridge.draw(r, L.rock); bridge.draw(r, L.opaque);
      r.setPipeline(this.pLeafSh); r.setVertexBuffer(0, this.ibBig); this.drawCells(r, G.big, 5, 6, 0, SHADOW_R, false);
      r.end();
    }
    // Scène
    r = enc.beginRenderPass(this.passScene);
    r.setBindGroup(0, this.bg0);
    if (!K.rock) { r.setPipeline(this.pRock); bridge.draw(r, L.rock); }
    if (!K.mesh) { r.setPipeline(this.pMesh); bridge.draw(r, L.opaque); }
    // kelp et plantes : 9 rangées de près, 5 à mi-distance, un jeu allégé au loin
    if (!K.leaf) { r.setPipeline(this.pLeaf); r.setVertexBuffer(0, this.ibBig); this.drawCells(r, G.big, 5, 18, 0, 24); }
    if (!K.leaf) { r.setPipeline(this.pLeaf5); this.drawCells(r, G.big, 5, 10, 24, 58); }
    if (!K.leaf) { r.setPipeline(this.pLeafF); r.setVertexBuffer(0, this.ibBigF); this.drawCells(r, G.bigF, 5, 6, 58, 150); }
    if (!K.leaf) { r.setPipeline(this.pLeafS); r.setVertexBuffer(0, this.ibSmall); this.drawCells(r, G.small, 1.5, 6, 0, 70); }
    if (!K.surf) { r.setPipeline(this.pSurf); r.draw(4); }
    if (!K.surf) { r.setPipeline(this.pBack); r.draw(4); }
    if (!K.blend) { r.setPipeline(this.pMeshA); bridge.draw(r, L.alpha); }
    if (!K.blend) { r.setPipeline(this.pMeshAdd); bridge.draw(r, L.add); }
    if (!K.gl) { r.setPipeline(this.pGl); r.setVertexBuffer(0, this.ibGl); this.drawCells(r, G.glints, 2, 4, 0, 120); }
    if (!K.snow) { r.setPipeline(this.pSnow); r.setVertexBuffer(0, this.ibSnow); r.draw(4, this.nSnow); }
    if (bridge.nPts) { r.setPipeline(this.pPts); r.setVertexBuffer(0, this.ibPts); r.draw(4, bridge.nPts); }
    r.end();
    // Rayons de lumière (soleil + faisceau du phare), puis flou qui respecte la profondeur
    if (!K.rays) { r = enc.beginRenderPass(this.passRays); r.setPipeline(this.pRays); r.setBindGroup(0, this.bgRays); r.draw(3); r.end(); }
    r = enc.beginRenderPass(this.passBlur); r.setPipeline(this.pRB); r.setBindGroup(0, this.bgBlur); r.draw(3); r.end();
    // Halo
    for (let i = 0; i < this.bloomPass.length; i++) {
      r = enc.beginRenderPass(this.bloomPass[i]); r.setPipeline(i === 0 ? this.pDown0 : i < NB ? this.pDown : this.pUp); r.setBindGroup(0, this.bloomBG[i]); r.draw(3); r.end();
    }
    // Composition finale
    this.passPost.colorAttachments[0].view = (this.offscreen ? this.tOut : this.ctx.getCurrentTexture()).createView();
    r = enc.beginRenderPass(this.passPost); r.setPipeline(this.pPost); r.setBindGroup(0, this.bgPost); r.draw(3); r.end();
    if (this.offscreen) enc.copyTextureToBuffer({ texture: this.tOut }, { buffer: this.readBuf, bytesPerRow: this.rowBytes }, [this.W, this.H]);
    Qu.submit([enc.finish()]);
    this.pending++;
    const t0 = performance.now();
    const done = () => { this.pending--; this.gpuMs = performance.now() - t0; this.frames = (this.frames ?? 0) + 1; };
    if (!this.offscreen) Qu.onSubmittedWorkDone().then(done);
    else {
      const { W: w, H: h, readBuf, rowBytes } = this;
      readBuf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Uint8Array(readBuf.getMappedRange()), img = this.ctx2d.createImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(src.subarray(y * rowBytes, y * rowBytes + w * 4), y * w * 4);
        this.ctx2d.putImageData(img, 0, 0);
        readBuf.unmap();
        done();
      }, done);
    }
  }
}
