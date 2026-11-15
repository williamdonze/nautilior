import * as THREE from 'three';
import { gpuMode } from '../gpu/mode.js';
import { createNoise2D } from '../world/noise.js';

/**
 * Les sept Nautiliar, un par niveau de coque (voir config/upgrades.json) :
 *   0  Tôle d'origine        — le vieux cigare rouillé, bulle de verre à l'avant
 *   1  Tôles rivetées         — rapiécé, cerclages rivetés, moins de rouille
 *   2  Renforts d'acier       — peint acier, longerons, hélice carénée, double phare
 *   3  Double coque           — plus long, cage extérieure, nacelles latérales
 *   4  Coque de bathyscaphe   — flotteur jaune et sphère habitable dessous
 *   5  Sphère de pression     — sphère de titane dans un châssis tubulaire, 4 propulseurs
 *   6  Coque abyssale         — coque large et sombre aux angles arrondis, liserés lumineux,
 *                               4 rotors verticaux pour monter et descendre
 *
 * Les coques sont des surfaces lisses (sections interpolées, voir loft) : les tôles, les rivets
 * et les coulures sont dessinés par le shader (type « hull » du moteur WebGPU).
 * Chaque modèle fournit : ses maillages, ses hélices (main = avance, lift = montée/descente),
 * la position du phare, du poste de pilotage (vue à la 1re personne) et de l'épaule du bras.
 * Axe avant = +Z.
 */
const noise = createNoise2D(42);
const TAU = Math.PI * 2;

const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true });
hullMat.userData.detail = 'hull';
const matCache = new Map();
/** Pièces rapportées (métal lisse) */
const lambert = (color) => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
};
const glowMat = (color) => new THREE.MeshBasicMaterial({ color });
const glassMat = new THREE.MeshLambertMaterial({ color: '#cfe8e6', transparent: true, opacity: 0.1, depthWrite: false });
glassMat.userData.detail = 'glass';

/** Peinture par sommet : teinte de base qui varie, rouille en plaques et sous la coque */
function paint(geo, base, rustAmount = 0.3, rustColors = ['#63321b', '#8a4f28', '#3e2114']) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const bases = (Array.isArray(base) ? base : [base]).map((h) => new THREE.Color(h));
  const rust = rustColors.map((h) => new THREE.Color(h));
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3), c = new THREE.Color(), r = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = noise(x * 0.7 + z * 0.35, y * 0.9 - z * 0.25) * 0.5 + 0.5;
    const b = t * (bases.length - 1), bi = Math.min(bases.length - 2, Math.floor(b));
    if (bases.length > 1) c.copy(bases[bi]).lerp(bases[bi + 1], b - bi); else c.copy(bases[0]);
    if (rustAmount > 0) {
      const v = noise(x * 1.4 + z * 0.9, y * 1.8 - z * 0.6) * 0.5 + 0.5;
      const drip = noise(z * 2.2 + x, 3.7) * 0.5 + 0.5;
      const k = v + (nor.getY(i) < -0.2 ? 0.15 : 0) + (drip > 0.7 && y < 0.4 ? 0.2 : 0);
      const a = Math.max(0, Math.min(1, (k - (1 - rustAmount) + 0.07) / 0.14));
      const ri = noise(x * 3, z * 3 + y) * 0.5 + 0.5;
      r.copy(rust[0]).lerp(rust[1 % rust.length], ri);
      c.lerp(r, a);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Ajoute une pièce de coque peinte */
function part(group, geo, base, rust = 0, rustColors) {
  const m = new THREE.Mesh(paint(geo, base, rust, rustColors), hullMat);
  group.add(m);
  return m;
}
function solid(group, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/**
 * Coque lisse le long de Z. sections : [z, rx, ry, y0 = 0, n = 2], n étant l'exposant de la
 * section (2 = ronde, 4 = carrée aux angles arrondis). Interpolation douce entre les sections.
 */
function loft(sections, radial = 44, steps = 7) {
  const S = sections.map((s) => [s[0], s[1], s[2], s[3] ?? 0, s[4] ?? 2]);
  const cr = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const rows = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      rows.push([b[0] + (c[0] - b[0]) * t, Math.max(0.001, cr(a[1], b[1], c[1], d[1], t)), Math.max(0.001, cr(a[2], b[2], c[2], d[2], t)), cr(a[3], b[3], c[3], d[3], t), b[4] + (c[4] - b[4]) * t]);
    }
  }
  rows.push(S[S.length - 1]);
  const pos = [], idx = [];
  for (const [z, rx, ry, y0, n] of rows) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a), e = 2 / n;
      pos.push(rx * Math.sign(c) * Math.pow(Math.abs(c), e), y0 + ry * Math.sign(s) * Math.pow(Math.abs(s), e), z);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Forme lisse aplatie (aileron, patin, carénage) : un ellipsoïde */
