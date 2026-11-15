import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

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

const BLOOM_LEVELS = 6;

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

const CompositeShader = {
  uniforms: {
    tScene: { value: null },
    tBloom: { value: null },
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
    this.quality = 1;
    this.exposure = 1;

    // Cible pleine résolution, multi-échantillonnée (antialiasing), HalfFloat : la scène est en HDR
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });

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

  /** Qualité de rendu (0.5 à 1) : résolution relative à l'écran */
  setQuality(q) {
    this.quality = q;
    this.resize();
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

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    this.renderBloom();
    r.setRenderTarget(null);
    const u = this.material.uniforms;
    u.tScene.value = this.target.texture;
    u.tBloom.value = this.bloomTargets[0].texture;
    u.uExposure.value = this.exposure;
    this.quad.material = this.material;
    this.quad.render(r);
  }
}
