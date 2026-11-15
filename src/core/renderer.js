import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { quality, preferences, savePreferences } from '../save/preferences.js';

/**
 * Renderer du jeu, rendu en HDR (inspiré d'Abyssal Garden et de Web Ocean) :
 *  1. la scène est rendue dans une cible flottante multi-échantillonnée (antialiasing) ;
 *  2. bloom : chaîne de réductions successives (moyenne de Karis à la première, contre le
 *     scintillement des points très brillants), puis remontée en « tente » ;
 *  3. composition : bloom, exposition, vignettage, courbe de tons filmique (ACES ajustée),
 *     léger contraste en S sur la luminance, désaturation des hautes lumières,
 *     conversion sRGB et grain (bruit à gradient entrelacé) qui supprime les bandes.
 * L'ondulation près du portail (radiation) est appliquée au moment de la lecture.
 * `quality` règle la résolution de rendu (1 = pleine résolution).
 */

/** Échelle partagée des particules (neige marine, bulles…) : leur taille suit la résolution */
export const pointScale = { value: 1 };

const Q = quality();
const BLOOM_LEVELS = Q.bloom;

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Réduction 2x : 4 lectures bilinéaires (13 texels). Karis = pondération anti-lucioles. */
const DownShader = {
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tSrc;
    uniform vec2 uTexel;
    uniform float uKaris;
    varying vec2 vUv;
    vec4 kar(vec3 c) { float w = 1.0 / (1.0 + max(c.r, max(c.g, c.b))); return vec4(c * w, w); }
    vec3 tap(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(24.0)); }
    void main() {
      vec3 a = tap(vec2(-1.0, -1.0)), b = tap(vec2(1.0, -1.0)), c = tap(vec2(-1.0, 1.0)), d = tap(vec2(1.0, 1.0));
      if (uKaris > 0.5) {
        vec4 m = kar(a) + kar(b) + kar(c) + kar(d);
        gl_FragColor = vec4(m.rgb / m.a, 1.0);
      } else {
        gl_FragColor = vec4((a + b + c + d) * 0.25, 1.0);
      }
    }
  `,
};

/** Remontée : filtre en tente, ajouté au niveau supérieur */
const UpShader = {
  uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tSrc;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec2 e = uTexel * 0.75;
      vec3 c = texture2D(tSrc, vUv + vec2(-e.x, -e.y)).rgb + texture2D(tSrc, vUv + vec2(e.x, -e.y)).rgb
             + texture2D(tSrc, vUv + vec2(-e.x, e.y)).rgb + texture2D(tSrc, vUv + vec2(e.x, e.y)).rgb;
      gl_FragColor = vec4(c * 0.25, 1.0);
    }
  `,
};

/**
 * Lumière volumétrique (demi-résolution), d'après les « light shafts » d'Abyssal Garden.
 * On remonte chaque rayon de vue jusqu'au décor (lu dans la profondeur de la scène) et on
 * accumule la lumière diffusée par l'eau :
 *  - rayons du soleil : motif de bandes projeté depuis la surface selon la direction du soleil,
 *    qui s'atténue avec la profondeur ;
 *  - faisceau du phare : cône du projecteur, atténué avec la distance (s'arrête sur les rochers).
 * Un décalage aléatoire par pixel (IGN) remplace les paliers par un grain, lissé ensuite.
 */
