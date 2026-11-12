import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Renderer du jeu : rendu net en pleine résolution, avec antialiasing (MSAA),
 * puis une passe finale légère : ondulation de l'image près du portail (radiation),
 * conversion sRGB et vignettage.
 * `quality` règle la résolution de rendu (1 = pleine résolution).
 */

/** Échelle partagée des particules (neige marine, bulles…) : leur taille suit la résolution */
export const pointScale = { value: 1 };

const PostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDistort: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDistort;
    uniform float uTime;
    varying vec2 vUv;
    vec3 linearToSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }
    void main() {
      vec2 uv = vUv;
      if (uDistort > 0.0) {
        uv.x += sin(vUv.y * 38.0 + uTime * 2.7) * 0.0035 * uDistort;
        uv.y += cos(vUv.x * 27.0 + uTime * 1.9) * 0.0025 * uDistort;
      }
      vec3 col = linearToSRGB(clamp(texture2D(tDiffuse, uv).rgb, 0.0, 1.0));
      // Vignettage doux, comme à travers un hublot
      float v = smoothstep(1.25, 0.45, length(vUv - 0.5) * 1.6);
      gl_FragColor = vec4(col * mix(0.55, 1.0, v), 1.0);
    }
  `,
};

export class GameRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    container.appendChild(this.renderer.domElement);
    this.quality = 1;

    // Cible pleine résolution, multi-échantillonnée (antialiasing), HalfFloat pour les noirs profonds
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PostShader.uniforms),
      vertexShader: PostShader.vertexShader,
      fragmentShader: PostShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.material.uniforms.tDiffuse.value = this.target.texture;
    this.quad = new FullScreenQuad(this.material);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Qualité de rendu (0.5 à 1) : résolution relative à l'écran */
  setQuality(q) {
    this.quality = q;
    this.resize();
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
    // Les particules étaient pensées pour une image de 240 px de haut
    pointScale.value = th / 240;
    this.onResize?.(w / h);
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }
}
