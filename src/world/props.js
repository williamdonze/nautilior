import * as THREE from 'three';
import { WORLD, SEABED } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { getFloorHeight, canyonCenter } from './seabed.js';
import { WRECK_SPOTS } from './landmarks.js';
import { tileKey, registerSmall } from './tiles.js';

/**
 * Tout ce qui peuple le fond en dehors des plantes :
 *  - débris humains : barils, caisses, pneus, chaînes, planches, deux 2CV englouties ;
 *  - coquillages et moulières ;
 *  - ruines de la cité d'Ys dans le canyon et les abysses (colonnes, blocs, escaliers,
 *    arche, tête de pierre).
 * Les objets répétés sont instanciés et regroupés par bandes (culling hors champ).
 */
const rand = createRandom(WORLD.SEED + 909);
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function weathered(geo, base, rust = '#63321b', amount = 0.35) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rust), c = new THREE.Color();
  paintFaces(geo, () => (rand() < amount ? c.copy(r) : c.copy(b)).multiplyScalar(0.75 + rand() * 0.35));
  return geo;
}

function mergeGeos(parts) {
  const pos = [], col = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    if (g.attributes.color) col.push(...g.attributes.color.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col.length === pos.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------ Géométries */

const GEOS = {
  barrel: () => {
    const body = weathered(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 9), '#2f4a66', '#8a4f28', 0.45);
    const rings = [-0.35, 0.35].map((y) => weathered(new THREE.TorusGeometry(0.41, 0.03, 3, 9).rotateX(Math.PI / 2).translate(0, y, 0), '#3e2114'));
    return mergeGeos([body, ...rings]);
  },
  crate: () => {
    const parts = [weathered(new THREE.BoxGeometry(1, 0.7, 0.7), '#5a4a32', '#3e2114', 0.3)];
    for (const x of [-0.45, 0.45]) parts.push(weathered(new THREE.BoxGeometry(0.06, 0.74, 0.74).translate(x, 0, 0), '#3e2114'));
    return mergeGeos(parts);
  },
  tire: () => weathered(new THREE.TorusGeometry(0.42, 0.16, 6, 12).rotateX(Math.PI / 2), '#17191a', '#26292b', 0.2),
  chain: () => {
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const link = new THREE.TorusGeometry(0.14, 0.035, 4, 8);
      link.scale(1.5, 1, 1);
      if (i % 2) link.rotateX(Math.PI / 2);
      link.translate(i * 0.3, 0.05, Math.sin(i * 0.7) * 0.15);
      parts.push(weathered(link, '#4a3a2a', '#63321b', 0.6));
    }
    return mergeGeos(parts);
  },
  plank: () => weathered(new THREE.BoxGeometry(2.2, 0.08, 0.28), '#4a3a28', '#2a2014', 0.3),
  shell: () => {
    const pts = [[0.001, 0], [0.12, 0.03], [0.1, 0.12], [0.05, 0.2], [0.001, 0.26]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 6);
    g.rotateZ(1.2);
    return weathered(g, '#d8d0c0', '#c08850', 0.4);
  },
  mussels: () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.TetrahedronGeometry(0.14, 0);
      m.scale(1, 0.55, 1.8);
      m.rotateY(i * 0.9);
      m.translate(Math.cos(i * 2.4) * 0.18, 0.05, Math.sin(i * 2.4) * 0.18);
      parts.push(weathered(m, '#1a1f2a', '#2f4a66', 0.3));
    }
    return mergeGeos(parts);
  },
  column: () => {
    // Fût cannelé d'Ys, chapiteau simple
    const parts = [weathered(new THREE.CylinderGeometry(0.55, 0.6, 5, 10, 3), '#8a8a80', '#5f6a5a', 0.3)];
    parts.push(weathered(new THREE.BoxGeometry(1.5, 0.35, 1.5).translate(0, 2.65, 0), '#9a9a90', '#5f6a5a', 0.3));
    parts.push(weathered(new THREE.BoxGeometry(1.4, 0.3, 1.4).translate(0, -2.6, 0), '#7a7a72', '#5f6a5a', 0.2));
    return mergeGeos(parts);
  },
  block: () => weathered(new THREE.BoxGeometry(1.6, 0.9, 1), '#7a7a72', '#4a5a4a', 0.35),
  amphora: () => {
    const pts = [[0.001, 0], [0.16, 0.05], [0.32, 0.35], [0.28, 0.7], [0.1, 0.85], [0.1, 1], [0.14, 1.05]].map(([r, y]) => new THREE.Vector2(r, y));
    return weathered(new THREE.LatheGeometry(pts, 8), '#a8704a', '#63321b', 0.3);
  },
};

/* ------------------------------------------------------------ Placement instancié par bandes */

function scatterInstanced(group, geo, list, material = vmat, smallDist = 0) {
  const bands = new Map();
  for (const it of list) {
    const b = tileKey(it.x, it.z);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(it);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const items of bands.values()) {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry ?? rand() * Math.PI * 2, it.rz ?? 0);
      q.setFromEuler(e);
      s.setScalar(it.s ?? 1);
      p.set(it.x, it.y, it.z);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.computeBoundingSphere();
    if (smallDist) registerSmall(mesh, smallDist);
    group.add(mesh);
  }
}

