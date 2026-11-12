import * as THREE from 'three';
import { paintFaces } from '../core/utils.js';
import { createNoise2D } from '../world/noise.js';

/**
 * Les sept Nautiliar, un par niveau de coque (voir config/upgrades.json) :
 *   0  Tôle d'origine        — le vieux cigare rouillé
 *   1  Tôles rivetées         — rapiécé, cerclages rivetés, moins de rouille
 *   2  Renforts d'acier       — peint acier, longerons, hélice carénée, double phare
 *   3  Double coque           — plus long, cage extérieure, propulseurs latéraux
 *   4  Coque de bathyscaphe   — flotteur jaune et sphère habitable dessous
 *   5  Sphère de pression     — sphère de titane dans un châssis tubulaire, 4 propulseurs
 *   6  Coque abyssale         — coque anguleuse et sombre, liserés lumineux,
 *                               4 rotors verticaux pour monter et descendre
 * Chaque modèle fournit : ses maillages, ses hélices (main = avance, lift = montée/descente),
 * la position du phare, du poste de pilotage (vue à la 1re personne) et de l'épaule du bras.
 * Axe avant = +Z.
 */
const noise = createNoise2D(42);

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color });
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Peint une géométrie : couleur de base + taches de rouille (amount 0..1) */
function paint(geo, base, rustAmount = 0.4, rustColors = ['#63321b', '#8a4f28', '#3e2114']) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const bases = (Array.isArray(base) ? base : [base]).map((h) => new THREE.Color(h));
  const rust = rustColors.map((h) => new THREE.Color(h));
  const c = new THREE.Color();
  paintFaces(geo, (p, n, i) => {
    const v = noise(p.x * 1.4 + p.z * 0.9, p.y * 1.8 - p.z * 0.6) * 0.5 + 0.5;
    const drip = noise(p.z * 2.2 + p.x, 3.7) * 0.5 + 0.5;
    const r = v + (n.y < -0.2 ? 0.15 : 0) + (drip > 0.7 && p.y < 0.4 ? 0.2 : 0);
    if (r > 1 - rustAmount) return c.copy(rust[i % rust.length]);
    return c.copy(bases[i % bases.length]);
  });
  return geo;
}

/** Ajoute un maillage peint au groupe */
function part(group, geo, base, rust = 0, rustColors) {
  const m = new THREE.Mesh(paint(geo, base, rust, rustColors), vmat);
  group.add(m);
  return m;
}

function solid(group, geo, material) {
  const m = new THREE.Mesh(geo, material);
  group.add(m);
  return m;
}

/** Hélice : moyeu + pales, éventuellement carénée. Tourne autour de son axe Z local. */
function propeller(blades = 3, radius = 0.6, color = '#26292b', duct = false, ductColor = '#3f4446') {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const hub = new THREE.ConeGeometry(radius * 0.28, radius * 0.6, 6);
  hub.rotateX(-Math.PI / 2);
  solid(spin, hub, lambert(color));
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.BoxGeometry(radius * 0.3, radius, 0.05);
    blade.translate(0, radius * 0.55, 0);
    blade.rotateY(0.5);
    blade.rotateZ((i / blades) * Math.PI * 2);
    solid(spin, blade, lambert(color));
  }
  if (duct) {
    const ring = new THREE.TorusGeometry(radius * 1.15, radius * 0.12, 4, 14);
    const r = solid(g, ring, lambert(ductColor));
    r.scale.z = 2.2;
  }
  return { group: g, spin };
}

/** Cylindre couché le long de Z */
const tube = (rTop, rBottom, length, seg = 8, hSeg = 1) => {
  const g = new THREE.CylinderGeometry(rTop, rBottom, length, seg, hSeg);
  g.rotateX(Math.PI / 2);
  return g;
};

/** Hublot éclairé de l'intérieur */
function porthole(group, x, y, z, r, axis = 'x', color = '#cdb57c') {
  const g = new THREE.CylinderGeometry(r, r, 0.1, 8);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return solid(group, g, glowMat(color));
}

