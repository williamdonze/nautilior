import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD, SEABED, SUBMARINE, RADIATION, stretchZ } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';
import { applyDetail } from './detail.js';
import { tileKey, registerSmall } from './tiles.js';
import { WRECK_SPOTS } from './landmarks.js';
import { quality } from '../save/preferences.js';

/**
 * Relief sculpté et vie fixée : ce que le fond en « champ de hauteur » ne sait pas faire.
 *  - arches de roche sous lesquelles on passe, aiguilles et piliers, dalles en surplomb sur les parois ;
 *  - coraux (branchus, cerveaux, tables, gorgones) et éponges (tubes, barils), en massifs.
 * Les grosses formations ont des collisions (sphères) ; coraux et éponges n'en ont pas.
 */
const rand = createRandom(WORLD.SEED + 2024);
const noise = createNoise2D(WORLD.SEED + 61);
const TAU = Math.PI * 2;

/** Bosselle une géométrie le long de ses normales (bruit 3D approché) et relisse */
function roughen(geo, amount, freq = 1.6, seed = 0) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  geo = mergeVertices(geo);
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = noise(x * freq + seed, y * freq + z * freq * 0.7) * 0.6 + noise(z * freq * 2.3 - seed, x * freq * 2.1 + y * freq * 1.7) * 0.4
      + (1 - Math.abs(noise(x * freq * 0.9 + y, z * freq * 0.9 - seed))) * 0.35;
    p.setXYZ(i, x + n.getX(i) * d * amount, y + n.getY(i) * d * amount, z + n.getZ(i) * d * amount);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------ Géométries de roche (taille ≈ 1) */

/** Arche : demi-anneau dans le plan XY, pieds épais, clef de voûte irrégulière */
function archGeometry(seed) {
  const geo = new THREE.TorusGeometry(1, 0.2, 12, 36, Math.PI);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(y, x), k = 1 + 0.9 * Math.pow(1 - Math.sin(a), 2); // plus épais près des pieds
    const cx = Math.cos(a), cy = Math.sin(a);
    p.setXYZ(i, cx + (x - cx) * k, cy * 0.85 + (y - cy) * k, z * k * 1.3);
  }
  return roughen(geo, 0.12, 2.2, seed);
}
/** Aiguille / pilier : colonne qui s'affine, base évasée */
function pillarGeometry(seed) {
  const geo = new THREE.CylinderGeometry(0.42, 1, 1, 14, 10);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + 0.25 * Math.sin(y * 9 + seed) - 0.2 * y;
    p.setXYZ(i, p.getX(i) * k + Math.sin(y * 3 + seed) * 0.12, y, p.getZ(i) * k + Math.cos(y * 2.3 + seed) * 0.12);
  }
  return roughen(geo, 0.14, 2.6, seed);
}
/** Dalle en surplomb : bloc aplati, bord effilé */
function ledgeGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  geo.scale(1, 0.3, 0.75);
  return roughen(geo, 0.1, 2.4, seed);
}

/* ------------------------------------------------------------------ Coraux et éponges (taille ≈ 1, pied en y = 0) */

