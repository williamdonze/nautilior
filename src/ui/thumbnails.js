import * as THREE from 'three';
import { createItemModel } from '../loot/models.js';
import paletteData from '../config/palette.json';

/**
 * Génère une vignette pixelisée pour chaque objet (pour l'inventaire).
 * On rend chaque modèle dans un coin du canvas WebGL puis on le recopie
 * aussitôt dans un petit canvas 2D (le tampon WebGL est encore valide dans la même tâche).
 * À appeler avant la première frame, pendant le fondu au noir.
 */
const SIZE = 40;
const BG = '#0c1a22';

const PALETTE = paletteData.colors.map((h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Même traitement que le shader : dithering + palette */
function quantize(ctx) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const t = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 14;
      const r = d[i] + t, g = d[i + 1] + t, b = d[i + 2] + t;
      let best = PALETTE[0], bestDist = Infinity;
      for (const p of PALETTE) {
        const dr = (r - p[0]) * 0.55, dg = (g - p[1]) * 0.8, db = (b - p[2]) * 0.45;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; best = p; }
      }
      d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2];
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {object[]} items
 * @returns {Map<string, string>} id → dataURL
 */
export function renderThumbnails(renderer, items) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight('#ccd8cc', '#1a2a20', 2.2));
  const key = new THREE.DirectionalLight('#efe3bb', 2.2);
  key.position.set(2, 3, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);

  const out = new Map();
  const glCanvas = renderer.domElement;
  const prevViewport = renderer.getViewport(new THREE.Vector4());
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, SIZE, SIZE);
  renderer.setScissor(0, 0, SIZE, SIZE);

  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  for (const item of items) {
    const { object, materials } = createItemModel(item);
    scene.add(object);
    object.updateMatrixWorld(true);
    box.setFromObject(object).getBoundingSphere(sphere);
    camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.9, 1.3).normalize().multiplyScalar(sphere.radius * 3.6));
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);

    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(glCanvas, 0, glCanvas.height - SIZE, SIZE, SIZE, 0, 0, SIZE, SIZE);
    quantize(ctx);
    out.set(item.id, c.toDataURL());

    scene.remove(object);
    object.traverse((o) => o.geometry?.dispose());
    materials.forEach((m) => m.dispose());
  }

  renderer.setScissorTest(false);
  renderer.setViewport(prevViewport);
  return out;
}