/** Projecteur : boîtier + verre lumineux, orienté vers +Z */
function lamp(group, x, y, z, r = 0.32, housing = '#26292b') {
  const h = tube(r * 1.1, r * 1.3, r * 1.2, 7);
  h.translate(x, y, z);
  part(group, h, housing);
  const glass = new THREE.CircleGeometry(r * 0.95, 8);
  glass.translate(x, y, z + r * 0.62);
  solid(group, glass, glowMat('#efe3bb'));
}

/* ================================================================== Modèles */

/** 0 & 1 : le cigare d'origine (1 = rapiécé, rivé, moins rouillé) */
function classic(level) {
  const group = new THREE.Group();
  const patched = level === 1;
  const paintCols = patched ? ['#56645a', '#4f5d54', '#5e6b5f'] : ['#4b5a52', '#56645a', '#42504a'];
  const rust = patched ? 0.22 : 0.45;

  part(group, tube(1, 1, 6, 8, 3), paintCols, rust);
  const nose = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 1.1);
  nose.translate(0, 0, 3);
  part(group, nose, paintCols, rust * 0.8);
  const tail = new THREE.ConeGeometry(1, 2.4, 8, 2);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -4.2);
  part(group, tail, paintCols, rust * 1.2);

  // Cerclages rivetés (plus nombreux une fois rapiécé)
  const rings = patched ? [-2.6, -1.3, 0, 1.3, 2.6] : [-2.2, 0, 2.2];
  for (const z of rings) {
    const ring = new THREE.TorusGeometry(1.03, 0.07, 3, 8);
    ring.rotateZ(Math.PI / 8);
    ring.translate(0, 0, z);
    part(group, ring, '#26292b');
    if (patched) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const rivet = new THREE.IcosahedronGeometry(0.06, 0);
        rivet.translate(Math.cos(a) * 1.1, Math.sin(a) * 1.1, z);
        part(group, rivet, '#878a85');
      }
    }
  }
  // Plaques de réparation boulonnées
  if (patched) {
    for (const [x, y, z, ry] of [[0.98, 0.3, 1.6, 0], [-0.98, -0.2, -1.2, 0], [0.6, 0.8, -2.4, 0.6]]) {
      const plate = new THREE.BoxGeometry(0.06, 0.8, 1.1);
      plate.rotateZ(Math.atan2(y, x) - (x < 0 ? Math.PI : 0));
      plate.translate(x, y, z);
      part(group, plate, ['#6b6e6c', '#5f6564'], 0.1);
    }
  }

  // Kiosque et périscope
  const tower = new THREE.CylinderGeometry(0.5, 0.7, 1.2, 6);
  tower.scale(1, 1, 1.6);
  tower.translate(0, 1.35, 0.4);
  part(group, tower, paintCols, rust * 1.1);
  const hatch = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 6);
  hatch.translate(0, 2.0, 0.3);
  part(group, hatch, '#26292b');
  const peri = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4);
  peri.translate(0, 2.4, 0.9);
  part(group, peri, '#26292b');
  const periHead = new THREE.BoxGeometry(0.16, 0.14, 0.3);
  periHead.translate(0, 2.95, 1.0);
  part(group, periHead, '#26292b');

  for (const side of [-1, 1]) for (const z of [1.2, -0.4]) porthole(group, side * 0.98, 0.2, z, 0.2);

  // Ailerons
  const finH = new THREE.BoxGeometry(2.8, 0.08, 0.7);
  finH.translate(0, 0, -4.0);
  part(group, finH, paintCols, rust);
  const finV = new THREE.BoxGeometry(0.08, 1.8, 0.7);
  finV.translate(0, 0, -4.0);
  part(group, finV, paintCols, rust);
  const finF = new THREE.BoxGeometry(2.6, 0.06, 0.45);
  finF.translate(0, 0.1, 2.0);
  part(group, finF, paintCols, rust);

  lamp(group, 0, -0.35, 3.75, 0.32);

  const prop = propeller(3, 0.6);
  prop.group.position.set(0, 0, -5.45);
  group.add(prop.group);
  const shroud = new THREE.TorusGeometry(0.7, 0.07, 3, 10);
  shroud.translate(0, 0, -5.45);
  part(group, shroud, paintCols, 0.5);

  return {
    group,
    propellers: [{ spin: prop.spin, kind: 'main' }],
    lampPosition: new THREE.Vector3(0, -0.35, 4.2),
    cockpit: new THREE.Vector3(0, 0.25, 2.6),
    tail: new THREE.Vector3(0, 0, -5.6),
  };
}

