import * as THREE from 'three';
import { createItemModel } from '../loot/models.js';

/**
 * Génère une vignette pour chaque objet (pour l'inventaire).
 * On rend chaque modèle dans un coin du canvas WebGL puis on le recopie
 * aussitôt dans un petit canvas 2D (le tampon WebGL est encore valide dans la même tâche).
 * À appeler avant la première frame, pendant le fondu au noir.
 */
const SIZE = 96;
const BG = '#0c1a22';

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
  const ratio = renderer.getPixelRatio(); // le viewport est en pixels CSS
  const prevViewport = renderer.getViewport(new THREE.Vector4());
  renderer.setRenderTarget(null);
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, SIZE / ratio, SIZE / ratio);
  renderer.setScissor(0, 0, SIZE / ratio, SIZE / ratio);

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
    out.set(item.id, c.toDataURL());

    scene.remove(object);
    object.traverse((o) => o.geometry?.dispose());
    materials.forEach((m) => m.dispose());
  }

  renderer.setScissorTest(false);
  renderer.setViewport(prevViewport);
  return out;
}