const blob = (sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.SphereGeometry(1, 24, 14).scale(sx, sy, sz).translate(x, y, z);
/** Cylindre couché le long de Z */
const tube = (r0, r1, length, seg = 24) => new THREE.CylinderGeometry(r0, r1, length, seg, 1).rotateX(Math.PI / 2);
/** Anneau autour de l'axe Z */
const ringZ = (r, t, z = 0, y = 0) => new THREE.TorusGeometry(r, t, 10, 48).translate(0, y, z);

/** Barre entre deux points */
function bar(group, a, b, r, material) {
  const va = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(va), len = dir.length();
  const m = solid(group, new THREE.CylinderGeometry(r, r, len, 12), material);
  m.position.copy(va).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Hélice : moyeu profilé et pales vrillées, éventuellement carénée. Tourne autour de son axe Z local. */
function propeller(blades = 3, radius = 0.6, color = '#26292b', duct = false, ductColor = '#3f4446') {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  solid(spin, new THREE.SphereGeometry(radius * 0.22, 16, 10).scale(1, 1, 2.2), lambert(color));
  const blade = new THREE.PlaneGeometry(radius * 0.42, radius * 0.86, 3, 8);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / (radius * 0.86) + 0.5; // 0 au moyeu, 1 en bout de pale
    const w = Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.12 + 0.88 * t)))) * (1 - 0.35 * t);
    const x = p.getX(i) * w, tw = 0.95 - 0.6 * t; // vrillage : forte incidence au pied, faible en bout
    p.setXYZ(i, x * Math.cos(tw), radius * (0.14 + 0.86 * t), x * Math.sin(tw));
  }
  blade.computeVertexNormals();
  const bm = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  for (let i = 0; i < blades; i++) solid(spin, blade, bm).rotation.z = (i / blades) * TAU;
  if (duct) {
    const R = radius * 1.05, L = radius * 0.9;
    const prof = [[R, -L / 2], [R * 1.1, -L * 0.3], [R * 1.14, 0], [R * 1.09, L / 2], [R * 1.02, L / 2], [R, 0], [R, -L / 2]].map(([r, y]) => new THREE.Vector2(r, y));
    solid(g, new THREE.LatheGeometry(prof, 40).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: ductColor, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) bar(g, [0, 0, -L * 0.3], [Math.cos((i / 3) * TAU) * R, Math.sin((i / 3) * TAU) * R, -L * 0.3], radius * 0.035, lambert(ductColor));
  }
  return { group: g, spin };
}

/** Hublot : couronne boulonnée et verre éclairé de l'intérieur (normale = axe X ou Z) */
function porthole(group, x, y, z, r, axis = 'x', color = '#cdb57c', rim = '#8a7a5a') {
  const h = new THREE.Group();
  h.position.set(x, y, z);
  if (axis === 'x') h.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
  group.add(h);
  solid(h, new THREE.TorusGeometry(r, r * 0.2, 8, 28), lambert(rim));
  solid(h, new THREE.CircleGeometry(r * 0.92, 24), glowMat(color), 0, 0, -0.02);
  solid(h, new THREE.SphereGeometry(r * 0.95, 20, 8, 0, TAU, 0, 1.1).rotateX(Math.PI / 2).scale(1, 1, 0.35), glassMat);
}

/** Projecteur : réflecteur en cloche, verre lumineux, collerette */
function lamp(group, x, y, z, r = 0.32, housing = '#26292b') {
  const prof = [[0.02, -r * 1.3], [r * 0.6, -r * 1.2], [r * 1.05, -r * 0.2], [r * 1.12, r * 0.25], [r, r * 0.3]].map(([a, b]) => new THREE.Vector2(a, b));
  solid(group, new THREE.LatheGeometry(prof, 28).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: housing, side: THREE.DoubleSide }), x, y, z);
  solid(group, new THREE.CircleGeometry(r * 0.98, 28), glowMat('#efe3bb'), x, y, z + r * 0.22);
  solid(group, new THREE.TorusGeometry(r * 1.06, r * 0.09, 8, 28), lambert('#8a8f90'), x, y, z + r * 0.27);
}

