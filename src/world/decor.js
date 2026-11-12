import * as THREE from 'three';
import { DECOR, WORLD, SEABED } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';
import { createLandmarks } from './landmarks.js';
import { createFlora } from './flora.js';
import { createBottomFauna } from './bottomFauna.js';

const rand = createRandom(WORLD.SEED + 7);
const noise = createNoise2D(WORLD.SEED + 3);

/** Position aléatoire sur toute la surface du fond (un peu au-delà de la zone navigable) */
function randomFloorPoint() {
  const x = rand.range(-SEABED.WIDTH / 2 + 10, SEABED.WIDTH / 2 - 10);
  const z = rand.range(SEABED.Z_END + 10, SEABED.Z_START - 10);
  return { x, z, y: getFloorHeight(x, z) };
}

/* ---------------------------------------------------------------- Rochers */

/** Icosaèdre déformé : les sommets partagés bougent ensemble pour ne pas ouvrir de trous */
function createRockGeometry(seed) {
  const n = createNoise2D(seed);
  const geo = new THREE.IcosahedronGeometry(1, seed % 2); // détail 0 ou 1
  const pos = geo.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 0.75 + (n(x * 1.7 + z, y * 1.7) * 0.5 + 0.5) * 0.5);
    const k = offsets.get(key);
    pos.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  geo.computeVertexNormals();
  const c = new THREE.Color();
  paintFaces(geo, (center) => {
    const v = 0.85 + rand() * 0.3;
    // Le dessus des rochers est légèrement verdi
    return center.y > 0.45 ? c.setRGB(0.12 * v, 0.17 * v, 0.12 * v) : c.setRGB(0.13 * v, 0.14 * v, 0.145 * v);
  });
  return geo;
}

function createRocks(colliders) {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const variants = 4;
  const perVariant = Math.ceil(DECOR.ROCKS / variants);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const tint = new THREE.Color();

  for (let v = 0; v < variants; v++) {
    const mesh = new THREE.InstancedMesh(createRockGeometry(WORLD.SEED + v * 13), material, perVariant);
    for (let i = 0; i < perVariant; i++) {
      const pt = randomFloorPoint();
      // Quelques gros blocs, beaucoup de petits
      const size = rand() < 0.12 ? rand.range(4, 9) : rand.range(0.6, 2.6);
      s.set(size * rand.range(0.8, 1.4), size * rand.range(0.7, 1.2), size * rand.range(0.8, 1.4));
      e.set(rand.range(-0.3, 0.3), rand() * Math.PI * 2, rand.range(-0.3, 0.3));
      q.setFromEuler(e);
      p.set(pt.x, pt.y + s.y * 0.25, pt.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      const t = rand.range(0.85, 1.2);
      mesh.setColorAt(i, tint.setRGB(t, t, t));
      if (size > 1.4) colliders.push({ x: p.x, y: p.y, z: p.z, r: Math.min(s.x, s.z) * 0.85 });
    }
    group.add(mesh);
  }
  return group;
}

/**
 * Crée tout le décor statique.
 * `colliders` reçoit les gros rochers (sphères) pour les collisions du sous-marin.
 */
export function createDecor() {
  const uniforms = { uTime: { value: 0 } };
  const colliders = [];
  const group = new THREE.Group();
  group.add(createRocks(colliders));
  const landmarks = createLandmarks(colliders, uniforms);
  group.add(landmarks);
  group.add(createFlora());
  group.add(createBottomFauna());
  return {
    group,
    colliders,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