const RaysShader = {
  uniforms: {
    tDepth: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uNear: { value: 0.1 },
    uFar: { value: 130 },
    uTime: { value: 0 },
    uSun: { value: 0 }, // force des rayons du soleil
    uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
    uSunCol: { value: new THREE.Color() },
    uDensity: { value: 0.03 },
    uSpotPos: { value: new THREE.Vector3() },
    uSpotDir: { value: new THREE.Vector3(0, 0, 1) },
    uSpotCos: { value: 0.88 },
    uSpot: { value: 0 }, // force du faisceau
    uSpotCol: { value: new THREE.Color('#efe3bb') },
    uRes: { value: new THREE.Vector2() },
  },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDepth;
    uniform mat4 uInvProj, uCamWorld;
    uniform vec3 uCamPos, uSunDir, uSunCol, uSpotPos, uSpotDir, uSpotCol;
    uniform float uNear, uFar, uTime, uSun, uDensity, uSpotCos, uSpot;
    uniform vec2 uRes;
    varying vec2 vUv;
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
    }
    // Motif des rayons : bandes lumineuses projetées depuis la surface, qui ondulent lentement
    float shafts(vec3 p) {
      vec2 q = p.xz - uSunDir.xz * (p.y / uSunDir.y);
      float a = vn(q / 7.0 + vec2(uTime * 0.05, uTime * 0.03));
      float b = vn(q.yx / 17.0 - vec2(uTime * 0.02, 0.0) + 4.1);
      return smoothstep(0.55, 0.85, a) * smoothstep(0.25, 0.7, b) * 1.6;
    }
    void main() {
      float z = texture2D(tDepth, vUv).x;
      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      vp /= vp.w;
      float sceneDist = z >= 0.9999 ? 1e4 : length(vp.xyz);
      vec3 rd = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);
      vec3 acc = vec3(0.0);
      float j = ign(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0);
      float sigma = uDensity * 0.9;

      // --- Rayons du soleil (jusqu'à 90 m, et jamais au-dessus de la surface)
      if (RAY_SUN > 0 && uSun > 0.001) {
        float tm = min(sceneDist, 90.0);
        if (rd.y > 1e-4) tm = min(tm, -uCamPos.y / rd.y);
        const int N = RAY_SUN;
        float dt = tm / float(N);
        for (int n = 0; n < N; n++) {
          float t = (float(n) + j) * dt;
          vec3 p = uCamPos + rd * t;
          float light = exp(p.y * 0.022); // le soleil faiblit avec la profondeur
          acc += uSunCol * shafts(p) * light * exp(-sigma * t) * dt;
        }
        float mu = max(dot(rd, uSunDir), 0.0);
        acc *= uSun * (0.25 + 1.6 * mu * mu * mu) * sigma * 9.0;
      }

      // --- Faisceau du phare (jusqu'à 60 m)
      if (uSpot > 0.001) {
        float tm = min(sceneDist, 60.0);
        const int M = RAY_SPOT;
        float dt = tm / float(M);
        vec3 beam = vec3(0.0);
        for (int n = 0; n < M; n++) {
          float t = (float(n) + j) * dt;
          vec3 p = uCamPos + rd * t;
          vec3 l = p - uSpotPos;
          float d = length(l);
          float cone = smoothstep(uSpotCos, mix(uSpotCos, 1.0, 0.35), dot(l / max(d, 1e-3), uSpotDir));
          beam += cone / (1.0 + d * 0.25 + d * d * 0.03) * exp(-sigma * (t + d)) * dt;
        }
        // Diffusion vers l'avant : plus fort quand on regarde dans le sens du faisceau
        float g = 0.65 + 0.8 * max(dot(rd, uSpotDir), 0.0);
        acc += uSpotCol * beam * uSpot * g * sigma * 1.1;
      }
      gl_FragColor = vec4(min(acc, vec3(20.0)), 1.0);
    }
  `,
};

const CompositeShader = {
  uniforms: {
    tScene: { value: null },
    tBloom: { value: null },
    tRays: { value: null },
    uRaysOn: { value: 0 },
    uExposure: { value: 1 },
    uBloom: { value: 0.09 },
    uDistort: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2() },
  },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform sampler2D tRays;
    uniform float uRaysOn;
    uniform float uExposure;
    uniform float uBloom;
    uniform float uDistort;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 linearToSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }
    // Bruit à gradient entrelacé : un grain fin et régulier, sans motif visible
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
    void main() {
      vec2 uv = vUv;
      if (uDistort > 0.0) {
        uv.x += sin(vUv.y * 38.0 + uTime * 2.7) * 0.0035 * uDistort;
        uv.y += cos(vUv.x * 27.0 + uTime * 1.9) * 0.0025 * uDistort;
      }
      vec3 c = texture2D(tScene, uv).rgb;
      if (uRaysOn > 0.5) {
        // Lumière volumétrique, lissée par un petit flou en croix (cache le grain de l'échantillonnage)
        vec2 e = 1.5 / uRes;
        vec3 r = texture2D(tRays, uv).rgb * 0.4
          + (texture2D(tRays, uv + vec2(e.x, 0.0)).rgb + texture2D(tRays, uv - vec2(e.x, 0.0)).rgb
          + texture2D(tRays, uv + vec2(0.0, e.y)).rgb + texture2D(tRays, uv - vec2(0.0, e.y)).rgb) * 0.15;
        c += r;
      }
      vec3 bl = texture2D(tBloom, uv).rgb;
      // Le bloom adoucit et entoure les sources lumineuses d'un halo diffus (l'eau diffuse la lumière)
      c = mix(c, bl, uBloom * 0.65) + bl * uBloom * 0.35;
      c *= uExposure;
      // Vignettage
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.6;
      c = aces(c);
      // Contraste en S sur la luminance, hautes lumières légèrement désaturées
      float l0 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float l = mix(l0, l0 * l0 * (3.0 - 2.0 * l0), 0.45);
      c *= l / max(l0, 1e-4);
      c = mix(c, vec3(l), smoothstep(0.55, 1.0, l) * 0.12);
      c = linearToSRGB(max(c, vec3(0.0)));
      vec2 fc = vUv * uRes;
      float n = ign(fc) + ign(fc + 37.0) - 1.0;
      gl_FragColor = vec4(c + n / 255.0, 1.0);
    }
  `,
};