/** Bulle de verre du poste de pilotage, avec sa couronne */
function canopy(group, x, y, z, r, rim = '#8a7a5a', angle = 1.75) {
  solid(group, new THREE.SphereGeometry(r, 40, 20, 0, TAU, 0, angle).rotateX(Math.PI / 2), glassMat, x, y, z);
  solid(group, new THREE.TorusGeometry(r * Math.sin(angle), r * 0.07, 10, 48), lambert(rim), x, y, z + r * Math.cos(angle));
  // lueur de la cabine derrière le verre
  solid(group, new THREE.CircleGeometry(r * Math.sin(angle) * 0.9, 32), glowMat('#3a3020'), x, y, z + r * Math.cos(angle) - 0.02);
}

/** Rivets le long d'un cercle autour de Z */
function rivets(group, r, z, count, color = '#878a85', y = 0, size = 0.045) {
  const geo = new THREE.SphereGeometry(size, 8, 6);
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * TAU;
    solid(group, geo, lambert(color), Math.cos(a) * r, y + Math.sin(a) * r, z);
  }
}

/* ================================================================== Modèles */

/** 0 & 1 : le cigare d'origine (1 = rapiécé, riveté, moins rouillé) */
function classic(level) {
  const group = new THREE.Group();
  const patched = level === 1;
  const cols = patched ? ['#56645a', '#4f5d54', '#63705f'] : ['#4b5a52', '#56645a', '#3f4c46'];
  const rust = patched ? 0.2 : 0.46;
  const R = 1.03;
  part(group, loft([[-5.0, 0.04, 0.04], [-4.5, 0.36, 0.36], [-3.2, 0.82, 0.84], [-1.2, R, R + 0.03], [1.6, R, R + 0.03], [2.7, 0.92, 0.95], [3.25, 0.74, 0.76]]), cols, rust);
  // Bulle de verre à l'avant, sertie dans une couronne de laiton
  canopy(group, 0, 0, 3.05, 0.84, patched ? '#b08a50' : '#6b5a46', 1.5);

  // Cerclages (rivetés une fois rapiécé)
  for (const z of patched ? [-2.6, -1.3, 0, 1.3, 2.5] : [-2.2, 0, 2.2]) {
    const r = z > 2 ? 0.98 : z < -2 ? 0.95 : R + 0.02;
    solid(group, ringZ(r, 0.055, z), lambert('#26292b'));
    if (patched) rivets(group, r + 0.05, z, 18, '#a8a290');
  }
  // Plaques de réparation (rapiécé) : tôles claires bombées, boulonnées
  if (patched) for (const [a, z] of [[0.3, 1.6], [2.7, -1.2], [1.2, -2.3]]) {
    const pl = new THREE.SphereGeometry(R + 0.03, 12, 8, a - 0.32, 0.64, 1.25, 0.6).rotateX(Math.PI / 2).rotateZ(0);
    part(group, pl.translate(0, 0, z), ['#7a7f7c', '#6b706e'], 0.08);
  }

  // Kiosque profilé, trappe et périscope
  part(group, loft([[-0.75, 0.05, 0.05, 1.25], [-0.45, 0.42, 0.62, 1.3], [0.4, 0.5, 0.7, 1.35], [1.2, 0.36, 0.6, 1.3], [1.5, 0.05, 0.05, 1.25]], 28, 5), cols, rust);
  solid(group, new THREE.CylinderGeometry(0.3, 0.33, 0.1, 24), lambert('#26292b'), 0, 2.04, 0.3);
  solid(group, new THREE.TorusGeometry(0.2, 0.025, 8, 20).rotateX(Math.PI / 2), lambert('#8a7a5a'), 0, 2.11, 0.3);
  bar(group, [0, 1.9, 0.95], [0, 3.0, 0.95], 0.05, lambert('#26292b'));
  solid(group, blob(0.09, 0.09, 0.2), lambert('#26292b'), 0, 3.0, 1.05);
  solid(group, new THREE.CircleGeometry(0.06, 12), glowMat('#9fc8c0'), 0, 3.0, 1.251);

  for (const side of [-1, 1]) for (const z of [1.2, -0.4]) porthole(group, side * (R + 0.02), 0.2, z, 0.2, 'x', '#cdb57c', patched ? '#b08a50' : '#6b5a46');

  // Empennage en croix et barres de plongée
  part(group, blob(1.45, 0.045, 0.42, 0, 0, -4.1), cols, rust);
  part(group, blob(0.045, 0.95, 0.42, 0, 0, -4.1), cols, rust);
  part(group, blob(1.4, 0.04, 0.3, 0, 0.1, 2.0), cols, rust);

  lamp(group, 0, -0.95, 3.2, 0.3);
  bar(group, [0, -0.7, 2.6], [0, -0.95, 3.0], 0.05, lambert('#26292b'));

  const prop = propeller(3, 0.62, '#5a4a32');
  prop.group.position.set(0, 0, -5.3);
  group.add(prop.group);
  solid(group, ringZ(0.72, 0.045, -5.3), lambert('#3a3f3c'));
  for (let i = 0; i < 4; i++) bar(group, [Math.cos(i * 1.5708 + 0.785) * 0.72, Math.sin(i * 1.5708 + 0.785) * 0.72, -5.3], [Math.cos(i * 1.5708 + 0.785) * 0.3, Math.sin(i * 1.5708 + 0.785) * 0.3, -4.5], 0.03, lambert('#3a3f3c'));

  return {
    group,
    propellers: [{ spin: prop.spin, kind: 'main' }],
    lampPosition: new THREE.Vector3(0, -0.95, 3.4),
    cockpit: new THREE.Vector3(0, 0.1, 2.75),
    tail: new THREE.Vector3(0, 0, -5.6),
  };
}

