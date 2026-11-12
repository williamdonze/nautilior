import * as THREE from 'three';
import layout from './layout.json';
import { paintFaces, createRandom } from '../core/utils.js';
import { createSubmarineModel } from '../submarine/subModel.js';

/**
 * Construit le décor du port : quai de granit, maisons fermées, hôpital, boutique,
 * criée, atelier, bateaux qui pourrissent, réverbères, et le Nautiliar à quai.
 * Renvoie aussi les obstacles (boîtes au sol) et les points d'interaction des maisons.
 */
const rand = createRandom(29);
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GLOW = new THREE.MeshBasicMaterial({ color: '#cdb57c' });
const DARK = lambert('#17191a');
const WOOD = lambert('#3e2114');
const SHUTTER = lambert('#2c4430');

/** Peint une géométrie de petites variations (pierre irrégulière) */
function stone(geo, hex, variation = 0.12) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const base = new THREE.Color(hex);
  const c = new THREE.Color();
  paintFaces(geo, () => c.copy(base).multiplyScalar(1 - variation + rand() * variation * 2));
  return geo;
}

/** Toit à deux pans (prisme), faîtage le long de X */
function gableRoof(w, d, h) {
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2];
  const E = [-w / 2, h, 0], F = [w / 2, h, 0];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return geo;
}

function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Éléments que la fin « Traverser » transforme (le vrai Port-Kerys, vivant)
const tagged = { shutters: [], darkWindows: [], boats: [] };

/** Une fenêtre : éclairée, sombre, ou fermée par des volets */
function windowAt(parent, x, y, z, state) {
  const w = box(0.9, 1.1, 0.12, state === 'lit' ? GLOW : DARK, x, y, z, parent);
  if (state !== 'lit') tagged.darkWindows.push(w);
  if (state === 'shut') {
    tagged.shutters.push(box(0.48, 1.2, 0.1, SHUTTER, x - 0.24, y, z + 0.06, parent));
    tagged.shutters.push(box(0.48, 1.2, 0.1, SHUTTER, x + 0.24, y, z + 0.06, parent));
  }
}

function buildBuilding(b, group, colliders, lights) {
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  group.add(g);
  const front = b.d / 2 + 0.06;

  // Murs et toit
  const walls = new THREE.Mesh(stone(new THREE.BoxGeometry(b.w, b.h, b.d), b.wall), vertexMat);
  walls.position.y = b.h / 2;
  g.add(walls);
  const roofH = b.kind === 'workshop' ? 1.2 : b.kind === 'criee' ? 1.4 : 2.4;
  const roof = new THREE.Mesh(stone(gableRoof(b.w + 0.7, b.d + 0.9, roofH), b.roof, 0.08), vertexMat);
  roof.position.y = b.h;
  g.add(roof);
  // Cheminée
  if (b.kind === 'house' || b.kind === 'hospital') {
    box(0.7, 1.8, 0.7, lambert('#45484a'), b.w * 0.3, b.h + 1.4, -b.d * 0.15, g);
  }

  // Porte
  const doorW = b.kind === 'workshop' ? 3.4 : b.kind === 'criee' ? 2.2 : 1.2;
  const doorH = b.kind === 'workshop' ? 3.4 : 2.2;
  box(doorW, doorH, 0.12, b.kind === 'workshop' ? lambert('#0c0a08') : WOOD, 0, doorH / 2, front, g);
  // Linteau de granit
  box(doorW + 0.5, 0.3, 0.25, lambert('#45484a'), 0, doorH + 0.15, front, g);

  // Fenêtres
  const cols = Math.max(1, Math.floor(b.w / 3));
  for (let i = 0; i < cols; i++) {
    const x = -b.w / 2 + (b.w / cols) * (i + 0.5);
    if (Math.abs(x) < doorW / 2 + 0.8) continue;
    const state = b.lit && i === 0 ? 'lit' : b.kind === 'house' ? 'shut' : 'dark';
    windowAt(g, x, b.h * 0.55, front, state);
    if (b.h > 5.5) windowAt(g, x, b.h * 0.82, front, b.kind === 'house' ? 'shut' : 'dark');
  }

  // Détails selon le type
  if (b.kind === 'hospital') {
    // Croix et lampe au-dessus de la porte
    box(0.9, 0.25, 0.1, lambert('#a8bdb2'), 0, doorH + 1.0, front + 0.05, g);
    box(0.25, 0.9, 0.1, lambert('#a8bdb2'), 0, doorH + 1.0, front + 0.05, g);
  }
  if (b.kind === 'shop') {
    // Auvent
    const awning = box(b.w * 0.8, 0.1, 1.4, lambert('#63321b'), 0, doorH + 0.5, front + 0.7, g);
    awning.rotation.x = 0.25;
    // Caisses devant la boutique
    for (let i = 0; i < 3; i++) box(0.8, 0.6, 0.8, WOOD, b.w / 2 - 0.6 - i * 0.2, 0.3 + i * 0.6 * (i === 2 ? 1 : 0), front + 1.0 + (i % 2) * 0.9, g);
  }
  if (b.kind === 'criee') {
    // Enseigne délavée
    box(4, 0.7, 0.1, lambert('#83a39a'), 0, b.h - 0.4, front + 0.05, g);
  }
  if (b.kind === 'workshop') {
    // Bidons et pièces détachées
    for (let i = 0; i < 4; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 7), lambert(i % 2 ? '#63321b' : '#2a5056'));
      barrel.position.set(-b.w / 2 - 0.6, 0.45, front - 1 - i * 0.8);
      g.add(barrel);
    }
    colliders.push({ minX: b.x - b.w / 2 - 1.1, maxX: b.x - b.w / 2, minZ: b.z + front - 4, maxZ: b.z + front - 0.5 });
  }

  // Lumière chaude à la porte des lieux habités
  if (b.lit) {
    const lamp = new THREE.PointLight('#cdb57c', 6, 9, 1.4);
    lamp.position.set(b.x, doorH + 0.8, b.z + front + 1.0);
    lights.push(lamp);
    group.add(lamp);
    box(0.25, 0.3, 0.25, GLOW, 0.9, doorH + 0.6, front + 0.2, g);
  }

  colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
}

