import * as THREE from 'three';
import { DECOR, WORLD, SEABED } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';
import { createLandmarks } from './landmarks.js';
import { applyDetail } from './detail.js';
import { tileKey } from './tiles.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFlora } from './flora.js';
import { createBottomFauna } from './bottomFauna.js';
import { createProps } from './props.js';
import { gpuMode } from '../gpu/mode.js';
import { createFormations } from './formations.js';

const rand = createRandom(WORLD.SEED + 7);
const noise = createNoise2D(WORLD.SEED + 3);

/** Position aléatoire sur toute la surface du fond (un peu au-delà de la zone navigable) */
function randomFloorPoint() {
  const x = rand.range(-SEABED.WIDTH / 2 + 10, SEABED.WIDTH / 2 - 10);
  const z = rand.range(SEABED.Z_END + 10, SEABED.Z_START - 10);
  return { x, z, y: getFloorHeight(x, z) };
}

/* ---------------------------------------------------------------- Rochers */

/**
 * Rocher organique : icosaèdre subdivisé, déformé par un bruit 3D (bosses, arêtes),
 * légèrement aplati ; normales lisses. Le détail fin vient de la texture triplanaire.
 */
function createRockGeometry(seed) {
  const n1 = createNoise2D(seed), n2 = createNoise2D(seed + 1);
  let geo = new THREE.IcosahedronGeometry(1, 2);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const big = n1(v.x * 1.3 + v.z * 0.7, v.y * 1.3 + seed) * 0.22;
    const ridge = (1 - Math.abs(n2(v.x * 2.4 - v.z, v.y * 2.4 + v.z))) * 0.14;
    const k = 0.85 + big + ridge;
    pos.setXYZ(i, v.x * k, v.y * k * (v.y < 0 ? 0.55 : 0.8), v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function createRocks(colliders) {
  const group = new THREE.Group();
  const material = applyDetail(new THREE.MeshLambertMaterial({ color: '#6b6e6a' }), 'rock', 1);
  const variants = 4;
  const perVariant = Math.ceil(DECOR.ROCKS / variants);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const tint = new THREE.Color();

  for (let v = 0; v < variants; v++) {
    const geo = createRockGeometry(WORLD.SEED + v * 13);
    const tiles = new Map(); // rochers regroupés par tuile (culling hors champ)
    for (let i = 0; i < perVariant; i++) {
      const pt = randomFloorPoint();
      // Quelques gros blocs, beaucoup de petits
      const size = rand() < 0.12 ? rand.range(4, 9) : rand.range(0.6, 2.6);
      s.set(size * rand.range(0.8, 1.4), size * rand.range(0.7, 1.2), size * rand.range(0.8, 1.4));
      e.set(rand.range(-0.3, 0.3), rand() * Math.PI * 2, rand.range(-0.3, 0.3));
      q.setFromEuler(e);
      p.set(pt.x, pt.y + s.y * 0.25, pt.z);
      m.compose(p, q, s);
      // Teintes de granit variées : gris, gris-brun, gris-vert
      const t = rand.range(0.8, 1.2);
      tint.setRGB(t * rand.range(0.9, 1.08), t * rand.range(0.92, 1.05), t * rand.range(0.9, 1.0));
      const key = tileKey(p.x, p.z);
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push({ m: m.clone(), c: tint.clone() });
      if (size > 1.4) colliders.push({ x: p.x, y: p.y, z: p.z, r: Math.min(s.x, s.z) * 0.85 });
    }
    for (const list of tiles.values()) {
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
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
  const rocks = createRocks(colliders);
  group.add(rocks);
  const landmarks = createLandmarks(colliders, uniforms);
  group.add(landmarks);
  // En WebGPU, les plantes sont dessinées par le jardin (src/gpu/garden.js)
  if (!gpuMode.active) group.add(createFlora());
  group.add(createBottomFauna());
  const props = createProps(colliders);
  group.add(props);
  // Relief sculpté (arches, piliers, surplombs), coraux et éponges
  const formations = createFormations(colliders);
  group.add(formations);
  // Ombres : rochers, épaves et débris en portent et en reçoivent ; la flore en reçoit seulement
  for (const g of [rocks, landmarks, props, formations]) g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return {
    group,
    colliders,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