function makeMaterial(def) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(def.uniforms),
    vertexShader: def.vertexShader,
    fragmentShader: def.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

export class GameRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    container.appendChild(this.renderer.domElement);
    // Résolution : plafond du niveau de détail × facteur dynamique (résolution auto)
    this.baseScale = Q.scale;
    this.dynScale = Math.min(1, Math.max(0.5, preferences.autoScale ?? 1));
    this.autoRes = true;
    this.frameAcc = 0;
    this.frameCount = 0;
    this.cooldown = 2;
    this.initGpuTimer();
    this.renderer.shadowMap.enabled = Q.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = this.baseScale * this.dynScale;
    this.exposure = 1;

    // Cible pleine résolution, multi-échantillonnée (antialiasing), HalfFloat : la scène est en HDR.
    // La profondeur est conservée pour la lumière volumétrique.
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
    this.target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

    // Lumière volumétrique, en demi-résolution
    this.raysTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.raysMat = makeMaterial(RaysShader);
    this.raysMat.defines = { RAY_SUN: Q.raySun, RAY_SPOT: Math.max(1, Q.raySpot) };
    this.rays = null; // paramètres fournis par la plongée (null = pas de lumière volumétrique)

    // Chaîne du bloom
    this.bloomTargets = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.bloomTargets.push(
        new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false })
      );
    }
    this.downMat = makeMaterial(DownShader);
    this.upMat = makeMaterial(UpShader);
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;
    this.material = makeMaterial(CompositeShader);
    this.quad = new FullScreenQuad(this.material);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Qualité de rendu (0.3 à 1) : résolution relative à l'écran */
  setQuality(q) {
    this.quality = q;
    this.resize();
  }

  /* ------------------------------------------------------------ Mesure du temps GPU */

  /** Requêtes de minutage GPU (si le navigateur les propose) */
  initGpuTimer() {
    const gl = this.renderer.getContext();
    this.gl = gl;
    this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.gpuMs = null;
  }

  beginGpu() {
    if (!this.timerExt || this.queries.length > 4) return;
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    this.currentQuery = q;
  }

  endGpu() {
    const gl = this.gl;
    if (this.currentQuery) {
      gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.queries.push(this.currentQuery);
      this.currentQuery = null;
    }
    // Lit les résultats disponibles (avec quelques images de retard)
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      if (!gl.getParameter(this.timerExt.GPU_DISJOINT_EXT)) {
        const ms = ns / 1e6;
        this.gpuMs = this.gpuMs == null ? ms : this.gpuMs * 0.9 + ms * 0.1;
      }
      gl.deleteQuery(q);
      this.queries.shift();
    }
  }

  /* ------------------------------------------------------------ Résolution auto */

  /**
   * Vise 60 images/s : si les images sont trop lentes, la résolution baisse par petits pas ;
   * s'il reste de la marge (temps GPU bas, ou images régulières), elle remonte doucement.
   * @param {number} dt durée de la dernière image (s)
   */
  adapt(dt) {
    if (!this.autoRes || dt <= 0 || dt > 0.25) return;
    this.frameAcc += dt;
    this.frameCount++;
    this.cooldown -= dt;
    if (this.frameAcc < 1.5) return;
    const ms = (this.frameAcc / this.frameCount) * 1000;
    this.frameAcc = 0;
    this.frameCount = 0;
    if (this.cooldown > 0) return;
    let next = this.dynScale;
    if (ms > 18.5) next -= ms > 28 ? 0.12 : 0.06;
    else if (this.gpuMs != null ? this.gpuMs < 9 : ms < 17.2) next += 0.04;
    next = Math.min(1, Math.max(0.5, next));
    if (Math.abs(next - this.dynScale) > 0.001) {
      this.cooldown = next < this.dynScale ? 1.5 : 4;
      this.dynScale = next;
      this.setQuality(this.baseScale * next);
      preferences.autoScale = next;
      savePreferences();
    }
  }

  /** Résolution auto activée ou non (désactivée : pleine résolution du niveau de détail) */
  setAutoRes(on) {
    this.autoRes = on;
    if (!on && this.dynScale !== 1) {
      this.dynScale = 1;
      this.setQuality(this.baseScale);
    }
  }

  /** Exposition (1 = neutre) : suit la profondeur, comme l'œil qui s'adapte */
  setExposure(e) {
    this.exposure = e;
  }

  /** Ondulation de l'image (0 = aucune) */
  setDistortion(amount, time) {
    this.material.uniforms.uDistort.value = amount;
    this.material.uniforms.uTime.value = time;
  }

  get aspect() {
    return window.innerWidth / window.innerHeight;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h);
    const tw = Math.max(1, Math.round(w * ratio));
    const th = Math.max(1, Math.round(h * ratio));
    this.target.setSize(tw, th);
    this.raysTarget.setSize(Math.max(1, tw >> 1), Math.max(1, th >> 1));
    let bw = tw, bh = th;
    for (const t of this.bloomTargets) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      t.setSize(bw, bh);
    }
    this.material.uniforms.uRes.value.set(tw, th);
    // Les particules étaient pensées pour une image de 240 px de haut
    pointScale.value = th / 240;
    this.onResize?.(w / h);
  }

  /** Bloom : réductions successives puis remontée additive */
  renderBloom() {
    const r = this.renderer;
    this.quad.material = this.downMat;
    let src = this.target;
    this.bloomTargets.forEach((t, i) => {
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.downMat.uniforms.uKaris.value = i === 0 ? 1 : 0;
      r.setRenderTarget(t);
      this.quad.render(r);
      src = t;
    });
    this.quad.material = this.upMat;
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
      const from = this.bloomTargets[i], to = this.bloomTargets[i - 1];
      this.upMat.uniforms.tSrc.value = from.texture;
      this.upMat.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
      r.setRenderTarget(to);
      r.autoClear = false;
      this.quad.render(r);
      r.autoClear = true;
    }
  }

  /**
   * Paramètres de la lumière volumétrique pour la prochaine image (ou null).
   * { time, sun, sunColor, density, spotPos, spotDir, spotCos, spot }
   */
  setRays(params) {
    this.rays = params;
  }

  renderRays(camera) {
    const u = this.raysMat.uniforms, p = this.rays;
    u.tDepth.value = this.target.depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uTime.value = p.time;
    u.uSun.value = p.sun;
    u.uSunCol.value.copy(p.sunColor);
    u.uDensity.value = p.density;
    u.uSpotPos.value.copy(p.spotPos);
    u.uSpotDir.value.copy(p.spotDir);
    u.uSpotCos.value = p.spotCos;
    u.uSpot.value = p.spot;
    this.quad.material = this.raysMat;
    this.renderer.setRenderTarget(this.raysTarget);
    this.quad.render(this.renderer);
  }

  render(scene, camera) {
    const r = this.renderer;
    this.beginGpu();
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    const raysOn = !!this.rays && (this.rays.sun > 0.001 || this.rays.spot > 0.001);
    if (raysOn) this.renderRays(camera);
    this.renderBloom();
    r.setRenderTarget(null);
    const u = this.material.uniforms;
    u.tScene.value = this.target.texture;
    u.tBloom.value = this.bloomTargets[0].texture;
    u.uExposure.value = this.exposure;
    u.tRays.value = this.raysTarget.texture;
    u.uRaysOn.value = raysOn ? 1 : 0;
    this.quad.material = this.material;
    this.quad.render(r);
    this.endGpu();
  }
}