/** Coque de barque en train de pourrir */
function rottenBoat(group, x, y, z, rotY, tilt, length = 5) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(0, rotY, tilt);
  const hullGeo = new THREE.CylinderGeometry(1, 1, length, 8, 1, true, 0, Math.PI);
  hullGeo.rotateZ(Math.PI / 2);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(1, 0.7, 1);
  const hull = new THREE.Mesh(stone(hullGeo, '#3e2114', 0.25), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  hull.rotation.z = Math.PI; // ouverture vers le haut
  g.add(hull);
  // Membrures apparentes
  for (let i = -1; i <= 1; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 3, 6, Math.PI), WOOD);
    rib.position.x = i * length * 0.25;
    rib.rotation.y = Math.PI / 2;
    rib.rotation.x = Math.PI;
    g.add(rib);
  }
  box(0.12, 2.2, 0.12, WOOD, length * 0.15, 0.8, 0, g).rotation.z = 0.5;
  group.add(g);
  tagged.boats.push(g);
}

function lampPost(group, x, z, lit, lights) {
  box(0.14, 3.6, 0.14, DARK, x, 1.8, z, group);
  box(0.6, 0.1, 0.1, DARK, x + 0.25, 3.55, z, group);
  box(0.25, 0.35, 0.25, lit ? GLOW : DARK, x + 0.5, 3.35, z, group);
  if (lit) {
    const l = new THREE.PointLight('#cdb57c', 4, 8, 1.5);
    l.position.set(x + 0.5, 3.1, z);
    lights.push(l);
    group.add(l);
  }
}