/** Ajoute la couleur par sommet = ombrage de creux (plus sombre à la base et dans les replis) */
function shadeAo(geo, fn) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = Math.max(0.15, Math.min(1, fn(p.getX(i), p.getY(i), p.getZ(i)))); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
function merge(parts) {
  let n = 0, ni = 0;
  for (const g of parts) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o;
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
/** Corail branchu : branches qui se divisent */
function branchCoral(seed) {
  const r = createRandom(seed), parts = [];
  const grow = (base, dir, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.6, rad, len, 6, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(base.x, base.y, base.z);
    parts.push(g);
    const tip = base.clone().addScaledVector(dir, len);
    if (depth > 0) for (let i = 0; i < 2 + (r() < 0.4 ? 1 : 0); i++) {
      const d = dir.clone().add(new THREE.Vector3(r.range(-0.8, 0.8), r.range(0, 0.5), r.range(-0.8, 0.8))).normalize();
      grow(tip, d, len * r.range(0.6, 0.85), rad * 0.62, depth - 1);
    } else { const s = new THREE.SphereGeometry(rad * 0.75, 6, 4); s.translate(tip.x, tip.y, tip.z); parts.push(s); }
  };
  for (let i = 0; i < 3; i++) grow(new THREE.Vector3(r.range(-0.1, 0.1), 0, r.range(-0.1, 0.1)), new THREE.Vector3(r.range(-0.4, 0.4), 1, r.range(-0.4, 0.4)).normalize(), 0.3, 0.07, 3);
  return shadeAo(merge(parts), (x, y) => 0.25 + y * 0.9);
}
/** Corail cerveau : dôme sillonné */
function brainCoral(seed) {
  const geo = new THREE.SphereGeometry(0.5, 28, 16, 0, TAU, 0, Math.PI * 0.6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const groove = Math.sin(x * 26 + Math.sin(z * 14 + seed) * 2.2) * Math.sin(z * 22 + Math.sin(x * 12) * 2);
    const k = 1 + groove * 0.035 + noise(x * 3 + seed, z * 3) * 0.1;
    p.setXYZ(i, x * k, (y + 0.15) * k * 0.8, z * k);
  }
  geo.computeVertexNormals();
  return shadeAo(geo, (x, y, z) => 0.45 + y * 0.9 + Math.sin(x * 26 + Math.sin(z * 14 + seed) * 2.2) * Math.sin(z * 22 + Math.sin(x * 12) * 2) * 0.3);
}
/** Corail table : plateau ondulé sur un pied */
function tableCoral(seed) {
  const top = new THREE.CylinderGeometry(0.6, 0.45, 0.07, 24, 1);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); p.setY(i, p.getY(i) + 0.42 + d * 0.18 + noise(x * 4 + seed, z * 4) * 0.05); p.setX(i, x * (1 + noise(Math.atan2(z, x) * 2, seed) * 0.15)); }
  top.computeVertexNormals();
  const stem = new THREE.CylinderGeometry(0.1, 0.16, 0.45, 8, 1).translate(0, 0.22, 0);
  return shadeAo(merge([top, stem]), (x, y, z) => (y > 0.4 ? 0.6 + Math.hypot(x, z) * 0.7 : 0.3));
}
/** Gorgone : éventail plat finement nervuré */
function fanCoral(seed) {
  const geo = new THREE.CircleGeometry(0.6, 20, 0.35, Math.PI - 0.7);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x * (1 + noise(x * 5 + seed, y * 5) * 0.2), y, Math.sin(x * 4 + seed) * 0.06 + noise(x * 3, y * 3 + seed) * 0.05); }
  geo.computeVertexNormals();
  const stem = new THREE.CylinderGeometry(0.02, 0.035, 0.2, 5, 1).translate(0, 0.08, 0);
  return shadeAo(merge([geo, stem]), (x, y) => 0.35 + y * 1.1 * (0.7 + 0.3 * Math.abs(Math.sin(Math.atan2(y, x) * 14))));
}
/** Éponges tubes : bouquet de cheminées ouvertes */
function tubeSponge(seed) {
  const r = createRandom(seed), parts = [];
  const n = 3 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const h = r.range(0.4, 1), rad = r.range(0.07, 0.13);
    const prof = [[rad * 0.6, 0], [rad, h * 0.5], [rad * 1.15, h], [rad * 0.8, h], [rad * 0.6, h * 0.5]].map(([a, b]) => new THREE.Vector2(a, b));
    const g = new THREE.LatheGeometry(prof, 10);
    g.rotateZ(r.range(-0.25, 0.25)); g.rotateX(r.range(-0.25, 0.25));
    g.translate(r.range(-0.18, 0.18), 0, r.range(-0.18, 0.18));
    parts.push(g);
  }
  return shadeAo(merge(parts), (x, y) => 0.3 + y * 0.8);
}
/** Éponge baril : gros vase côtelé */
function barrelSponge(seed) {
  const prof = [[0.2, 0], [0.42, 0.25], [0.48, 0.6], [0.4, 0.85], [0.3, 0.85], [0.3, 0.45], [0.05, 0.3]].map(([a, b]) => new THREE.Vector2(a, b));
  const geo = new THREE.LatheGeometry(prof, 22);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = 1 + Math.sin(Math.atan2(z, x) * 11 + seed) * 0.05; p.setX(i, x * k); p.setZ(i, z * k); }
  geo.computeVertexNormals();
  return shadeAo(geo, (x, y, z) => (Math.hypot(x, z) < 0.31 && y > 0.3 ? 0.2 : 0.4 + y * 0.6) * (0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 11 + seed)));
}