/** 2 : renforts d'acier — peint gris acier, longerons, hélice carénée, deux phares */
function reinforced() {
  const group = new THREE.Group();
  const cols = ['#3f4a54', '#4a5661', '#39434c'];
  const R = 1.08;
  part(group, loft([[-5.1, 0.05, 0.05], [-4.5, 0.42, 0.42], [-3.2, 0.9, 0.9], [-1.4, R, R], [1.8, R, R], [2.9, 0.96, 0.96], [3.4, 0.8, 0.8]]), cols, 0.1);
  canopy(group, 0, 0, 3.2, 0.9, '#8a96a0', 1.5);
  // Longerons et couples de renfort
  const steel = lambert('#59646e');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.52;
    bar(group, [Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), -2.6], [Math.cos(a) * (R + 0.03), Math.sin(a) * (R + 0.03), 2.2], 0.05, steel);
  }
  for (const z of [-2.6, -0.2, 2.2]) { solid(group, ringZ(R + 0.03, 0.07, z), steel); rivets(group, R + 0.1, z, 20, '#a8b0b2'); }

  part(group, loft([[-0.9, 0.05, 0.05, 1.3], [-0.5, 0.45, 0.6, 1.33], [0.5, 0.52, 0.66, 1.38], [1.3, 0.38, 0.56, 1.33], [1.6, 0.05, 0.05, 1.3]], 28, 5), cols, 0.08);
  solid(group, new THREE.CylinderGeometry(0.3, 0.33, 0.1, 24), lambert('#26292b'), 0, 2.02, 0.35);
  bar(group, [0.15, 1.9, 0.9], [0.15, 2.8, 0.9], 0.035, steel);
  bar(group, [-0.15, 1.9, 0.9], [-0.15, 2.5, 0.9], 0.03, steel);
  for (const side of [-1, 1]) for (const z of [1.3, 0, -1.3]) porthole(group, side * (R + 0.02), 0.25, z, 0.18, 'x', '#cdb57c', '#8a96a0');

  part(group, blob(1.55, 0.05, 0.45, 0, 0, -4.2), cols, 0.08);
  part(group, blob(0.05, 1.05, 0.45, 0, 0, -4.2), cols, 0.08);
  part(group, blob(1.5, 0.045, 0.32, 0, 0.1, 2.1), cols, 0.08);
  for (const x of [-0.5, 0.5]) { lamp(group, x, -0.98, 3.3, 0.26, '#2f3840'); bar(group, [x, -0.75, 2.7], [x, -0.98, 3.1], 0.045, steel); }
  bar(group, [-0.5, -0.98, 3.1], [0.5, -0.98, 3.1], 0.035, steel);

  const prop = propeller(4, 0.62, '#8a96a0', true, '#39434c');
  prop.group.position.set(0, 0, -5.3);
  group.add(prop.group);
  return {
    group,
    propellers: [{ spin: prop.spin, kind: 'main' }],
    lampPosition: new THREE.Vector3(0, -0.98, 3.5),
    cockpit: new THREE.Vector3(0, 0.1, 2.9),
    tail: new THREE.Vector3(0, 0, -5.7),
  };
}