/** 2 : renforts d'acier — peint gris acier, longerons, hélice carénée, deux phares */
function reinforced() {
  const group = new THREE.Group();
  const cols = ['#3f4a54', '#45505a', '#39434c'];
  part(group, tube(1.05, 1.05, 6.4, 10, 3), cols, 0.12);
  const nose = new THREE.SphereGeometry(1.05, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 1.2);
  nose.translate(0, 0, 3.2);
  part(group, nose, cols, 0.08);
  const tail = new THREE.ConeGeometry(1.05, 2.2, 10, 2);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -4.3);
  part(group, tail, cols, 0.15);
  // Longerons d'acier
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rail = new THREE.BoxGeometry(0.14, 0.14, 7.2);
    rail.translate(Math.cos(a) * 1.08, Math.sin(a) * 1.08, -0.2);
    part(group, rail, '#26292b');
  }
  // Kiosque bas et profilé
  const tower = new THREE.BoxGeometry(1.1, 0.9, 2.4);
  tower.translate(0, 1.3, 0.5);
  part(group, tower, cols, 0.1);
  const visor = new THREE.BoxGeometry(0.9, 0.25, 0.1);
  visor.translate(0, 1.4, 1.72);
  solid(group, visor, glowMat('#cdb57c'));
  for (const side of [-1, 1]) for (const z of [1.5, 0.3, -0.9]) porthole(group, side * 1.03, 0.25, z, 0.18);
  // Ailerons plus grands
  for (const [w, h] of [[3.4, 0.1], [0.1, 2.4]]) {
    const fin = new THREE.BoxGeometry(w, h, 0.9);
    fin.translate(0, 0, -4.1);
    part(group, fin, cols, 0.1);
  }
  lamp(group, -0.45, -0.45, 3.95, 0.26);
  lamp(group, 0.45, -0.45, 3.95, 0.26);
  const prop = propeller(5, 0.62, '#26292b', true, '#3f4a54');
  prop.group.position.set(0, 0, -5.5);
  group.add(prop.group);
  return {
    group,
    propellers: [{ spin: prop.spin, kind: 'main' }],
    lampPosition: new THREE.Vector3(0, -0.45, 4.3),
    cockpit: new THREE.Vector3(0, 0.3, 2.9),
    tail: new THREE.Vector3(0, 0, -5.7),
  };
}

