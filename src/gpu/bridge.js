/**
 * Le pont : dessine les objets Three.js de la plongée (sous-marin, poste de pilotage, pince,
 * objets à ramasser, créatures, épaves, rochers, fond…) avec le moteur WebGPU.
 *
 * Three.js reste le graphe de scène et la bibliothèque de maths : à chaque image, on parcourt
 * la scène, on copie les matrices monde dans un tampon d'instances et on dessine les géométries
 * (envoyées une seule fois à la carte graphique). Aucun shader Three.js n'est utilisé :
 * le matériau est traduit en quelques paramètres (couleur, émission, type de surface).
 *
 * Par instance (112 octets) : matrice monde (16) · couleur + opacité (4) · émission (4) · paramètres (4).
 * Par sommet (52 octets) : position, normale, couleur, uv, (aU, aGlow).
 */
import * as THREE from 'three';

const INST = 28; // flottants par instance
const VERT = 13; // flottants par sommet
const MAX_SINGLE = 6000; // maillages non instanciés par image
const MAX_LIGHTS = 6;
const KIND = { rock: 1, sand: 2, wood: 3, metal: 4, glass: 10, hull: 11, coral: 12, sponge: 13 };

export const VERTEX_LAYOUT = {
  arrayStride: VERT * 4,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x3' },
    { shaderLocation: 3, offset: 36, format: 'float32x2' },
    { shaderLocation: 4, offset: 44, format: 'float32x2' },
  ],
};
export const INSTANCE_LAYOUT = {
  arrayStride: INST * 4,
  stepMode: 'instance',
  attributes: [5, 6, 7, 8, 9, 10, 11].map((loc, i) => ({ shaderLocation: loc, offset: i * 16, format: 'float32x4' })),
};

