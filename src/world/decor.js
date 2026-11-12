import * as THREE from 'three';
import { DECOR, WORLD, SEABED } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';
import { createLandmarks } from './landmarks.js';

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

/* ---------------------------------------------------------------- Algues */

const ALGAE_COLORS = ['#2f4a33', '#46613f', '#3b4f2a', '#5a5a2e', '#2c4430'].map((h) => new THREE.Color(h));

function createAlgae(uniforms) {
  // Lame : cylindre très effilé à 3 faces, base à y = 0, hauteur 1
  const geo = new THREE.CylinderGeometry(0.03, 0.22, 1, 3, 5, true);
  geo.translate(0, 0.5, 0);

  const material = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  // Ondulation dans le vertex shader : plus on monte sur la lame, plus elle bouge
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 rootW = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = position.y;
        float phase = uTime * 1.1 + rootW.x * 0.21 + rootW.z * 0.17;
        transformed.x += sin(phase) * h * h * 0.35;
        transformed.z += cos(phase * 0.8 + 1.3) * h * h * 0.25;`
      );
  };

  // Compte total
  const clumps = [];
  let total = 0;
  for (let c = 0; c < DECOR.ALGAE_CLUMPS * 3 && clumps.length < DECOR.ALGAE_CLUMPS; c++) {
    const pt = randomFloorPoint();
    if (-pt.y > DECOR.ALGAE_MAX_DEPTH) continue;
    if (noise(pt.x * 0.02, pt.z * 0.02) < -0.2) continue; // regroupe les champs d'algues
    const count = rand.int(DECOR.ALGAE_PER_CLUMP[0], DECOR.ALGAE_PER_CLUMP[1]);
    clumps.push({ ...pt, count });
    total += count;
  }

  const mesh = new THREE.InstancedMesh(geo, material, total);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  let idx = 0;
  for (const clump of clumps) {
    const color = rand.pick(ALGAE_COLORS);
    for (let i = 0; i < clump.count; i++) {
      const x = clump.x + rand.range(-3, 3);
      const z = clump.z + rand.range(-3, 3);
      p.set(x, getFloorHeight(x, z) - 0.2, z);
      const h = rand.range(1.5, 6.5) * (1 - (-p.y / DECOR.ALGAE_MAX_DEPTH) * 0.5);
      const w = rand.range(0.7, 1.4);
      s.set(w, h, w);
      e.set(rand.range(-0.15, 0.15), rand() * Math.PI * 2, rand.range(-0.15, 0.15));
      q.setFromEuler(e);
      m.compose(p, q, s);
      mesh.setMatrixAt(idx, m);
      mesh.setColorAt(idx, color.clone().multiplyScalar(rand.range(0.8, 1.2)));
      idx++;
    }
  }
  return mesh;
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
  group.add(createAlgae(uniforms));
  const landmarks = createLandmarks(colliders, uniforms);
  group.add(landmarks);
  return {
    group,
    colliders,
    update(time) {
      uniforms.uTime.value = time;
    },
  };
}
