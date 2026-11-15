/**
 * Planche de présentation (outil de développement, hors du jeu) : affiche des maquettes côte à côte.
 * bestiary.html?set=abyss (créatures des fonds, par défaut) | guardian | people
 */
import * as THREE from 'three';
import { installWaterFog } from '../core/waterFog.js';
installWaterFog();
const { createDetailTexture } = await import('../world/detail.js');
const { ABYSS_MODELS } = await import('../world/abyssModels.js');
const { createGuardianPreview } = await import('../world/guardian.js');
const { createCharacter, LOOKS } = await import('../port/characters.js');

const set = new URLSearchParams(location.search).get('set') ?? 'abyss';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);
createDetailTexture(renderer);

let items;
if (set === 'guardian') items = [{ name: 'Le gardien — gueule ouverte', make: () => createGuardianPreview(0.85), view: [0.9, 0.25, 1] }, { name: 'Le gardien — de profil, gueule close', make: () => createGuardianPreview(0.08), view: [1, 0.3, 0.25] }];
else if (set === 'people') items = Object.entries(LOOKS).map(([id, look]) => ({ name: id, make: () => createCharacter(look).object, view: [0.5, 0.25, 1] }));
else items = ABYSS_MODELS.map((m) => ({ ...m, view: m.id === 'glaneuse' ? [0.9, 0.25, 1] : m.id === 'linceul' ? [0.6, 0.5, 1] : m.id === "choeur" ? [0.35, 0.15, 1] : m.id === "chapelet" ? [1, 0.35, 0.5] : [0.8, 0.45, 1] }));

const cols = Math.min(3, items.length), rows = Math.ceil(items.length / cols);
const tiles = items.map((it, i) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06131a');
  scene.fog = new THREE.FogExp2('#06131a', 0.0001);
  scene.add(new THREE.HemisphereLight('#9fc8d8', '#101820', 1.6));
  const key = new THREE.DirectionalLight('#fff0d8', 2.6);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7fe0c0', 1.6);
  rim.position.set(-2.5, 1, -2);
  scene.add(rim);
  const obj = it.make();
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(32, 1, size * 0.01, size * 20);
  const dir = new THREE.Vector3(...it.view).normalize();
  cam.position.copy(c).addScaledVector(dir, size * 1.75);
  cam.lookAt(c);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = `${set === 'abyss' ? i + 1 + ' · ' : ''}${it.name}`;
  document.body.appendChild(tag);
  return { scene, cam, tag };
});

function frame() {
  const W = innerWidth, H = innerHeight, w = W / cols, h = H / rows;
  renderer.setScissorTest(true);
  tiles.forEach((t, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    renderer.setViewport(cx * w, H - (cy + 1) * h, w, h);
    renderer.setScissor(cx * w + 2, H - (cy + 1) * h + 2, w - 4, h - 4);
    t.cam.aspect = w / h;
    t.cam.updateProjectionMatrix();
    t.tag.style.left = `${cx * w + 6}px`;
    t.tag.style.top = `${cy * h + 6}px`;
    renderer.render(t.scene, t.cam);
  });
  window.__ready = true;
}
frame();