/** Points au hasard sur le fond, entre deux profondeurs (et éventuellement autour d'un centre) */
function floorPoints(count, minDepth, maxDepth, around = null, spread = 20) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 40) {
    const x = around ? around[0] + rand.range(-spread, spread) : rand.range(-SEABED.WIDTH / 2 + 15, SEABED.WIDTH / 2 - 15);
    const z = around ? around[1] + rand.range(-spread, spread) : rand.range(SEABED.Z_END + 15, SEABED.Z_START - 15);
    const y = getFloorHeight(x, z);
    if (-y < minDepth || -y > maxDepth) continue;
    out.push({ x, y, z });
  }
  return out;
}

/* ------------------------------------------------------------ Pièces uniques */

/** Une 2CV engloutie, posée de travers */
function deuxChevaux(x, z, ry) {
  const g = new THREE.Group();
  const paintCol = rand() < 0.5 ? '#6a7a8a' : '#8a6a3a';
  const body = weathered(new THREE.BoxGeometry(1.5, 0.6, 3.6), paintCol, '#63321b', 0.5);
  const bodyMesh = new THREE.Mesh(body, vmat);
  bodyMesh.position.y = 0.55;
  g.add(bodyMesh);
  // Toit en arrondi caractéristique
  const roof = weathered(new THREE.CylinderGeometry(0.75, 0.75, 2, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), paintCol, '#63321b', 0.5);
  roof.scale(1, 0.75, 1);
  const roofMesh = new THREE.Mesh(roof, vmat);
  roofMesh.position.set(0, 0.85, -0.2);
  g.add(roofMesh);
  // Capot plongeant
  const hood = weathered(new THREE.BoxGeometry(1.3, 0.35, 1).translate(0, 0, 0), paintCol, '#63321b', 0.5);
  const hm = new THREE.Mesh(hood, vmat);
  hm.position.set(0, 0.8, 1.45);
  hm.rotation.x = 0.35;
  g.add(hm);
  for (const sx of [-0.78, 0.78]) for (const sz of [-1.1, 1.2]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 5, 9).rotateY(Math.PI / 2), lambert('#17191a'));
    w.position.set(sx, 0.3, sz);
    g.add(w);
  }
  for (const sx of [-0.45, 0.45]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), lambert('#4a5a5a'));
    l.position.set(sx, 0.75, 1.95);
    g.add(l);
  }
  g.position.set(x, getFloorHeight(x, z) - 0.25, z);
  g.rotation.set(rand.range(-0.15, 0.15), ry, rand.range(0.1, 0.35));
  return g;
}

/** Arche d'Ys : deux piliers et un arc */
function ysArch(x, z, ry, colliders) {
  const g = new THREE.Group();
  const stone = (geo) => new THREE.Mesh(weathered(geo, '#8a8a80', '#4a5a4a', 0.35), vmat);
  for (const s of [-1, 1]) {
    const p = stone(new THREE.BoxGeometry(1.4, 7, 1.4));
    p.position.set(s * 3.5, 3.5, 0);
    g.add(p);
  }
  const arc = stone(new THREE.TorusGeometry(3.5, 0.7, 4, 10, Math.PI));
  arc.position.y = 7;
  g.add(arc);
  g.position.set(x, getFloorHeight(x, z) - 0.5, z);
  g.rotation.set(0, ry, rand.range(-0.08, 0.08));
  g.updateMatrixWorld(true);
  for (const s of [-1, 1]) {
    const p = new THREE.Vector3(s * 3.5, 3, 0).applyMatrix4(g.matrixWorld);
    colliders.push({ x: p.x, y: p.y, z: p.z, r: 1.3 });
  }
  return g;
}

/** Escalier englouti */
function stairs(x, z, ry) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const step = new THREE.Mesh(weathered(new THREE.BoxGeometry(5, 0.4, 0.9), '#7a7a72', '#4a5a4a', 0.3), vmat);
    step.position.set(0, i * 0.4, -i * 0.9);
    g.add(step);
  }
  g.position.set(x, getFloorHeight(x, z) - 0.3, z);
  g.rotation.y = ry;
  return g;
}

/** Grande tête de pierre aux yeux vides, à moitié ensablée */
function stoneHead(x, z, colliders) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(weathered(new THREE.IcosahedronGeometry(3, 1).scale(0.9, 1.25, 0.95), '#8a8a80', '#4a5a4a', 0.25), vmat);
  g.add(head);
  for (const s of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: '#05090d' }));
    socket.position.set(s * 1.05, 0.7, 2.55);
    socket.scale.set(1, 0.7, 0.4);
    g.add(socket);
  }
  const nose = new THREE.Mesh(weathered(new THREE.ConeGeometry(0.5, 1.4, 4), '#7a7a72'), vmat);
  nose.position.set(0, -0.2, 2.8);
  nose.rotation.x = Math.PI / 2 + 0.3;
  g.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: '#05090d' }));
  mouth.position.set(0, -1.3, 2.6);
  g.add(mouth);
  g.position.set(x, getFloorHeight(x, z) + 0.8, z);
  g.rotation.set(0.25, rand() * 6, 0.3);
  colliders.push({ x, y: g.position.y, z, r: 3.2 });
  return g;
}

