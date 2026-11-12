import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { PixelShader } from './pixelShader.js';
import { RENDER } from '../config/settings.js';
import paletteData from '../config/palette.json';
import { hexToSRGBVector } from './utils.js';

/**
 * Renderer pixelisé :
 * la scène est rendue dans une texture basse résolution (NearestFilter),
 * puis affichée en plein écran à travers le shader palette + dithering.
 */
export class PixelRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); // inutile de rendre plus fin : l'image finale est volontairement grossière
    container.appendChild(this.renderer.domElement);

    this.pixelHeight = RENDER.PIXEL_HEIGHT;

    // Cible basse résolution. HalfFloat pour garder de la précision dans les noirs profonds.
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });

    const palette = paletteData.colors.map(hexToSRGBVector);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PixelShader.uniforms),
      vertexShader: PixelShader.vertexShader,
      fragmentShader: PixelShader.fragmentShader,
      defines: { PALETTE_SIZE: palette.length },
      depthTest: false,
      depthWrite: false,
    });
    this.material.uniforms.uPalette.value = palette;
    this.material.uniforms.uResolution.value = new THREE.Vector2();
    this.material.uniforms.uDither.value = RENDER.DITHER;
    this.material.uniforms.uPaletteMix.value = RENDER.PALETTE_MIX;
    this.material.uniforms.uSaturation.value = RENDER.SATURATION;
    this.material.uniforms.tDiffuse.value = this.target.texture;

    this.quad = new FullScreenQuad(this.material);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Change la résolution interne (utile pour les réglages de la phase 8). */
  setPixelHeight(height) {
    this.pixelHeight = height;
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
    this.renderer.setSize(w, h);
    const lowH = this.pixelHeight;
    const lowW = Math.max(1, Math.round(lowH * (w / h)));
    this.target.setSize(lowW, lowH);
    this.material.uniforms.uResolution.value.set(lowW, lowH);
    this.onResize?.(w / h);
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }
}