/** 3 : double coque — plus long, cage extérieure, nacelles latérales */
function doubleHull() {
  const group = new THREE.Group();
  const cols = ['#33474a', '#3d5356', '#2c3d40'];
  const R = 1.1;
  part(group, loft([[-5.5, 0.05, 0.05], [-4.8, 0.45, 0.45], [-3.4, 0.95, 0.95], [-1.5, R, R], [2.4, R, R], [3.6, 0.98, 0.98], [4.15, 0.82, 0.82]]), cols, 0.06);
  canopy(group, 0, 0, 3.95, 0.92, '#5f7072', 1.5);
  // Cage extérieure : arceaux et lisses
  const cage = lambert('#56686a');
  for (const z of [-3, -1.6, -0.2, 1.2, 2.6]) solid(group, ringZ(1.32, 0.045, z), cage);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.39;
    bar(group, [Math.cos(a) * 1.32, Math.sin(a) * 1.32, -3], [Math.cos(a) * 1.32, Math.sin(a) * 1.32, 2.6], 0.035, cage);
  }
  part(group, loft([[-1.2, 0.05, 0.05, 1.3], [-0.7, 0.5, 0.62, 1.36], [0.6, 0.56, 0.7, 1.42], [1.6, 0.4, 0.58, 1.36], [2.0, 0.05, 0.05, 1.3]], 28, 5), cols, 0.05);
  bar(group, [0, 1.9, 1.0], [0, 2.9, 1.0], 0.04, cage);
  solid(group, blob(0.3, 0.05, 0.12), cage, 0, 2.9, 1.0);
  for (const side of [-1, 1]) for (const z of [2.0, 0.6, -0.8]) porthole(group, side * (R + 0.02), 0.3, z, 0.17, 'x', '#bfd8c8', '#5f7072');

  part(group, blob(1.7, 0.05, 0.5, 0, 0, -4.5), cols, 0.05);
  part(group, blob(0.05, 1.1, 0.5, 0, 0, -4.5), cols, 0.05);
  // Nacelles latérales avec leurs hélices carénées
  const props = [];
  for (const side of [-1, 1]) {
    part(group, loft([[-3.6, 0.05, 0.05, -0.2], [-3.2, 0.3, 0.3, -0.2], [-1.6, 0.36, 0.36, -0.2], [-0.6, 0.05, 0.05, -0.2]], 24, 5).translate(side * 1.75, 0, 0), cols, 0.05);
    bar(group, [side * 1.05, -0.1, -2.4], [side * 1.6, -0.2, -2.4], 0.07, cage);
    bar(group, [side * 1.05, -0.1, -1.4], [side * 1.6, -0.2, -1.4], 0.07, cage);
    const p = propeller(4, 0.42, '#9aa8aa', true, '#2c3d40');
    p.group.position.set(side * 1.75, -0.2, -3.75);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
  }
  const main = propeller(5, 0.6, '#9aa8aa', true, '#2c3d40');
  main.group.position.set(0, 0, -5.7);
  group.add(main.group);
  props.push({ spin: main.spin, kind: 'main' });
  for (const x of [-0.55, 0.55]) { lamp(group, x, -1.02, 4.1, 0.27, '#24302f'); bar(group, [x, -0.8, 3.4], [x, -1.02, 3.9], 0.045, cage); }
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -1.02, 4.3),
    cockpit: new THREE.Vector3(0, 0.1, 3.65),
    tail: new THREE.Vector3(0, 0, -6),
  };
}