/** 3 : double coque — plus long, cage extérieure, deux propulseurs latéraux */
function doubleHull() {
  const group = new THREE.Group();
  const inner = ['#2f3d40', '#344447'];
  part(group, tube(1, 1, 7.5, 10, 4), inner, 0.06);
  const nose = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 1.3);
  nose.translate(0, 0, 3.75);
  part(group, nose, inner, 0.05);
  const tail = new THREE.ConeGeometry(1, 2, 10, 2);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -4.75);
  part(group, tail, inner);
  // Cage : anneaux et barres autour de la coque intérieure
  for (let z = -3.4; z <= 3.4; z += 1.13) {
    const ring = new THREE.TorusGeometry(1.32, 0.08, 4, 12);
    ring.translate(0, 0, z);
    part(group, ring, '#5f6564');
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bar = new THREE.BoxGeometry(0.1, 0.1, 6.9);
    bar.translate(Math.cos(a) * 1.32, Math.sin(a) * 1.32, 0);
    part(group, bar, '#5f6564');
  }
  // Kiosque vitré
  const tower = new THREE.CylinderGeometry(0.75, 0.85, 1, 8);
  tower.scale(1, 1, 1.5);
  tower.translate(0, 1.55, 1);
  part(group, tower, inner);
  const dome = new THREE.SphereGeometry(0.7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.7, 1.4);
  dome.translate(0, 2.05, 1);
  solid(group, dome, new THREE.MeshLambertMaterial({ color: '#2a5056', transparent: true, opacity: 0.7, flatShading: true }));
  for (const side of [-1, 1]) for (const z of [2.2, 0.8, -0.6, -2]) porthole(group, side * 1, 0.1, z, 0.17);
  // Propulseurs latéraux
  const props = [];
  for (const side of [-1, 1]) {
    const pod = tube(0.42, 0.42, 1.8, 8);
    pod.translate(side * 1.9, -0.3, -2.6);
    part(group, pod, '#26292b');
    const arm = new THREE.BoxGeometry(0.8, 0.15, 0.5);
    arm.translate(side * 1.45, -0.3, -2.6);
    part(group, arm, '#26292b');
    const p = propeller(4, 0.38, '#878a85', true, '#26292b');
    p.group.position.set(side * 1.9, -0.3, -3.6);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
  }
  const fin = new THREE.BoxGeometry(0.1, 2.2, 1.1);
  fin.translate(0, 0.4, -4.6);
  part(group, fin, inner);
  const prop = propeller(5, 0.5, '#26292b', true, '#5f6564');
  prop.group.position.set(0, 0, -5.9);
  group.add(prop.group);
  props.push({ spin: prop.spin, kind: 'main' });
  lamp(group, 0, -0.5, 4.75, 0.34);
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -0.5, 5.15),
    cockpit: new THREE.Vector3(0, 0.3, 3.3),
    tail: new THREE.Vector3(0, 0, -6),
  };
}

/** 4 : bathyscaphe — grand flotteur jaune, sphère habitable suspendue dessous */
function bathyscaphe() {
  const group = new THREE.Group();
  const yellow = ['#b8963a', '#a8873a', '#c4a24a'];
  // Flotteur
  part(group, tube(1.25, 1.25, 7, 12, 3), yellow, 0.1, ['#7a5a26', '#63321b']);
  for (const [z, s] of [[3.5, 1], [-3.5, -1]]) {
    const cap = new THREE.SphereGeometry(1.25, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateX((s * Math.PI) / 2);
    cap.scale(1, 1, 1.3);
    cap.translate(0, 0, z);
    part(group, cap, yellow, 0.1, ['#7a5a26']);
  }
  // Passerelle sur le dessus
  const deck = new THREE.BoxGeometry(0.9, 0.12, 6);
  deck.translate(0, 1.3, 0);
  part(group, deck, '#3e2114');
  const tower = new THREE.BoxGeometry(0.9, 1, 1.4);
  tower.translate(0, 1.8, 0.6);
  part(group, tower, yellow, 0.08);
  // Sphère habitable, sous le flotteur
  const sphere = new THREE.SphereGeometry(1.05, 12, 8);
  sphere.translate(0, -1.75, 1.3);
  part(group, sphere, ['#5f6564', '#6b6e6c'], 0.05);
  const neck = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 8);
  neck.translate(0, -0.9, 1.3);
  part(group, neck, '#45484a');
  porthole(group, 0, -1.6, 2.35, 0.3, 'z', '#efe3bb');
  porthole(group, 0.75, -1.95, 2.05, 0.14, 'z');
  // Ailerons de queue en croix
  for (const [w, h] of [[3, 0.1], [0.1, 3]]) {
    const fin = new THREE.BoxGeometry(w, h, 1);
    fin.translate(0, 0, -4.4);
    part(group, fin, yellow, 0.1);
  }
  // Deux petites hélices sur le pont arrière
  const props = [];
  for (const side of [-1, 1]) {
    const p = propeller(3, 0.4, '#26292b', true, '#45484a');
    p.group.position.set(side * 0.9, 1.2, -3.6);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
  }
  lamp(group, 0, -2.4, 2.2, 0.26);
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -2.4, 2.6),
    cockpit: new THREE.Vector3(0, -1.6, 2.15),
    tail: new THREE.Vector3(0, 1.2, -4),
    clawRoot: new THREE.Vector3(0, -2.6, 1.9),
    clawRest: new THREE.Vector3(0, -3.1, 2.9),
  };
}