export function createProps(colliders) {
  const group = new THREE.Group();

  // --- Débris humains : plus nombreux autour des épaves
  const debris = (count, minD, maxD, wreckShare = 0.5) => {
    const list = floorPoints(Math.round(count * (1 - wreckShare)), minD, maxD);
    for (const spot of WRECK_SPOTS) list.push(...floorPoints(Math.round((count * wreckShare) / WRECK_SPOTS.length), 0, 2000, spot, 22));
    return list;
  };
  scatterInstanced(group, GEOS.barrel(), debris(260, 15, 700).map((p) => ({ ...p, y: p.y + 0.2, rx: rand() < 0.6 ? Math.PI / 2 : 0, rz: rand.range(-0.3, 0.3) })), vmat, 70);
  scatterInstanced(group, GEOS.crate(), debris(200, 10, 600).map((p) => ({ ...p, y: p.y + 0.25, rz: rand.range(-0.4, 0.4), s: rand.range(0.8, 1.3) })), vmat, 70);
  scatterInstanced(group, GEOS.tire(), debris(140, 5, 450, 0.3).map((p) => ({ ...p, y: p.y + 0.05, rx: rand.range(-0.4, 0.4) })), vmat, 60);
  scatterInstanced(group, GEOS.chain(), debris(160, 10, 800).map((p) => ({ ...p, y: p.y + 0.02, s: rand.range(1, 2.4) })), vmat, 55);
  scatterInstanced(group, GEOS.plank(), debris(300, 20, 700, 0.7).map((p) => ({ ...p, y: p.y + 0.05, rz: rand.range(-0.3, 0.3), s: rand.range(0.7, 1.5) })), vmat, 60);

  // --- Coquillages et moulières sur le plateau
  scatterInstanced(group, GEOS.shell(), floorPoints(2200, 0, 260).map((p) => ({ ...p, y: p.y + 0.02, s: rand.range(0.8, 2.2), rx: rand() * 3 })), vmat, 45);
  scatterInstanced(group, GEOS.mussels(), floorPoints(1200, 0, 140).map((p) => ({ ...p, y: p.y + 0.02, s: rand.range(1, 2.6) })), vmat, 45);

  // --- Deux 2CV englouties
  group.add(deuxChevaux(-24, -150, 0.7), deuxChevaux(84, -330, 2.2));

  // --- Ruines d'Ys : canyon et abysses
  const ruinSites = [
    [canyonCenter(-620) + 6, -620], [canyonCenter(-705) - 10, -705], [canyonCenter(-790) + 8, -790],
    [-60, -940], [70, -1000], [-30, -1090],
  ];
  const columns = [], blocks = [], amphoras = [];
  for (const [sx, sz] of ruinSites) {
    for (let i = 0; i < 7; i++) {
      const p = floorPoints(1, 0, 3000, [sx, sz], 16)[0];
      if (!p) continue;
      const fallen = rand() < 0.45;
      columns.push({ ...p, y: p.y + (fallen ? 0.5 : 2.4), rz: fallen ? Math.PI / 2 : rand.range(-0.12, 0.12), s: rand.range(0.7, 1.2) });
      if (!fallen) colliders.push({ x: p.x, y: p.y + 2.4, z: p.z, r: 0.8 });
    }
    blocks.push(...floorPoints(10, 0, 3000, [sx, sz], 18).map((p) => ({ ...p, y: p.y + 0.3, rx: rand.range(-0.3, 0.3), rz: rand.range(-0.3, 0.3), s: rand.range(0.7, 1.6) })));
    amphoras.push(...floorPoints(8, 0, 3000, [sx, sz], 14).map((p) => ({ ...p, y: p.y + 0.15, rz: rand() < 0.6 ? Math.PI / 2 : 0, s: rand.range(0.8, 1.3) })));
  }
  scatterInstanced(group, GEOS.column(), columns);
  scatterInstanced(group, GEOS.block(), blocks);
  scatterInstanced(group, GEOS.amphora(), amphoras);
  group.add(ysArch(ruinSites[1][0] + 4, ruinSites[1][1] + 6, 0.4, colliders));
  group.add(ysArch(ruinSites[4][0] - 6, ruinSites[4][1] - 4, 1.2, colliders));
  group.add(stairs(ruinSites[3][0] + 8, ruinSites[3][1], 0.8));
  group.add(stairs(ruinSites[0][0] - 6, ruinSites[0][1] + 4, -0.5));
  group.add(stoneHead(ruinSites[2][0] - 8, ruinSites[2][1] - 6, colliders));
  group.add(stoneHead(ruinSites[5][0] + 10, ruinSites[5][1], colliders));
  return group;
}