/** 4 : bathyscaphe — grand flotteur jaune, sphère habitable suspendue dessous */
function bathyscaphe() {
  const group = new THREE.Group();
  const yellow = ['#b0902e', '#bd9d38', '#9c7f26'];
  const grey = lambert('#6b7072');
  part(group, loft([[-4.6, 0.05, 0.05, 1.1], [-4.0, 0.7, 0.55, 1.1], [-2.5, 1.25, 0.95, 1.1], [1.5, 1.3, 1.0, 1.1], [3.2, 0.95, 0.75, 1.1], [3.9, 0.05, 0.05, 1.1]]), yellow, 0.1, ['#6a4a1c', '#8a5a22']);
  // Lisse de pont, kiosque d'accès
  part(group, loft([[-0.9, 0.04, 0.04, 2.15], [-0.6, 0.3, 0.3, 2.2], [0.2, 0.34, 0.34, 2.25], [0.7, 0.04, 0.04, 2.15]], 24, 4), yellow, 0.05);
  for (const side of [-1, 1]) bar(group, [side * 0.9, 2.05, -2.6], [side * 0.9, 2.05, 2.2], 0.03, grey);
  for (const z of [-2.6, -1, 0.6, 2.2]) for (const side of [-1, 1]) bar(group, [side * 0.9, 1.85, z], [side * 0.9, 2.05, z], 0.025, grey);
  // Sphère habitable en acier, grand hublot bombé
  const S = new THREE.Vector3(0, -1.55, 1.6);
  part(group, new THREE.SphereGeometry(1.2, 40, 24, 0, TAU, 0.72, Math.PI - 0.72).rotateX(Math.PI / 2).translate(S.x, S.y, S.z), ['#7a8286', '#868e92', '#6e767a'], 0.06);
  canopy(group, S.x, S.y, S.z, 1.2, '#a8b0b2', 0.76);
  rivets(group, 0.86, S.z + 0.9, 18, '#c8ccc8', S.y, 0.04);
  for (const side of [-1, 1]) porthole(group, side * 1.2, S.y, S.z, 0.2, 'x', '#cdb57c', '#a8b0b2');
  // Trémies de lest, suspentes
  for (const z of [-0.6, -2.4]) {
    const prof = [[0.05, -0.7], [0.45, -0.1], [0.5, 0.35], [0.3, 0.45]].map(([a, b]) => new THREE.Vector2(a, b));
    solid(group, new THREE.LatheGeometry(prof, 24), lambert('#5a5f60'), 0, -0.25, z);
  }
  for (const side of [-1, 1]) {
    bar(group, [side * 0.7, 0.3, 0.9], [side * 0.6, -0.6, 1.3], 0.06, grey);
    bar(group, [side * 0.7, 0.3, 2.3], [side * 0.6, -0.6, 1.9], 0.06, grey);
  }
  part(group, blob(0.05, 0.9, 0.55, 0, 1.3, -4.1), yellow, 0.08);
  part(group, blob(1.3, 0.05, 0.45, 0, 1.1, -4.1), yellow, 0.08);
  const props = [];
  for (const side of [-1, 1]) {
    const p = propeller(4, 0.5, '#9aa3a6', true, '#5a5f60');
    p.group.position.set(side * 1.65, 0.6, -2.6);
    group.add(p.group);
    bar(group, [side * 1.1, 0.8, -2.5], [side * 1.6, 0.6, -2.5], 0.07, grey);
    props.push({ spin: p.spin, kind: 'main' });
  }
  for (const x of [-0.55, 0.55]) { lamp(group, x, -2.45, 2.45, 0.24, '#3f4446'); bar(group, [x, -2.3, 1.9], [x, -2.45, 2.3], 0.04, grey); }
  // Patins
  for (const side of [-1, 1]) { solid(group, blob(0.09, 0.09, 1.3), grey, side * 0.75, -2.95, 1.4); bar(group, [side * 0.6, -2.4, 1.0], [side * 0.75, -2.95, 1.0], 0.04, grey); bar(group, [side * 0.6, -2.4, 2.0], [side * 0.75, -2.95, 2.0], 0.04, grey); }
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -2.45, 2.65),
    cockpit: new THREE.Vector3(0, -1.6, 2.2),
    tail: new THREE.Vector3(0, 1.2, -4),
    clawRoot: new THREE.Vector3(0, -2.6, 1.9),
    clawRest: new THREE.Vector3(0, -3.1, 2.9),
  };
}