/** 5 : sphère de pression — sphère de titane dans un châssis tubulaire, quatre propulseurs */
function pressureSphere() {
  const group = new THREE.Group();
  const ti = ['#9aa3a6', '#8a9396', '#a8b0b2'];
  const sphere = new THREE.SphereGeometry(1.6, 14, 10);
  part(group, sphere, ti, 0.02);
  // Grand dôme vitré à l'avant
  const dome = new THREE.SphereGeometry(1.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  dome.scale(1, 1, 0.55);
  dome.translate(0, 0.1, 1.3);
  solid(group, dome, new THREE.MeshLambertMaterial({ color: '#2a5056', transparent: true, opacity: 0.75, flatShading: true }));
  const domeRim = new THREE.TorusGeometry(1.08, 0.09, 4, 16);
  domeRim.translate(0, 0.1, 1.32);
  part(group, domeRim, '#45484a');
  // Châssis tubulaire (cadre en caisson)
  const frameCol = '#c08850';
  for (const x of [-1.9, 1.9]) for (const y of [-1.5, 1.5]) {
    const rail = new THREE.CylinderGeometry(0.1, 0.1, 5.4, 6);
    rail.rotateX(Math.PI / 2);
    rail.translate(x, y, -0.6);
    part(group, rail, frameCol);
  }
  for (const z of [1.8, -0.6, -3.2]) {
    for (const [w, h, x, y] of [[3.8, 0.12, 0, 1.5], [3.8, 0.12, 0, -1.5], [0.12, 3, 1.9, 0], [0.12, 3, -1.9, 0]]) {
      const b = new THREE.BoxGeometry(w, h, 0.12);
      b.translate(x, y, z);
      part(group, b, frameCol);
    }
  }
  // Réservoirs latéraux
  for (const side of [-1, 1]) {
    const tank = tube(0.45, 0.45, 2.6, 8);
    tank.translate(side * 1.9, -0.6, -1.4);
    part(group, tank, ['#e8ece2', '#ccd8cc']);
  }
  // Propulseurs : deux arrière, deux verticaux
  const props = [];
  for (const side of [-1, 1]) {
    const p = propeller(4, 0.42, '#26292b', true, '#3f4446');
    p.group.position.set(side * 1.2, 0.2, -3.3);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
    const v = propeller(4, 0.42, '#26292b', true, '#3f4446');
    v.group.rotation.x = -Math.PI / 2; // axe vertical
    v.group.position.set(side * 1.9, 1.75, -1.4);
    group.add(v.group);
    props.push({ spin: v.spin, kind: 'lift' });
  }
  // Rampe de projecteurs
  const bar = new THREE.BoxGeometry(3.2, 0.2, 0.3);
  bar.translate(0, -1.5, 1.9);
  part(group, bar, '#26292b');
  for (const x of [-1, 0, 1]) lamp(group, x, -1.5, 2.05, 0.22);
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -1.5, 2.3),
    cockpit: new THREE.Vector3(0, 0.15, 1.15),
    tail: new THREE.Vector3(0, 0.2, -3.5),
    clawRoot: new THREE.Vector3(0, -1.6, 1.4),
    clawRest: new THREE.Vector3(0, -2.2, 2.4),
  };
}