export function buildPort() {
  const group = new THREE.Group();
  const colliders = [];
  const lights = [];
  const interactables = [];

  // --- Sol : quai de granit + village
  const ground = new THREE.Mesh(stone(new THREE.BoxGeometry(110, 2, 60, 22, 1, 12), '#4a4f50', 0.1), vertexMat);
  ground.position.set(0, -1, -24);
  group.add(ground);
  // Bordure du quai (gros blocs)
  for (let x = -54; x < 54; x += 2.2) {
    box(2.1, 0.5, 1.2, lambert(rand() < 0.5 ? '#5f6564' : '#45484a'), x, 0.05, 5.7, group);
  }
  // Bollards et anneaux d'amarrage
  for (const x of [-26, -8, 6, 18, 30]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.7, 6), DARK);
    b.position.set(x, 0.35, 5.0);
    group.add(b);
    colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: 4.65, maxZ: 5.35 });
  }
  // Échelle qui descend vers le sous-marin
  for (let i = 0; i < 4; i++) box(0.9, 0.06, 0.06, DARK, layout.sub.x, -0.2 - i * 0.4, 6.35, group);

  // --- Bâtiments
  for (const b of layout.buildings) {
    buildBuilding(b, group, colliders, lights);
    if (b.kind === 'house') {
      interactables.push({ id: b.id, kind: 'house', x: b.x, z: b.z + b.d / 2 + 1.0, label: 'Frapper à la porte' });
    }
  }

  // Clocher de la chapelle au loin
  const tower = new THREE.Mesh(stone(new THREE.BoxGeometry(3, 11, 3), '#5f6564'), vertexMat);
  tower.position.set(-6, 5.5, -36);
  group.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.3, 6, 4), lambert('#26292b'));
  spire.position.set(-6, 14, -36);
  spire.rotation.y = Math.PI / 4;
  group.add(spire);

  // --- Réverbères (deux seulement allumés)
  lampPost(group, -24, 3.6, false, lights);
  lampPost(group, -9, 3.6, true, lights);
  lampPost(group, 4, 3.6, false, lights);
  lampPost(group, 28, 3.6, true, lights);

  // --- Bateaux qui pourrissent
  rottenBoat(group, -20, -0.9, 13, 0.4, 0.35, 6);
  rottenBoat(group, -34, -0.3, 9, -0.9, -0.5, 5);
  rottenBoat(group, 30, -1.1, 15, 1.2, 0.2, 7);
  rottenBoat(group, 36, 0.4, -2, 0.2, 0.6, 4.5); // échouée sur le quai
  colliders.push({ minX: 33, maxX: 39, minZ: -4.5, maxZ: 0.5 });

  // Casiers et filets abandonnés sur le quai
  for (const [x, z] of [[-29, 2.5], [-27.6, 3.2], [-5, 3.4], [33, 3.2]]) {
    box(1.1, 0.5, 0.75, lambert('#63321b'), x, 0.25, z, group).rotation.y = rand() * 3;
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
  }

  // --- Mer
  const waterGeo = new THREE.PlaneGeometry(400, 220, 80, 44);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, 116);
  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = new THREE.MeshLambertMaterial({ color: '#1f4049', flatShading: true });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += sin(position.x * 0.21 + uTime * 0.8) * 0.18 + cos(position.z * 0.17 + uTime * 0.6) * 0.18;`
      );
  };
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -1.1;
  group.add(water);

  // --- Le Nautiliar à quai (le modèle change avec la coque)
  const subRoot = new THREE.Group();
  subRoot.position.set(layout.sub.x, -0.75, layout.sub.z);
  subRoot.rotation.y = -Math.PI / 2;
  group.add(subRoot);
  let sub = createSubmarineModel(0);
  subRoot.add(sub.group);

  return {
    group,
    colliders,
    lights,
    interactables,
    get sub() {
      return sub;
    },
    tagged,
    glowMaterial: GLOW,
    /** Remplace le sous-marin à quai par le modèle du niveau de coque */
    setSubModel(level) {
      if (sub.level === level) return;
      subRoot.clear();
      sub = createSubmarineModel(level);
      subRoot.add(sub.group);
      // Les plus gros modèles flottent un peu plus haut
      subRoot.position.y = level === 4 ? 0.2 : level >= 5 ? -0.2 : -0.75;
    },
    update(time) {
      waterUniforms.uTime.value = time;
      // Le sous-marin tangue doucement
      subRoot.position.y += (Math.sin(time * 0.9) * 0.08 - (subRoot.userData.bob ?? 0));
      subRoot.userData.bob = Math.sin(time * 0.9) * 0.08;
      subRoot.rotation.z = Math.sin(time * 0.7) * 0.03;
    },
  };
}