/* ------------------------------------------------------------------ Placement */

const S = SUBMARINE.SPAWN, P = RADIATION.SOURCE;
const slopeY = (x, z) => 2 / Math.hypot(getFloorHeight(x + 1, z) - getFloorHeight(x - 1, z), 2, getFloorHeight(x, z + 1) - getFloorHeight(x, z - 1));
const clear = (x, z, r) => Math.hypot(x - S.x, z - S.z) > r + 12 && Math.hypot(x - P.x, z - P.z) > r + 45 && !WRECK_SPOTS.some(([wx, wz]) => Math.hypot(x - wx, z - wz) < r + 14);

/** Regroupe des instances par tuile et crée les InstancedMesh */
function instanced(group, geo, material, items, smallDist = 0) {
  const tiles = new Map();
  for (const it of items) {
    const k = tileKey(it.p.x, it.p.z);
    if (!tiles.has(k)) tiles.set(k, []);
    tiles.get(k).push(it);
  }
  const m = new THREE.Matrix4();
  for (const list of tiles.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => { mesh.setMatrixAt(i, m.compose(it.p, it.q, it.s)); mesh.setColorAt(i, it.c); });
    mesh.computeBoundingSphere();
    if (smallDist) registerSmall(mesh, smallDist);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function createRockFormations(group, colliders) {
  const rock = applyDetail(new THREE.MeshLambertMaterial({ color: '#6b6e6a' }), 'rock', 1);
  const tint = () => { const t = rand.range(0.82, 1.15); return new THREE.Color(t * rand.range(0.92, 1.06), t, t * rand.range(0.9, 1)); };
  const E = new THREE.Euler();

  // --- Arches : par où passer. [zMin, zMax, nombre]
  const arches = [[], []];
  for (const [z0, z1, count] of [[-150, 130, 12], [-520, -180, 9], [-860, -560, 14]].map(([a, b, n]) => [stretchZ(a), stretchZ(b), n])) {
    let made = 0;
    for (let t = 0; t < 3000 && made < count; t++) {
      const x = rand.range(-140, 140), z = rand.range(z0, z1), R = rand.range(8, 16);
      if (!clear(x, z, R) || slopeY(x, z) < 0.8) continue;
      // les deux pieds doivent reposer à peu près au même niveau, sans bosse entre eux
      const yaw = rand() * TAU, f1 = getFloorHeight(x + Math.cos(yaw) * R, z - Math.sin(yaw) * R), f2 = getFloorHeight(x - Math.cos(yaw) * R, z + Math.sin(yaw) * R);
      if (Math.abs(f1 - f2) > R * 0.25 || getFloorHeight(x, z) > Math.min(f1, f2) + R * 0.3) continue;
      const y = Math.min(f1, f2) - R * 0.12;
      if (-y - R * 0.9 < 6) continue; // la voûte doit rester sous la surface
      const q = new THREE.Quaternion().setFromEuler(E.set(rand.range(-0.08, 0.08), yaw, rand.range(-0.12, 0.12)));
      const s = new THREE.Vector3(R, R * rand.range(0.75, 1.05), R);
      arches[made % 2].push({ p: new THREE.Vector3(x, y, z), q, s, c: tint() });
      // collisions : chapelet de sphères le long de la voûte
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI, v = new THREE.Vector3(Math.cos(a) * s.x, Math.sin(a) * 0.85 * s.y, 0).applyQuaternion(q);
        colliders.push({ x: x + v.x, y: y + v.y, z: z + v.z, r: R * 0.2 * (1 + 0.9 * Math.pow(1 - Math.sin(a), 2)) * 0.9 });
      }
      made++;
    }
  }
  arches.forEach((items, i) => instanced(group, archGeometry(3 + i * 11), rock, items));

  // --- Aiguilles et piliers : de plus en plus hauts vers le Canyon
  const pillars = [[], [], []];
  for (const [z0, z1, count, hMin, hMax] of [[-170, 140, 50, 6, 16], [-540, -170, 80, 10, 30], [-880, -540, 140, 16, 55], [-1120, -880, 38, 8, 26]].map(([a, b, n, h0, h1]) => [stretchZ(a), stretchZ(b), n, h0, h1])) {
    let made = 0;
    for (let t = 0; t < 2000 && made < count; t++) {
      const x = rand.range(-165, 165), z = rand.range(z0, z1), y = getFloorHeight(x, z);
      const h = Math.min(rand.range(hMin, hMax), -y - 5), r = h * rand.range(0.14, 0.26) + 1;
      if (h < 5 || !clear(x, z, r)) continue;
      const q = new THREE.Quaternion().setFromEuler(E.set(rand.range(-0.12, 0.12), rand() * TAU, rand.range(-0.12, 0.12)));
      pillars[made % 3].push({ p: new THREE.Vector3(x, y - 1, z), q, s: new THREE.Vector3(r, h, r), c: tint() });
      for (let k = 0; k * r * 0.9 < h; k++) { const f = (k * r * 0.9) / h; colliders.push({ x, y: y + f * h, z, r: r * (1 - 0.55 * f) * 0.95 }); }
      made++;
    }
  }
  pillars.forEach((items, i) => instanced(group, pillarGeometry(1.7 + i * 5), rock, items));

  // --- Dalles en surplomb, accrochées aux pentes raides
  const ledges = [[], []];
  let made = 0;
  for (let t = 0; t < 70000 && made < 410; t++) {
    const x = rand.range(-175, 175), z = rand.range(stretchZ(-900), 100);
    if (slopeY(x, z) > 0.62 || !clear(x, z, 6)) continue;
    const y = getFloorHeight(x, z);
    if (y > -14) continue;
    const dx = getFloorHeight(x + 1, z) - getFloorHeight(x - 1, z), dz = getFloorHeight(x, z + 1) - getFloorHeight(x, z - 1), l = Math.hypot(dx, dz) || 1;
    const size = rand.range(4, 11) * (z < stretchZ(-540) ? 1.3 : 1);
    // la dalle déborde de la paroi, du côté de la pente
    const px = x - (dx / l) * size * 0.45, pz = z - (dz / l) * size * 0.45;
    const q = new THREE.Quaternion().setFromEuler(E.set(rand.range(-0.2, 0.2), Math.atan2(-dx, -dz) + Math.PI / 2 + rand.range(-0.4, 0.4), rand.range(-0.25, 0.25)));
    ledges[made % 2].push({ p: new THREE.Vector3(px, y + size * 0.1, pz), q, s: new THREE.Vector3(size, size * rand.range(0.8, 1.4), size), c: tint() });
    colliders.push({ x: px, y: y + size * 0.1, z: pz, r: size * 0.42 });
    made++;
  }
  ledges.forEach((items, i) => instanced(group, ledgeGeometry(8 + i * 3), rock, items));
}