export class Bridge {
  constructor(device, textureLayout, sampler) {
    this.device = device;
    this.textureLayout = textureLayout;
    this.sampler = sampler;
    this.geos = new WeakMap(); // BufferGeometry → tampons
    this.insts = new WeakMap(); // InstancedMesh → tampon d'instances
    this.texs = new WeakMap(); // Texture → { texture, bind, version }
    this.single = new Float32Array(MAX_SINGLE * INST);
    this.singleBuf = device.createBuffer({ size: this.single.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.nSingle = 0;
    // Particules : position + taille, couleur + type (voir vsPt)
    this.pts = new Float32Array(8000 * 8);
    this.nPts = 0;
    // Listes de dessin, par passe
    this.lists = { rock: [], opaque: [], alpha: [], add: [] };
    this.lights = [];
    this.spot = null;
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Sphere();
    this._v = new THREE.Vector3();
    this._p = { col: [1, 1, 1, 1], emi: [0, 0, 0, 0], par: [0, 0, 0, 0], list: 'opaque', tex: null };

    // Texture blanche par défaut, et quad des halos
    const white = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 255]), {}, [1, 1]);
    this.white = this.bindOf(white);
    this.quad = new THREE.PlaneGeometry(1, 1);
  }

  bindOf(texture) {
    return this.device.createBindGroup({ layout: this.textureLayout, entries: [{ binding: 0, resource: texture.createView() }] });
  }

  /** Géométrie Three → tampons GPU (refaits si les positions changent) */
  geometry(geo) {
    const pos = geo.attributes.position;
    let g = this.geos.get(geo);
    const version = pos.version + (geo.index?.version ?? 0) * 7 + (geo.attributes.color?.version ?? 0) * 13;
    if (g && g.version === version && g.count === pos.count) return g;
    g?.vb.destroy();
    g?.ib?.destroy();
    const n = pos.count, A = geo.attributes;
    const data = new Float32Array(n * VERT);
    const nor = A.normal, col = A.color, uv = A.uv, aU = A.aU, aG = A.aGlow;
    for (let i = 0; i < n; i++) {
      const o = i * VERT;
      data[o] = pos.getX(i); data[o + 1] = pos.getY(i); data[o + 2] = pos.getZ(i);
      if (nor) { data[o + 3] = nor.getX(i); data[o + 4] = nor.getY(i); data[o + 5] = nor.getZ(i); }
      if (col) { data[o + 6] = col.getX(i); data[o + 7] = col.getY(i); data[o + 8] = col.getZ(i); } else data[o + 6] = data[o + 7] = data[o + 8] = 1;
      if (uv) { data[o + 9] = uv.getX(i); data[o + 10] = uv.getY(i); }
      if (aU) data[o + 11] = aU.getX(i);
      if (aG) data[o + 12] = aG.getX(i);
    }
    const dev = this.device;
    const vb = dev.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(vb, 0, data);
    let ib = null, count = n, format = 'uint32';
    if (geo.index) {
      const src = geo.index.array;
      const idx = src instanceof Uint32Array ? src : Uint32Array.from(src);
      ib = dev.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      dev.queue.writeBuffer(ib, 0, idx);
      count = idx.length;
    }
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    g = { vb, ib, n: count, format, version, count: n, flat: !nor, hasColor: !!col };
    this.geos.set(geo, g);
    geo.addEventListener('dispose', () => { vb.destroy(); ib?.destroy(); this.geos.delete(geo); });
    return g;
  }

  /** Texture d'un matériau (écrans du poste de pilotage : canvas 2D mis à jour) */
  texture(map) {
    const img = map?.image;
    if (!img || !img.width) return this.white;
    let t = this.texs.get(map);
    if (!t) {
      const texture = this.device.createTexture({ size: [img.width, img.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      t = { texture, bind: this.bindOf(texture), version: -1 };
      this.texs.set(map, t);
    }
    if (t.version !== map.version) {
      try {
        this.device.queue.copyExternalImageToTexture({ source: img, flipY: true }, { texture: t.texture }, [img.width, img.height]);
      } catch { /* image pas encore prête */ }
      t.version = map.version;
    }
    return t.bind;
  }

  /**
   * Traduit un matériau en paramètres. Retourne false si l'objet ne se dessine pas ici
   * (shaders Three.js spécifiques : remplacés par des passes natives).
   */
  params(mat, obj, geo) {
    const P = this._p;
    const u = mat.userData, tag = obj.userData.gpu ?? u.gpu;
    let kind = 0, flags = 0, z = 0, w = 0;
    P.tex = null;
    P.emi[0] = P.emi[1] = P.emi[2] = P.emi[3] = 0;
    const c = mat.color, op = mat.opacity ?? 1;
    P.col[0] = c ? c.r : 1; P.col[1] = c ? c.g : 1; P.col[2] = c ? c.b : 1; P.col[3] = mat.transparent ? op : 1;
    if (mat.isShaderMaterial) {
      const U = mat.uniforms;
      if (tag === 'rift') { kind = 6; P.emi[3] = U.uOpen.value; z = U.uBeat.value; w = U.uNear.value; P.col[3] = 1; }
      else if (tag === 'pillar') { kind = 7; const k = U.uColor.value; P.emi[0] = k.r; P.emi[1] = k.g; P.emi[2] = k.b; z = U.uOpacity.value; P.col[3] = 1; }
      else return false;
      flags |= 4;
    } else if (mat.isSpriteMaterial) { kind = 9; flags |= 4; P.col[3] = op; }
    else if (mat.isMeshBasicMaterial) { kind = 5; P.tex = mat.map; }
    else {
      kind = KIND[u.detail] ?? (u.skin != null ? 8 : 0);
      if (kind === 8) z = u.skin;
      if (mat.flatShading || geo.flat) flags |= 1;
      if (u.swim) flags |= 2;
      if (u.flap) flags |= 16;
      const e = mat.emissive, ei = mat.emissiveIntensity ?? 1;
      if (e) { P.emi[0] = e.r * ei; P.emi[1] = e.g * ei; P.emi[2] = e.b * ei; }
      if (u.flap) P.emi[3] = u.flap; // amplitude du battement d'ailes
      P.tex = mat.map;
      if (kind === 1) P.col[0] = P.col[1] = P.col[2] = 1; // la roche a sa propre couleur ; seule la teinte d'instance compte
    }
    if (mat.blending === THREE.AdditiveBlending) flags |= 4;
    if (mat.vertexColors && geo.hasColor) flags |= 8;
    P.par[0] = kind; P.par[1] = flags; P.par[2] = z; P.par[3] = w;
    P.list = flags & 4 ? 'add' : kind === 1 || kind === 2 ? 'rock' : mat.transparent && op < 0.999 ? 'alpha' : 'opaque';
    return true;
  }

  write(out, o, e, extraColor) {
    const P = this._p;
    for (let i = 0; i < 16; i++) out[o + i] = e[i];
    out[o + 16] = P.col[0] * (extraColor ? extraColor[0] : 1);
    out[o + 17] = P.col[1] * (extraColor ? extraColor[1] : 1);
    out[o + 18] = P.col[2] * (extraColor ? extraColor[2] : 1);
    out[o + 19] = P.col[3];
    out[o + 20] = P.emi[0]; out[o + 21] = P.emi[1]; out[o + 22] = P.emi[2]; out[o + 23] = P.emi[3];
    out[o + 24] = P.par[0]; out[o + 25] = P.par[1]; out[o + 26] = P.par[2];
    // Graine par objet (variation de la texture de roche)
    out[o + 27] = P.par[0] === 1 || P.par[0] === 12 || P.par[0] === 13 ? (Math.abs(e[12] * 0.731 + e[14] * 0.317) % 1) : P.par[3];
  }

  /** InstancedMesh : tampon d'instances persistant, refait seulement si les matrices changent */
  instanced(mesh, mat, geo) {
    let it = this.insts.get(mesh);
    const im = mesh.instanceMatrix, ic = mesh.instanceColor;
    const version = im.version * 31 + (ic?.version ?? 0) * 17 + mesh.count;
    const dynamic = it && it.version !== version;
    if (!it || it.cap < mesh.count) {
      it?.buf.destroy();
      it = { buf: this.device.createBuffer({ size: Math.max(1, mesh.count) * INST * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), cap: mesh.count, data: new Float32Array(Math.max(1, mesh.count) * INST), version: -1 };
      this.insts.set(mesh, it);
    }
    if (it.version !== version || dynamic || mat.userData.gpuDynamic) {
      const M = this._m, a = im.array, col = [1, 1, 1];
      const ident = mesh.matrixWorld.elements[0] === 1 && mesh.matrixWorld.elements[5] === 1 && mesh.matrixWorld.elements[12] === 0 && mesh.matrixWorld.elements[13] === 0 && mesh.matrixWorld.elements[14] === 0 && mesh.matrixWorld.elements[1] === 0;
      for (let i = 0; i < mesh.count; i++) {
        let e;
        if (ident) e = a.subarray(i * 16, i * 16 + 16);
        else { M.fromArray(a, i * 16).premultiply(mesh.matrixWorld); e = M.elements; }
        if (ic) { col[0] = ic.array[i * 3]; col[1] = ic.array[i * 3 + 1]; col[2] = ic.array[i * 3 + 2]; }
        this.write(it.data, i * INST, e, ic ? col : null);
      }
      this.device.queue.writeBuffer(it.buf, 0, it.data, 0, mesh.count * INST);
      it.version = version;
    }
    return it.buf;
  }

  /** Parcourt la scène et prépare les listes de dessin et les lumières */
  collect(scene, camera, time = 0) {
    this.time = time;
    this.nPts = 0;
    const L = this.lists;
    L.rock.length = L.opaque.length = L.alpha.length = L.add.length = 0;
    this.lights.length = 0;
    this.spot = null;
    this.nSingle = 0;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const ce = camera.matrixWorld.elements;
    this.walk(scene, ce);
    this.device.queue.writeBuffer(this.singleBuf, 0, this.single, 0, this.nSingle * INST);
  }

  walk(o, ce) {
    if (!o.visible || o.userData.gpuSkip) return;
    if (o.isLight) this.light(o, ce);
    else if (o.isSprite) this.sprite(o, ce);
    else if (o.isMesh) this.mesh(o);
    else if (o.isPoints && o.userData.gpuPoints) this.points(o);
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) this.walk(ch[i], ce);
  }

  mesh(o) {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const src = o.geometry;
    if (!mat || !src?.attributes.position || !mat.visible) return;
    if (mat.isShaderMaterial && !(o.userData.gpu ?? mat.userData.gpu)) return;
    // Hors champ ?
    const bs = o.isInstancedMesh ? o.boundingSphere : (src.boundingSphere ?? (src.computeBoundingSphere(), src.boundingSphere));
    if (bs && o.frustumCulled !== false) {
      this._s.copy(bs).applyMatrix4(o.matrixWorld);
      if (!this.frustum.intersectsSphere(this._s)) return;
    }
    const geo = this.geometry(src);
    if (!this.params(mat, o, geo)) return;
    const P = this._p, tex = P.tex ? this.texture(P.tex) : this.white;
    if (o.isInstancedMesh) {
      if (o.count > 0) this.lists[P.list].push({ geo, buf: this.instanced(o, mat, geo), first: 0, count: o.count, tex });
    } else if (this.nSingle < MAX_SINGLE) {
      this.write(this.single, this.nSingle * INST, o.matrixWorld.elements, null);
      this.lists[P.list].push({ geo, buf: this.singleBuf, first: this.nSingle++, count: 1, tex });
    }
  }

  /**
   * Particules (THREE.Points étiquetés userData.gpuPoints = { kind, size, color? }) :
   *  bubble : bulles (attribut aLife) · spark : étincelles (aLife, aColor) · mote : lueurs du portail (aSeed)
   */
  points(o) {
    const cfg = o.userData.gpuPoints, A = o.geometry.attributes, pos = A.position.array, out = this.pts, e = o.matrixWorld.elements;
    const life = A.aLife?.array, col = A.aColor?.array, seed = A.aSeed?.array, n = A.position.count;
    for (let i = 0; i < n && this.nPts < 8000; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], r = 0.5, g = 0.6, b = 0.6, a = 1, kind = 0, size = cfg.size;
      if (cfg.kind === 'bubble') { if (life[i] <= 0) continue; a = Math.min(1, life[i] * 2); size *= 0.6 + 0.4 * ((i * 7) % 5) / 4; }
      else if (cfg.kind === 'spark') { if (life[i] <= 0) continue; a = Math.min(1, life[i] * 1.5) * 3; r = col[i * 3]; g = col[i * 3 + 1]; b = col[i * 3 + 2]; kind = 1; }
      else {
        // lueurs qui remontent le long de la déchirure, aspirées vers elle
        const H = cfg.hover;
        y = ((y + H + this.time * (0.8 + seed[i] * 1.6)) % 42) - H;
        const k = 1 - Math.min(0.8, Math.max(0, (y + H) / 50));
        x *= k; z *= k; a = (1 - (y + H) / 42) * 2.5 * (cfg.open?.() ?? 1); r = 0.5; g = 1; b = 0.55; kind = 1;
      }
      const k = this.nPts++ * 8;
      out[k] = e[0] * x + e[4] * y + e[8] * z + e[12]; out[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; out[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      out[k + 3] = size; out[k + 4] = r * a; out[k + 5] = g * a; out[k + 6] = b * a; out[k + 7] = kind;
    }
  }

  /** Halo (THREE.Sprite) : un quad face à la caméra */
  sprite(o, ce) {
    if (this.nSingle >= MAX_SINGLE || o.material.opacity <= 0.002) return;
    const geo = this.geometry(this.quad);
    this.params(o.material, o, geo);
    const w = o.matrixWorld.elements, out = this.single, k = this.nSingle * INST;
    const sx = Math.hypot(w[0], w[1], w[2]), sy = Math.hypot(w[4], w[5], w[6]);
    // Face à la caméra mais sans son roulis : le haut du halo reste le haut du monde
    let rx = ce[10], rz = -ce[8];
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    this._m.set(rx * sx, 0, ce[8], w[12], 0, sy, ce[9], w[13], rz * sx, 0, ce[10], w[14], 0, 0, 0, 1);
    this.write(out, k, this._m.elements, null);
    this.lists.add.push({ geo, buf: this.singleBuf, first: this.nSingle++, count: 1, tex: this.white });
  }

  light(o, ce) {
    if (!(o.isSpotLight || o.isPointLight) || o.intensity <= 0.001) return;
    const e = o.matrixWorld.elements;
    const l = { x: e[12], y: e[13], z: e[14], range: o.distance || 60, r: o.color.r * o.intensity, g: o.color.g * o.intensity, b: o.color.b * o.intensity, decay: o.decay, dx: 0, dy: 0, dz: 0, cos: -2, d2: 0 };
    l.d2 = (l.x - ce[12]) ** 2 + (l.y - ce[13]) ** 2 + (l.z - ce[14]) ** 2;
    if (o.isSpotLight) {
      const t = this._v.setFromMatrixPosition(o.target.matrixWorld);
      const d = Math.hypot(t.x - l.x, t.y - l.y, t.z - l.z) || 1;
      l.dx = (t.x - l.x) / d; l.dy = (t.y - l.y) / d; l.dz = (t.z - l.z) / d;
      l.cos = Math.cos(o.angle);
      this.spot = l;
    } else this.lights.push(l);
  }

  /** Remplit le bloc d'uniformes : phare en premier (faisceau volumétrique), puis les plus proches */
  writeLights(UB, base, k) {
    const all = this.lights.sort((a, b) => a.d2 - b.d2);
    if (this.spot) all.unshift(this.spot);
    const n = Math.min(MAX_LIGHTS, all.length);
    for (let i = 0; i < n; i++) {
      const l = all[i];
      UB.set([l.x, l.y, l.z, l.range], base + i * 4);
      UB.set([l.r * k, l.g * k, l.b * k, l.decay], base + 24 + i * 4);
      UB.set([l.dx, l.dy, l.dz, l.cos], base + 48 + i * 4);
    }
    return n;
  }

  draw(pass, list) {
    let lastTex = null;
    for (const d of list) {
      if (d.tex !== lastTex) pass.setBindGroup(1, (lastTex = d.tex));
      pass.setVertexBuffer(0, d.geo.vb);
      pass.setVertexBuffer(1, d.buf);
      if (d.geo.ib) {
        pass.setIndexBuffer(d.geo.ib, d.geo.format);
        pass.drawIndexed(d.geo.n, d.count, 0, 0, d.first);
      } else pass.draw(d.geo.n, d.count, 0, d.first);
    }
  }
}