/** 5 : sphère de pression — sphère de titane dans un châssis tubulaire, 4 propulseurs */
function pressureSphere() {
  const group = new THREE.Group();
  const ti = ['#9aa3a6', '#a8b1b4', '#8a9396'];
  const frame = lambert('#c08850'), dark = lambert('#3a4044');
  const C = new THREE.Vector3(0, 0.15, 0.55);
  part(group, new THREE.SphereGeometry(1.5, 48, 28, 0, TAU, 0.95, Math.PI - 0.95).rotateX(Math.PI / 2).translate(C.x, C.y, C.z), ti, 0.02);
  canopy(group, C.x, C.y, C.z, 1.5, '#5a6064', 0.98);
  rivets(group, 1.3, C.z + 0.86, 24, '#d0d6d8', C.y, 0.04);
  // Carénage arrière (batteries, ballast)
  part(group, loft([[-3.4, 0.05, 0.05, 0.2], [-2.9, 0.6, 0.5, 0.2], [-1.6, 0.95, 0.8, 0.2], [-0.5, 1.0, 0.9, 0.2]], 36, 5), ['#e0e4e2', '#d0d6d4'], 0.02);
  solid(group, blob(0.5, 0.08, 0.7), lambert('#c0462a'), 0, 1.02, -1.6);
  // Châssis tubulaire : patins, arceaux, pare-chocs
  for (const side of [-1, 1]) {
    bar(group, [side * 1.25, -1.65, -2.9], [side * 1.25, -1.65, 2.3], 0.07, frame);
    bar(group, [side * 1.25, 1.35, -2.4], [side * 1.25, 1.35, 1.0], 0.05, frame);
    for (const z of [-2.4, -0.6, 1.0]) bar(group, [side * 1.25, -1.65, z], [side * 1.25, 1.35, z], 0.05, frame);
    bar(group, [side * 1.25, -1.65, 2.3], [side * 1.25, -0.2, 2.0], 0.05, frame);
    solid(group, new THREE.CapsuleGeometry(0.22, 1.6, 8, 16).rotateX(Math.PI / 2), lambert('#d8a03a'), side * 1.25, -1.3, -1.2);
  }
  for (const z of [-2.4, 1.0]) bar(group, [-1.25, 1.35, z], [1.25, 1.35, z], 0.05, frame);
  for (const z of [-2.9, 2.3]) bar(group, [-1.25, -1.65, z], [1.25, -1.65, z], 0.06, frame);
  // Quatre propulseurs : deux pour avancer, deux verticaux
  const props = [];
  for (const side of [-1, 1]) {
    const m = propeller(5, 0.42, '#d0d6d8', true, '#3a4044');
    m.group.position.set(side * 1.25, 0.2, -3.1);
    group.add(m.group);
    bar(group, [side * 1.25, 1.35, -2.4], [side * 1.25, 0.2, -3.0], 0.05, frame);
    props.push({ spin: m.spin, kind: 'main' });
    const l = propeller(4, 0.4, '#d0d6d8', true, '#3a4044');
    l.group.rotation.x = -Math.PI / 2;
    l.group.position.set(side * 1.75, 0.3, -0.6);
    group.add(l.group);
    bar(group, [side * 1.25, 0.3, -0.6], [side * 1.4, 0.3, -0.6], 0.06, frame);
    props.push({ spin: l.spin, kind: 'lift' });
  }
  // Rampe de projecteurs et paniers d'échantillons
  bar(group, [-1.0, -1.5, 2.25], [1.0, -1.5, 2.25], 0.05, dark);
  for (const x of [-0.75, 0, 0.75]) lamp(group, x, -1.5, 2.3, 0.2, '#3a4044');
  for (const x of [-0.6, 0.6]) lamp(group, x, 1.45, 1.1, 0.16, '#3a4044');
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -1.5, 2.45),
    cockpit: new THREE.Vector3(0, 0.15, 1.2),
    tail: new THREE.Vector3(0, 0.2, -3.5),
    clawRoot: new THREE.Vector3(0, -1.6, 1.4),
    clawRest: new THREE.Vector3(0, -2.2, 2.4),
  };
}