function createCoralGardens(group) {
  const density = quality().flora;
  const mat = (kind, color) => { const m = new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide }); m.userData.detail = kind; return m; };
  // palettes pour le rendu Three.js (le moteur WebGPU choisit la teinte par massif)
  const CORAL = ['#c8322a', '#d84a6a', '#d87a2a', '#8a4ab0', '#c84a8a'], SPONGE = ['#a8522a', '#b0762a', '#7a3a70', '#c08a3a'];
  const species = [
    { geo: [branchCoral(11), branchCoral(23)], kind: 'coral', pal: CORAL, size: [0.7, 2.2], w: 3 },
    { geo: [brainCoral(4)], kind: 'coral', pal: CORAL, size: [0.6, 2.4], w: 2 },
    { geo: [tableCoral(9)], kind: 'coral', pal: CORAL, size: [0.9, 2.8], w: 1.5 },
    { geo: [fanCoral(2), fanCoral(17)], kind: 'coral', pal: CORAL, size: [0.8, 2.6], w: 2.5 },
    { geo: [tubeSponge(31), tubeSponge(47)], kind: 'sponge', pal: SPONGE, size: [0.6, 1.8], w: 2.5 },
    { geo: [barrelSponge(5)], kind: 'sponge', pal: SPONGE, size: [0.7, 2.2], w: 1.5 },
  ];
  const lists = species.map((sp) => sp.geo.map(() => []));
  const total = species.reduce((a, s) => a + s.w, 0);
  const E = new THREE.Euler();
  // Massifs : un centre, des dizaines de colonies autour. Denses au Récif, rares et pâles plus bas.
  const gardens = Math.round(260 * 2 * density);
  for (let g = 0; g < gardens; g++) {
    const deep = rand() < 0.4;
    const gx = rand.range(-175, 175), gz = deep ? rand.range(SEABED.Z_END + 80, stretchZ(-170)) : rand.range(stretchZ(-170), 205), gr = rand.range(4, 11);
    if (Math.hypot(gx - S.x, gz - S.z) < 8) continue;
    const hue = rand();
    const n = Math.round((deep ? 9 : 26) * rand.range(0.6, 1.4));
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * gr, x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
      const y = getFloorHeight(x, z);
      if (y > -5 || slopeY(x, z) < 0.5) continue;
      let pick = rand() * total, si = 0;
      while (pick > species[si].w) pick -= species[si++].w;
      const sp = species[si], vi = Math.floor(rand() * sp.geo.length);
      const s = rand.range(sp.size[0], sp.size[1]) * (rand() < 0.08 ? 1.7 : 1);
      const dx = getFloorHeight(x + 1, z) - getFloorHeight(x - 1, z), dz = getFloorHeight(x, z + 1) - getFloorHeight(x, z - 1);
      const q = new THREE.Quaternion().setFromEuler(E.set(dz * 0.25 + rand.range(-0.15, 0.15), rand() * TAU, -dx * 0.25 + rand.range(-0.15, 0.15)));
      // teinte voisine pour tout le massif (position → graine identique dans le moteur WebGPU)
      const c = new THREE.Color(sp.pal[Math.floor(((hue + rand() * 0.25) % 1) * sp.pal.length)]).multiplyScalar(rand.range(0.8, 1.2));
      lists[si][vi].push({ p: new THREE.Vector3(x, y - 0.08 * s, z), q, s: new THREE.Vector3(s, s * rand.range(0.85, 1.2), s), c });
    }
  }
  species.forEach((sp, si) => sp.geo.forEach((geo, vi) => instanced(group, geo, mat(sp.kind, '#ffffff'), lists[si][vi], 75)));
}

/** Crée arches, piliers, surplombs, coraux et éponges. `colliders` reçoit les sphères de collision. */
export function createFormations(colliders) {
  const group = new THREE.Group();
  group.name = 'formations';
  createRockFormations(group, colliders);
  createCoralGardens(group);
  return group;
}
