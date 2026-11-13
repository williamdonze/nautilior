import * as THREE from 'three';
import { WORLD, SEABED } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { getFloorHeight } from './seabed.js';
import { tileKey, registerSmall } from './tiles.js';

/**
 * Petit peuple du fond : étoiles de mer et crabes posés sur le sable et les rochers
 * (récif et épaves). Purement décoratif, instancié.
 */
const lambert = (opts) => new THREE.MeshLambertMaterial({ flatShading: true, ...opts });

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.16 : 0.5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function crabGeometry() {
  // Carapace, pattes et pinces fusionnées dans une seule géométrie
  const parts = [];
  const shell = new THREE.SphereGeometry(0.35, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(1.3, 0.6, 1);
  parts.push(shell);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.BoxGeometry(0.42, 0.05, 0.05);
      leg.rotateZ(s * -0.6);
      leg.translate(s * 0.5, -0.05, -0.15 + i * 0.15);
      parts.push(leg);
    }
    const claw = new THREE.BoxGeometry(0.18, 0.1, 0.28);
    claw.translate(s * 0.32, 0.03, 0.42);
    parts.push(claw);
  }
  const pos = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    pos.push(...g.attributes.position.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Répartit des instances sur le fond, regroupées par bandes de 140 m (culling hors champ) */
function scatter(group, geo, material, count, colors, maxDepth, sizeRange, rand) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const bands = new Map();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 30) {
    tries++;
    const x = rand.range(-SEABED.WIDTH / 2 + 15, SEABED.WIDTH / 2 - 15);
    const z = rand.range(-560, SEABED.Z_START - 15);
    const y = getFloorHeight(x, z);
    if (-y > maxDepth) continue;
    p.set(x, y + 0.02, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.setScalar(rand.range(sizeRange[0], sizeRange[1]));
    const band = tileKey(x, z);
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push({ matrix: m.compose(p, q, s).clone(), color: new THREE.Color(rand.pick(colors)).multiplyScalar(rand.range(0.85, 1.15)) });
    placed++;
  }
  for (const list of bands.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix);
      mesh.setColorAt(i, it.color);
    });
    mesh.computeBoundingSphere();
    registerSmall(mesh, 45);
    group.add(mesh);
  }
}

export function createBottomFauna() {
  const rand = createRandom(WORLD.SEED + 55);
  const group = new THREE.Group();
  scatter(group, starGeometry(), lambert({}), 700, ['#b07a47', '#8a4f28', '#a070b8', '#c08850', '#7a5a26'], 450, [0.5, 1.3], rand);
  scatter(group, crabGeometry(), lambert({}), 300, ['#8a4f28', '#63321b', '#6b6e6c', '#7d6f48'], 520, [0.7, 1.6], rand);
  return group;
}