/** 6 : coque abyssale — large, sombre, angles arrondis, liserés lumineux, rotors verticaux */
function abyssal() {
  const group = new THREE.Group();
  const cols = ['#262b2f', '#2e3438', '#1f2427'];
  const cyan = '#7fd0c0';
  // Coque : section « carrée arrondie », nez plongeant, arrière effilé
  part(group, loft([[-4.8, 0.3, 0.2, 0, 3], [-4.1, 1.2, 0.7, 0, 3.6], [-2.2, 1.72, 1.02, 0, 4], [1.6, 1.72, 1.02, 0, 4], [3.1, 1.45, 0.82, -0.05, 3.4], [3.9, 0.95, 0.5, -0.15, 3], [4.25, 0.3, 0.15, -0.22, 2.6]], 56, 8), cols, 0);
  // Verrière panoramique teintée, sertie d'un liseré
  solid(group, blob(1.15, 0.5, 1.25), glassMat, 0, 0.55, 2.7);
  solid(group, new THREE.TorusGeometry(1, 0.025, 8, 64).rotateX(Math.PI / 2).scale(1.13, 1, 1.22), glowMat(cyan), 0, 0.62, 2.7);
  solid(group, blob(1.0, 0.3, 1.1), lambert('#0c1418'), 0, 0.5, 2.65);
  // Liserés lumineux le long des flancs, arêtes de carène
  for (const side of [-1, 1]) {
    bar(group, [side * 1.74, 0.28, -2.4], [side * 1.74, 0.28, 1.8], 0.025, glowMat(cyan));
    bar(group, [side * 1.74, -0.28, -2.4], [side * 1.74, -0.28, 1.8], 0.02, glowMat('#2f4a66'));
    part(group, blob(0.5, 0.06, 1.2, side * 1.9, -0.1, -3.2), cols);
  }
  part(group, blob(0.07, 0.55, 1.3, 0, 1.25, -2.0), cols);
  solid(group, blob(0.28, 0.12, 0.4), lambert('#3a4044'), 0, 1.08, 1.2);
  solid(group, new THREE.CircleGeometry(0.06, 12), glowMat('#e0b050'), 0, 1.1, 1.605);

  // Quatre rotors verticaux carénés aux coins (montée / descente)
  const props = [];
  const dark = lambert('#30363a');
  for (const x of [-2.5, 2.5]) for (const z of [2.0, -2.5]) {
    solid(group, blob(0.55, 0.11, 0.2), dark, x * 0.8, 0.1, z);
    const r = propeller(5, 0.62, '#9aa3a6', true, '#1f2427');
    r.group.rotation.x = -Math.PI / 2; // axe vertical
    r.group.position.set(x, 0.12, z);
    group.add(r.group);
    props.push({ spin: r.spin, kind: 'lift' });
    solid(group, new THREE.TorusGeometry(0.74, 0.022, 8, 48).rotateX(Math.PI / 2), glowMat(cyan), x, 0.42, z);
  }
  // Deux propulseurs arrière
  for (const side of [-1, 1]) {
    part(group, loft([[-5.2, 0.5, 0.5, -0.2], [-4.6, 0.56, 0.56, -0.2], [-3.6, 0.4, 0.4, -0.2], [-3.2, 0.05, 0.05, -0.2]], 28, 4).translate(side * 1.05, 0, 0), cols);
    const p = propeller(7, 0.44, '#9aa3a6', false);
    p.group.position.set(side * 1.05, -0.2, -5.1);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
    solid(group, new THREE.TorusGeometry(0.5, 0.02, 8, 40), glowMat(cyan), side * 1.05, -0.2, -5.2);
  }
  // Rampe de projecteurs encastrée sous le nez
  solid(group, blob(1.45, 0.13, 0.2), dark, 0, -0.78, 3.75);
  for (const x of [-1.05, -0.35, 0.35, 1.05]) solid(group, new THREE.CircleGeometry(0.16, 20).scale(1.3, 0.6, 1), glowMat('#efe3bb'), x, -0.78, 3.96);
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -0.78, 4.2),
    cockpit: new THREE.Vector3(0, 0.5, 3.1),
    tail: new THREE.Vector3(0, -0.2, -5.6),
    clawRoot: new THREE.Vector3(0, -1.15, 3),
    clawRest: new THREE.Vector3(0, -1.75, 4.1),
  };
}

const BUILDERS = [() => classic(0), () => classic(1), reinforced, doubleHull, bathyscaphe, pressureSphere, abyssal];

/** Nombre de modèles (= niveaux de coque) */
export const SUB_MODEL_COUNT = BUILDERS.length;

/**
 * Construit le modèle correspondant au niveau de coque.
 * @returns {{ group, propellers: {spin, kind}[], lampPosition, cockpit, tail, clawRoot?, clawRest? }}
 */
export function createSubmarineModel(level = 0) {
  glassMat.visible = gpuMode.active; // pas de shader de verre dans le rendu Three.js
  const build = BUILDERS[Math.max(0, Math.min(level, BUILDERS.length - 1))];
  const model = build();
  model.level = level;
  model.group.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });
  return model;
}

/** Fait tourner les hélices : main = poussée avant, lift = montée/descente */
export function spinPropellers(model, dt, throttle, lift) {
  for (const p of model.propellers) {
    const speed = p.kind === 'lift' ? lift * 16 + 0.4 : throttle * 14 + 0.6;
    p.spin.rotation.z += speed * dt;
  }
}