/** 6 : coque abyssale — carrée, sombre, futuriste ; quatre rotors verticaux carénés */
function abyssal() {
  const group = new THREE.Group();
  const hullCols = ['#2a2f33', '#30363a', '#24292c'];
  // Coque : section octogonale aplatie extrudée le long de Z, nez biseauté
  const shape = new THREE.Shape();
  const w = 1.7, h = 1.05, c = 0.45;
  shape.moveTo(-w + c, -h);
  shape.lineTo(w - c, -h);
  shape.lineTo(w, -h + c);
  shape.lineTo(w, h - c);
  shape.lineTo(w - c, h);
  shape.lineTo(-w + c, h);
  shape.lineTo(-w, h - c);
  shape.lineTo(-w, -h + c);
  shape.closePath();
  const body = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.35, bevelSegments: 1 });
  body.translate(0, 0, -3.8);
  part(group, body, hullCols, 0);
  // Visière avant : large bandeau sombre bordé de lumière
  const visor = new THREE.BoxGeometry(2.6, 0.55, 0.12);
  visor.rotateX(-0.35);
  visor.translate(0, 0.45, 4.05);
  solid(group, visor, new THREE.MeshLambertMaterial({ color: '#0c1a22', flatShading: true }));
  const visorEdge = new THREE.BoxGeometry(2.7, 0.05, 0.05);
  visorEdge.translate(0, 0.18, 4.15);
  solid(group, visorEdge, glowMat('#7fd0c0'));
  // Liserés lumineux sur les flancs
  for (const side of [-1, 1]) {
    for (const y of [0.35, -0.35]) {
      const strip = new THREE.BoxGeometry(0.05, 0.05, 5.5);
      strip.translate(side * 2.07, y, 0);
      solid(group, strip, glowMat(y > 0 ? '#7fd0c0' : '#2f4a66'));
    }
  }
  // Aileron dorsal et capteurs
  const fin = new THREE.BoxGeometry(0.12, 0.9, 2.4);
  fin.translate(0, 1.5, -1.6);
  part(group, fin, hullCols);
  const sensor = new THREE.BoxGeometry(0.5, 0.3, 0.6);
  sensor.translate(0, 1.2, 2.2);
  part(group, sensor, '#45484a');
  solid(group, new THREE.BoxGeometry(0.35, 0.08, 0.05).translate(0, 1.22, 2.52), glowMat('#e0b050'));

  // Quatre rotors verticaux carénés, aux coins (montée / descente)
  const props = [];
  for (const x of [-2.55, 2.55]) for (const z of [2.3, -2.6]) {
    const armGeo = new THREE.BoxGeometry(0.9, 0.2, 0.4);
    armGeo.translate(x * 0.82, 0.1, z);
    part(group, armGeo, '#3f4446');
    const r = propeller(4, 0.62, '#9aa3a6', true, '#26292b');
    r.group.rotation.x = -Math.PI / 2; // axe vertical
    r.group.position.set(x, 0.15, z);
    group.add(r.group);
    props.push({ spin: r.spin, kind: 'lift' });
    const ringGlow = new THREE.TorusGeometry(0.73, 0.03, 3, 16);
    ringGlow.rotateX(Math.PI / 2);
    ringGlow.translate(x, 0.6, z);
    solid(group, ringGlow, glowMat('#7fd0c0'));
  }
  // Deux propulseurs arrière carénés
  for (const side of [-1, 1]) {
    const pod = tube(0.55, 0.6, 1.4, 8);
    pod.translate(side * 1.05, -0.2, -4.6);
    part(group, pod, '#24292c');
    const p = propeller(6, 0.48, '#9aa3a6', true, '#24292c');
    p.group.position.set(side * 1.05, -0.2, -5.4);
    group.add(p.group);
    props.push({ spin: p.spin, kind: 'main' });
    const thrustGlow = new THREE.CircleGeometry(0.3, 10);
    thrustGlow.rotateY(Math.PI);
    thrustGlow.translate(side * 1.05, -0.2, -5.32);
    solid(group, thrustGlow, glowMat('#7fd0c0'));
  }
  // Rampe de projecteurs sous la visière
  const bar = new THREE.BoxGeometry(3, 0.18, 0.25);
  bar.translate(0, -0.75, 4.0);
  part(group, bar, '#24292c');
  for (const x of [-1.1, -0.37, 0.37, 1.1]) {
    const l = new THREE.BoxGeometry(0.42, 0.1, 0.05);
    l.translate(x, -0.75, 4.14);
    solid(group, l, glowMat('#efe3bb'));
  }
  return {
    group,
    propellers: props,
    lampPosition: new THREE.Vector3(0, -0.75, 4.3),
    cockpit: new THREE.Vector3(0, 0.45, 3.4),
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
