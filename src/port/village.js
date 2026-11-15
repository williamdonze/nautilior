import * as THREE from 'three';
import { paintFaces, createRandom } from '../core/utils.js';

/**
 * Le village de Port-Kermor en détail : maisons bretonnes (granit ou chaux, toits d'ardoise,
 * cheminées de pignon, lucarnes, encadrements de granit, volets colorés, voilages),
 * et tout ce qui fait un port : phare éteint sur sa jetée, chapelle et calvaire, fontaine,
 * cabine téléphonique, 4L abandonnée, boîte aux lettres, murets, casiers, filets, barques,
 * bouées, linge qui flotte, arbres tordus et goélands.
 */
const rand = createRandom(1984);
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const GLASS = lambert('#17191a');
const GLOW = new THREE.MeshBasicMaterial({ color: '#cdb57c' });
const GRANITE = '#878a85';
const SHUTTER_COLORS = ['#2f4a66', '#3c7048', '#8a3a2a', '#5b7a8a', '#e8ece2'];

/** Peint chaque face d'une variation de teinte (pierre, ardoise, crépi) */
function paint(geo, hex, variation = 0.12, dirt = null) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const base = new THREE.Color(hex), d = dirt ? new THREE.Color(dirt) : null, c = new THREE.Color();
  paintFaces(geo, (p) => {
    c.copy(base).multiplyScalar(1 - variation + rand() * variation * 2);
    // Salissures et humidité qui remontent du sol
    if (d && p.y < 0.9 + rand() * 0.6) c.lerp(d, 0.45);
    return c;
  });
  return geo;
}

function mesh(geo, material, x, y, z, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Toit à deux pans (prisme), faîtage le long de X */
export function gableRoof(w, d, h) {
  const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2];
  const E = [-w / 2, h, 0], F = [w / 2, h, 0];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return geo;
}

/* ================================================================== Ouvertures */

/**
 * Fenêtre à encadrement de granit, avec volets (fermés ou ouverts) et parfois un voilage.
 * state : 'shut' (volets clos), 'dark' (vitre noire), 'lit' (lumière chaude), 'curtain' (voilage)
 */
function windowAt(g, x, y, z, state, shutterColor, tagged, w = 0.85, h = 1.15) {
  const glass = mesh(new THREE.BoxGeometry(w, h, 0.06), state === 'lit' ? GLOW : GLASS, x, y, z, g);
  if (state !== 'lit') tagged.darkWindows.push(glass);
  // Croisillons
  mesh(new THREE.BoxGeometry(0.04, h, 0.04), lambert('#e8ece2'), x, y, z + 0.04, g);
  mesh(new THREE.BoxGeometry(w, 0.04, 0.04), lambert('#e8ece2'), x, y + h * 0.15, z + 0.04, g);
  // Encadrement : linteau, appui saillant, jambages
  const gr = lambert(GRANITE);
  mesh(new THREE.BoxGeometry(w + 0.36, 0.2, 0.14), gr, x, y + h / 2 + 0.1, z + 0.03, g);
  mesh(new THREE.BoxGeometry(w + 0.3, 0.1, 0.24), gr, x, y - h / 2 - 0.05, z + 0.08, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, h, 0.12), gr, x + s * (w / 2 + 0.07), y, z + 0.02, g);
  if (state === 'curtain') {
    // Voilage blanc tiré à moitié, derrière la vitre
    mesh(new THREE.PlaneGeometry(w * 0.5, h * 0.9), lambert('#d8d4c8', { side: THREE.DoubleSide }), x - w * 0.22, y, z - 0.02, g);
  }
  const shutMat = lambert(shutterColor);
  for (const s of [-1, 1]) {
    const shutter = new THREE.Group();
    shutter.position.set(x + s * (w / 2 + 0.14), y, z + 0.1);
    shutter.userData.side = s;
    g.add(shutter);
    const panel = mesh(new THREE.BoxGeometry(w / 2 + 0.02, h + 0.05, 0.05), shutMat, -s * (w / 4 + 0.02), 0, 0, shutter);
    // Lames horizontales
    for (let k = -2; k <= 2; k++) mesh(new THREE.BoxGeometry(w / 2 - 0.05, 0.025, 0.03), lambert('#26292b'), -s * (w / 4 + 0.02), k * h * 0.18, 0.03, shutter);
    if (state === 'shut') tagged.shutters.push(shutter);
    else shutter.rotation.y = s * -1.45; // volets ouverts, rabattus contre le mur
    panel.userData.open = state !== 'shut';
  }
}

function door(g, x, z, w, h, color, tagged) {
  const gr = lambert(GRANITE);
  mesh(new THREE.BoxGeometry(w, h, 0.1), lambert(color), x, h / 2, z, g);
  // Planches et heurtoir
  for (let i = 1; i < 4; i++) mesh(new THREE.BoxGeometry(0.02, h * 0.95, 0.02), lambert('#26292b'), x - w / 2 + (w / 4) * i, h / 2, z + 0.06, g);
  mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 8), lambert('#b08a50'), x, h * 0.6, z + 0.08, g);
  // Encadrement de granit en plein cintre et seuil
  mesh(new THREE.BoxGeometry(w + 0.5, 0.25, 0.18), gr, x, h + 0.12, z + 0.02, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.22, h, 0.16), gr, x + s * (w / 2 + 0.11), h / 2, z + 0.02, g);
  mesh(new THREE.BoxGeometry(w + 0.7, 0.18, 0.6), gr, x, 0.09, z + 0.32, g);
}

/** Enseigne peinte (texte dessiné sur une texture) */
function sign(g, text, w, h, x, y, z, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * (h / w));
  const c = canvas.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = fg;
  c.font = `bold ${Math.round(canvas.height * 0.62)}px Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width * 0.92);
  // Usure : quelques éclats de peinture
  c.fillStyle = bg;
  for (let i = 0; i < 40; i++) c.fillRect(rand() * canvas.width, rand() * canvas.height, 2 + rand() * 6, 1 + rand() * 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), lambert('#26292b'), x, y, z - 0.04, g);
  mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }), x, y, z, g);
}

/** Massif d'hortensias fanés */
function hydrangea(g, x, z) {
  const cols = ['#5b6f8a', '#8a6a7a', '#7a8a9a', '#6a5a6a'];
  for (let i = 0; i < 4; i++) {
    const r = 0.25 + rand() * 0.15;
    mesh(new THREE.IcosahedronGeometry(r, 0), lambert(rand.pick(cols)), x + (rand() - 0.5) * 0.7, 0.35 + rand() * 0.3, z + (rand() - 0.5) * 0.5, g);
  }
  mesh(new THREE.IcosahedronGeometry(0.4, 0), lambert('#2f3d2a'), x, 0.25, z, g);
}

/* ================================================================== Bâtiments */

/**
 * Construit un bâtiment du village.
 * b : { kind, x, z, w, d, h, wall, roof, lit, style ('granit' | 'chaux'), shutter, floors }
 */
export function buildBuilding(b, ctx) {
  const { group, colliders, lights, tagged } = ctx;
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  group.add(g);
  const front = b.d / 2;
  const chaux = b.style === 'chaux' || (b.kind === 'house' && rand() < 0.4 && !b.style);
  const wallColor = chaux ? '#cfcbbd' : b.wall;
  const shutterColor = b.shutter ?? rand.pick(SHUTTER_COLORS);

  // --- Murs : moellons de granit ou crépi chaulé taché
  const walls = new THREE.BoxGeometry(b.w, b.h, b.d, Math.ceil(b.w / 0.8), Math.ceil(b.h / 0.55), Math.ceil(b.d / 0.8));
  mesh(paint(walls, wallColor, chaux ? 0.05 : 0.16, chaux ? '#7a786a' : '#3f4446'), vmat, 0, b.h / 2, 0, g);
  // Soubassement sombre (humidité)
  mesh(paint(new THREE.BoxGeometry(b.w + 0.08, 0.45, b.d + 0.08), '#45484a', 0.1), vmat, 0, 0.22, 0, g);
  // Chaînages d'angle en granit
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let y = 0.5; y < b.h; y += 0.55) {
      const long = Math.round(y / 0.55) % 2;
      mesh(paint(new THREE.BoxGeometry(long ? 0.7 : 0.4, 0.5, long ? 0.4 : 0.7), GRANITE, 0.1), vmat, sx * (b.w / 2 - (long ? 0.33 : 0.18)), y, sz * (b.d / 2 - (long ? 0.18 : 0.33)), g);
    }
  }

  // --- Toit d'ardoise, faîtage, cheminées de pignon
  const roofH = b.kind === 'workshop' ? 1.3 : b.kind === 'criee' ? 1.5 : Math.min(3.2, b.d * 0.48);
  mesh(paint(gableRoof(b.w + 0.8, b.d + 1.0, roofH), b.roof, 0.1), vmat, 0, b.h, 0, g);
  mesh(new THREE.BoxGeometry(b.w + 0.85, 0.16, 0.22), lambert('#3f4446'), 0, b.h + roofH, 0, g);
  if (b.kind !== 'workshop' && b.kind !== 'criee') {
    for (const sx of b.w > 6 ? [-1, 1] : [rand() < 0.5 ? -1 : 1]) {
      const ch = mesh(paint(new THREE.BoxGeometry(0.95, roofH + 1.5, 0.9), GRANITE, 0.15), vmat, sx * (b.w / 2 - 0.1), b.h + (roofH + 1.5) / 2, 0, g);
      ch.position.y = b.h + (roofH + 1.5) / 2 - 0.3;
      mesh(new THREE.BoxGeometry(1.1, 0.12, 1.05), lambert('#5f6564'), sx * (b.w / 2 - 0.1), b.h + roofH + 1.0, 0, g);
      for (const o of [-0.2, 0.2]) mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 6), lambert('#8a4f28'), sx * (b.w / 2 - 0.1) + o, b.h + roofH + 1.25, 0, g);
    }
  }
  // Lucarnes sur le pan avant : la façade de la lucarne prolonge le mur, son toit rejoint le pan
  if ((b.kind === 'house' || b.kind === 'hospital') && b.h >= 4.4 && roofH > 1.6) {
    const n = b.w > 7 ? 2 : 1;
    const lh = Math.min(1.3, roofH * 0.55); // hauteur de la façade de lucarne
    const depth = (lh / roofH) * (b.d / 2 + 0.5) + 0.3; // profondeur jusqu'à rencontrer le pan
    for (let i = 0; i < n; i++) {
      const lx = n === 1 ? 0 : (i ? 1 : -1) * b.w * 0.22;
      const lz = front - depth / 2 + 0.05;
      mesh(paint(new THREE.BoxGeometry(1.3, lh, depth), chaux ? '#cfcbbd' : wallColor, 0.08), vmat, lx, b.h + lh / 2, lz, g);
      const r = mesh(paint(gableRoof(1.6, depth + 0.3, 0.7), b.roof, 0.1), vmat, lx, b.h + lh, lz + 0.1, g);
      r.rotation.y = Math.PI / 2;
      windowAt(g, lx, b.h + lh * 0.5, front + 0.06, b.kind === 'house' ? 'dark' : 'curtain', shutterColor, tagged, 0.6, Math.min(0.75, lh - 0.35));
    }
  }
  // Gouttière et descente
  mesh(new THREE.CylinderGeometry(0.06, 0.06, b.w + 0.6, 6).rotateZ(Math.PI / 2), lambert('#3f4446'), 0, b.h - 0.05, front + 0.45, g);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, b.h, 6), lambert('#3f4446'), b.w / 2 - 0.15, b.h / 2, front + 0.45, g);

  // --- Porte
  const doorW = b.kind === 'workshop' ? 3.4 : b.kind === 'criee' ? 2.2 : 1.1;
  const doorH = b.kind === 'workshop' ? 3.4 : 2.2;
  if (b.kind === 'workshop') mesh(new THREE.BoxGeometry(doorW, doorH, 0.1), lambert('#0c0a08'), 0, doorH / 2, front + 0.02, g);
  else door(g, 0, front + 0.02, doorW, doorH, b.door ?? (chaux ? shutterColor : '#3e2114'), tagged);

  // --- Fenêtres sur un ou deux niveaux
  const floors = b.floors ?? (b.h > 5.2 ? 2 : 1);
  const cols = Math.max(1, Math.floor(b.w / 2.4));
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols; i++) {
      const x = -b.w / 2 + (b.w / cols) * (i + 0.5);
      if (f === 0 && Math.abs(x) < doorW / 2 + 0.75) continue;
      let state = 'dark';
      if (b.kind === 'house') state = rand() < 0.7 ? 'shut' : rand() < 0.5 ? 'curtain' : 'dark';
      if (b.lit && f === 0 && i === 0) state = 'lit';
      const y = f === 0 ? 1.55 : Math.min(b.h - 0.8, 1.55 + 2.0 * f);
      windowAt(g, x, y, front + 0.02, state, shutterColor, tagged);
      // Jardinière aux fleurs mortes sous certaines fenêtres
      if (f === 0 && rand() < 0.4) {
        mesh(new THREE.BoxGeometry(0.9, 0.18, 0.25), lambert('#5a4a32'), x, y - 0.75, front + 0.2, g);
        for (let k = 0; k < 4; k++) mesh(new THREE.ConeGeometry(0.05, 0.25, 4), lambert('#4a3a22'), x - 0.3 + k * 0.2, y - 0.55, front + 0.2, g);
      }
    }
  }
  if (b.kind === 'house' && rand() < 0.6) hydrangea(g, rand() < 0.5 ? -b.w / 2 + 0.8 : b.w / 2 - 0.8, front + 0.7);

  // --- Particularités
  if (b.kind === 'hospital') {
    mesh(new THREE.BoxGeometry(0.9, 0.25, 0.1), lambert('#e8ece2'), 0, doorH + 1.0, front + 0.08, g);
    mesh(new THREE.BoxGeometry(0.25, 0.9, 0.1), lambert('#e8ece2'), 0, doorH + 1.0, front + 0.08, g);
    sign(g, 'HÔPITAL', 3.4, 0.5, 0, b.h - 0.55, front + 0.08, '#e8ece2', '#2f4a66');
  }
  if (b.kind === 'shop') {
    const awning = mesh(new THREE.BoxGeometry(b.w * 0.85, 0.08, 1.5), lambert('#63321b'), 0, doorH + 0.55, front + 0.75, g);
    awning.rotation.x = 0.28;
    for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(b.w * 0.85 / 6 - 0.02, 0.09, 1.5), lambert(i % 2 ? '#e8ece2' : '#8a3a2a'), -b.w * 0.85 / 2 + (b.w * 0.85 / 6) * (i + 0.5), doorH + 0.56, front + 0.75, g).rotation.x = 0.28;
    // Étal de caisses et paniers
    for (let i = 0; i < 4; i++) mesh(paint(new THREE.BoxGeometry(0.7, 0.5, 0.6), '#5a4a32', 0.15), vmat, b.w / 2 - 0.6 - (i % 2) * 0.75, 0.25 + Math.floor(i / 2) * 0.5, front + 1.0, g);
    sign(g, 'ÉPICERIE', 2.6, 0.45, 0, b.h - 0.5, front + 0.07, '#26292b', '#cdb57c');
  }
  if (b.kind === 'criee') {
    sign(g, 'CRIÉE MUNICIPALE', 4.4, 0.6, 0, b.h - 0.45, front + 0.08, '#83a39a', '#1f3040');
    // Grandes baies vitrées du hall de criée
    for (const s of [-1, 1]) windowAt(g, s * (b.w / 2 - 2), 2.0, front + 0.02, 'dark', '#5b7a8a', tagged, 2.2, 1.6);
  }
  if (b.kind === 'cafe') {
    // Le Bar des Marins : enseigne, chaises empilées, ardoise
    sign(g, 'BAR DES MARINS', 3.8, 0.6, 0, b.h - 0.55, front + 0.08, '#8a3a2a', '#e8ece2');
    for (let i = 0; i < 3; i++) {
      const cx = b.w / 2 - 0.8 - i * 0.2;
      mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), lambert('#3e2114'), cx, 0.5 + i * 0.12, front + 1.0, g);
    }
    mesh(new THREE.BoxGeometry(0.06, 0.8, 0.55), lambert('#17191a'), -b.w / 2 + 0.8, 0.6, front + 0.9, g).rotation.z = 0.2;
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10), lambert('#5f6564'), -1.6, 0.75, front + 1.3, g);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 5), lambert('#26292b'), -1.6, 0.37, front + 1.3, g);
  }
  if (b.kind === 'workshop') {
    for (let i = 0; i < 4; i++) {
      mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), lambert(i % 2 ? '#63321b' : '#2a5056'), -b.w / 2 - 0.6, 0.45, front - 1 - i * 0.8, g);
    }
    colliders.push({ minX: b.x - b.w / 2 - 1.1, maxX: b.x - b.w / 2, minZ: b.z + front - 4, maxZ: b.z + front - 0.5 });
    // Enseigne peinte et chaînes de palan
    sign(g, 'MÉCANIQUE MARINE', 3.4, 0.55, 0, doorH + 0.6, front + 0.07, '#3e2114', '#b07a47');
  }

  // --- Lumière chaude à la porte des lieux habités
  if (b.lit) {
    const lamp = new THREE.PointLight('#cdb57c', 6, 9, 1.4);
    lamp.position.set(b.x, doorH + 0.8, b.z + front + 1.0);
    lights.push(lamp);
    group.add(lamp);
    mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), GLOW, 0.9, doorH + 0.6, front + 0.25, g);
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), lambert('#26292b'), 0.9, doorH + 0.8, front + 0.12, g);
  }

  colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
}

/* ================================================================== Décor du port */

function lighthouse(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  group.add(g);
  // Jetée de granit qui y mène
  mesh(paint(new THREE.BoxGeometry(4, 1.6, 34, 4, 1, 20), '#5f6564', 0.12), vmat, 0, -0.6, -17, g);
  mesh(paint(new THREE.CylinderGeometry(4.5, 5, 2, 10), '#5f6564', 0.12), vmat, 0, -0.2, 0, g);
  // Tour blanche à bandeau rouge, lanterne éteinte
  const tower = paint(new THREE.CylinderGeometry(1.6, 2.2, 14, 10, 6), '#d8d4c8', 0.05, '#8a8a80');
  mesh(tower, vmat, 0, 7.5, 0, g);
  mesh(new THREE.CylinderGeometry(1.75, 1.85, 1.6, 10), lambert('#8a2a1a'), 0, 12.5, 0, g);
  mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.25, 12), lambert('#26292b'), 0, 14.6, 0, g);
  const lantern = mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8), lambert('#2a3a3a', { transparent: true, opacity: 0.8 }), 0, 15.5, 0, g);
  mesh(new THREE.ConeGeometry(1.3, 1.2, 8), lambert('#8a2a1a'), 0, 16.9, 0, g);
  mesh(new THREE.TorusGeometry(2.05, 0.05, 4, 16).rotateX(Math.PI / 2), lambert('#26292b'), 0, 15.1, 0, g);
  return { lantern };
}

function chapel(group, x, z, colliders) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  group.add(g);
  mesh(paint(new THREE.BoxGeometry(7, 6, 12, 8, 6, 12), '#6b6e6c', 0.16, '#3f4446'), vmat, 0, 3, 0, g);
  const roof = mesh(paint(gableRoof(12.6, 7.8, 3.4), '#3a3f44', 0.1), vmat, 0, 6, 0, g);
  roof.rotation.y = Math.PI / 2;
  // Clocher-mur breton (pignon ajouré) et flèche
  mesh(paint(new THREE.BoxGeometry(3.2, 6, 1.2), '#7a7a72', 0.14), vmat, 0, 9, 6, g);
  mesh(new THREE.BoxGeometry(1, 1.8, 1.3), lambert('#05090d'), 0, 9.5, 6, g);
  mesh(new THREE.ConeGeometry(1.7, 5.5, 4), lambert('#3a3f44'), 0, 14.7, 6, g).rotation.y = Math.PI / 4;
  mesh(new THREE.BoxGeometry(1.4, 2.6, 0.1), lambert('#3e2114'), 0, 1.3, 6.05, g);
  mesh(new THREE.TorusGeometry(0.8, 0.12, 4, 10, Math.PI), lambert('#7a7a72'), 0, 2.6, 6.1, g);
  // Calvaire : croix de granit sur socle à degrés
  const cal = new THREE.Group();
  cal.position.set(6, 0, 8);
  g.add(cal);
  for (let i = 0; i < 3; i++) mesh(paint(new THREE.BoxGeometry(3 - i * 0.8, 0.45, 3 - i * 0.8), '#7a7a72', 0.1), vmat, 0, 0.22 + i * 0.45, 0, cal);
  mesh(paint(new THREE.BoxGeometry(0.35, 4.2, 0.35), '#878a85', 0.1), vmat, 0, 3.4, 0, cal);
  mesh(paint(new THREE.BoxGeometry(1.8, 0.32, 0.32), '#878a85', 0.1), vmat, 0, 4.6, 0, cal);
  mesh(new THREE.TorusGeometry(0.45, 0.07, 4, 10), lambert('#878a85'), 0, 4.6, 0, cal);
  colliders.push({ minX: x - 3.5, maxX: x + 3.5, minZ: z - 6, maxZ: z + 6 });
}

function fountain(group, x, z, colliders) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  group.add(g);
  mesh(paint(new THREE.CylinderGeometry(1.4, 1.5, 0.7, 10), '#7a7a72', 0.12), vmat, 0, 0.35, 0, g);
  mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 10), lambert('#1f4049'), 0, 0.62, 0, g);
  mesh(paint(new THREE.BoxGeometry(0.5, 2, 0.5), '#878a85', 0.1), vmat, 0, 1.3, -0.6, g);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5).rotateX(Math.PI / 2), lambert('#5f6564'), 0, 1.8, -0.25, g);
  colliders.push({ minX: x - 1.5, maxX: x + 1.5, minZ: z - 1.5, maxZ: z + 1.5 });
}

function phoneBooth(group, x, z, ry, colliders) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  group.add(g);
  mesh(new THREE.BoxGeometry(1, 2.4, 1), lambert('#a8b0b2'), 0, 1.2, 0, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.04, 1.6, 0.8), lambert('#2a3a3a', { transparent: true, opacity: 0.6 }), s * 0.5, 1.4, 0, g);
  mesh(new THREE.BoxGeometry(0.8, 1.6, 0.04), lambert('#2a3a3a', { transparent: true, opacity: 0.6 }), 0, 1.4, 0.5, g);
  mesh(new THREE.BoxGeometry(1.05, 0.25, 1.05), lambert('#2f4a66'), 0, 2.45, 0, g);
  mesh(new THREE.BoxGeometry(0.7, 0.12, 0.02), lambert('#e8ece2'), 0, 2.45, 0.53, g);
  mesh(new THREE.BoxGeometry(0.3, 0.45, 0.2), lambert('#26292b'), 0, 1.5, -0.35, g);
  colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
}

/** Une Renault 4 abandonnée, pneus à plat */
function quatreL(group, x, z, ry, colliders) {
  const g = new THREE.Group();
  g.position.set(x, -0.05, z);
  g.rotation.set(0, ry, 0.03);
  group.add(g);
  const col = '#8a8a5a';
  mesh(paint(new THREE.BoxGeometry(1.5, 0.7, 3.6), col, 0.1, '#63321b'), vmat, 0, 0.65, 0, g);
  mesh(paint(new THREE.BoxGeometry(1.4, 0.65, 2.2), col, 0.1), vmat, 0, 1.3, -0.4, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.02, 0.45, 1.8), lambert('#2a3a3a'), s * 0.71, 1.35, -0.4, g);
  mesh(new THREE.BoxGeometry(1.25, 0.45, 0.02), lambert('#2a3a3a'), 0, 1.35, 0.71, g);
  for (const sx of [-0.7, 0.7]) for (const sz of [-1.2, 1.2]) mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10).rotateZ(Math.PI / 2), lambert('#17191a'), sx, 0.28, sz, g);
  colliders.push({ minX: x - 1.3, maxX: x + 1.3, minZ: z - 2, maxZ: z + 2 });
}

function mailbox(group, x, z) {
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), lambert('#26292b'), x, 0.55, z, group);
  mesh(new THREE.BoxGeometry(0.45, 0.55, 0.32), lambert('#e0b050'), x, 1.3, z, group);
  mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), lambert('#26292b'), x, 1.4, z + 0.17, group);
}

/** Muret de pierres sèches */
function drystoneWall(group, x1, z1, x2, z2, colliders) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const g = new THREE.Group();
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  group.add(g);
  for (let i = 0; i < len / 0.5; i++) {
    for (let k = 0; k < 2; k++) {
      const s = 0.35 + rand() * 0.25;
      mesh(paint(new THREE.IcosahedronGeometry(s, 0).scale(1.3, 0.8, 1), '#6b6e6c', 0.2), vmat, -len / 2 + i * 0.5 + rand() * 0.2, 0.25 + k * 0.45, (rand() - 0.5) * 0.2, g);
    }
  }
  colliders.push({ minX: Math.min(x1, x2) - 0.4, maxX: Math.max(x1, x2) + 0.4, minZ: Math.min(z1, z2) - 0.4, maxZ: Math.max(z1, z2) + 0.4 });
}

function lobsterPots(group, x, z, n, colliders) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.position.set(x + (i % 3) * 0.95, 0.3 + Math.floor(i / 3) * 0.62, z + (rand() - 0.5) * 0.2);
    g.rotation.y = (rand() - 0.5) * 0.3;
    group.add(g);
    mesh(new THREE.BoxGeometry(0.9, 0.06, 0.6), lambert('#63321b'), 0, -0.28, 0, g);
    for (const hx of [-0.35, 0, 0.35]) mesh(new THREE.TorusGeometry(0.28, 0.025, 3, 6, Math.PI).rotateY(Math.PI / 2), lambert('#5a4a32'), hx, -0.27, 0, g);
    mesh(new THREE.PlaneGeometry(0.9, 0.55, 4, 3), lambert('#83a39a', { wireframe: true }), 0, 0, 0.3, g);
  }
  colliders.push({ minX: x - 0.5, maxX: x + 2.5, minZ: z - 0.5, maxZ: z + 0.5 });
}

function dryingNets(group, x, z) {
  for (const dx of [0, 3]) mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 5), lambert('#3e2114'), x + dx, 1.3, z, group);
  const net = new THREE.PlaneGeometry(3, 2, 10, 6);
  const p = net.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2) * 0.15 - (1 - Math.abs(p.getY(i))) * 0.1);
  mesh(net, lambert('#5b7a8a', { wireframe: true }), x + 1.5, 1.4, z, group);
  for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.1, 6, 4), lambert(i % 2 ? '#c08850' : '#e8ece2'), x + 0.4 + i * 0.55, 2.35, z, group);
}

function upturnedBoat(group, x, z, ry, color) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  group.add(g);
  const hull = new THREE.CylinderGeometry(0.9, 0.9, 4, 8, 1, true, 0, Math.PI);
  hull.rotateZ(Math.PI / 2);
  hull.rotateX(Math.PI / 2);
  hull.scale(1, 0.6, 1);
  mesh(paint(hull, color, 0.15, '#3e2114'), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), 0, 0.05, 0, g);
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.15, 0.3, 0.15), lambert('#3e2114'), s * 1.4, 0.15, 0, g);
}

function buoys(group, x, z) {
  for (let i = 0; i < 6; i++) {
    const c = i % 2 ? '#c0523a' : '#e8ece2';
    mesh(new THREE.SphereGeometry(0.3, 8, 6), lambert(c), x + (i % 3) * 0.55, 0.3 + Math.floor(i / 3) * 0.45, z + (rand() - 0.5) * 0.3, group);
  }
}

/** Arbre tordu par le vent d'ouest */
function windTree(group, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  group.add(g);
  let y = 0, px = 0;
  for (let i = 0; i < 5; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.12 - i * 0.015, 0.16 - i * 0.015, 1.3, 5), lambert('#2a2014'), px, y + 0.6, 0, g);
    seg.rotation.z = -0.25 - i * 0.08;
    y += 1.15;
    px += 0.35 + i * 0.1;
  }
  for (let i = 0; i < 4; i++) {
    mesh(new THREE.IcosahedronGeometry(0.9 + rand() * 0.4, 0).scale(1.4, 0.6, 1), lambert('#2f3d2a'), px - 0.4 + i * 0.5, y - 0.2 + rand() * 0.4, (rand() - 0.5) * 0.8, g);
  }
}

/** Corde à linge : draps qui flottent (animés) */
function laundry(group, x1, z1, x2, z2, sheets) {
  for (const [x, z] of [[x1, z1], [x2, z2]]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), lambert('#3e2114'), x, 1.15, z, group);
  const len = Math.hypot(x2 - x1, z2 - z1);
  const rope = mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 3), lambert('#a8a090'), (x1 + x2) / 2, 2.2, (z1 + z2) / 2, group);
  rope.rotation.z = Math.PI / 2;
  rope.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pivot = new THREE.Group();
    pivot.position.set(x1 + (x2 - x1) * t, 2.2, z1 + (z2 - z1) * t);
    pivot.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    group.add(pivot);
    const geo = new THREE.PlaneGeometry(len / n - 0.15, 1.2, 4, 3);
    geo.translate(0, -0.6, 0);
    mesh(geo, lambert(i === 1 ? '#c8d0d8' : '#e8ece2', { side: THREE.DoubleSide }), 0, 0, 0, pivot);
    sheets.push(pivot);
  }
}

/** Goéland (silhouette), posé ou en vol */
function gull() {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.16, 0).scale(1, 0.8, 2), lambert('#e8ece2'), 0, 0, 0, g);
  mesh(new THREE.ConeGeometry(0.04, 0.14, 4).rotateX(Math.PI / 2), lambert('#e0b050'), 0, 0.02, 0.36, g);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    g.add(w);
    mesh(new THREE.BoxGeometry(0.55, 0.02, 0.2), lambert('#a8b0b2'), s * 0.3, 0, 0, w);
    wings.push({ w, s });
  }
  return { g, wings };
}

/**
 * Ajoute tout le décor du village. Renvoie une fonction update(time) pour les éléments animés
 * (linge, goélands) et la lanterne du phare (pour la fin « Traverser »).
 */
export function decorateVillage(group, colliders, tagged) {
  const lh = lighthouse(group, -50, 42);
  chapel(group, -6, -38, colliders);
  fountain(group, -8, -17, colliders);
  phoneBooth(group, 3.2, -6.6, 0, colliders);
  quatreL(group, 14, -15, 0.4, colliders);
  mailbox(group, -10.2, -6.4);
  drystoneWall(group, -36, -16, -22, -16, colliders);
  drystoneWall(group, 22, -15, 36, -14, colliders);
  drystoneWall(group, -2, -17, 6, -17.5, colliders);
  lobsterPots(group, -33, 1.6, 6, colliders);
  lobsterPots(group, 28, 1.8, 5, colliders);
  dryingNets(group, -20, 2.2);
  upturnedBoat(group, 32, -2, 0.3, '#2f4a66');
  upturnedBoat(group, -14, 1.2, -0.1, '#8a3a2a');
  colliders.push({ minX: 29.5, maxX: 34.5, minZ: -3, maxZ: -1 }, { minX: -16.5, maxX: -11.5, minZ: 0.3, maxZ: 2.1 });
  buoys(group, 20, 2.6);
  windTree(group, -24, -26);
  windTree(group, 36, -24);
  windTree(group, 8, -28);
  const sheets = [];
  laundry(group, -28, -20, -23, -20.5, sheets);

  // Goélands : quelques-uns posés sur les toits, d'autres qui tournent au-dessus du port
  const perched = [[-18, 9.6, -11], [8.5, 6.8, -12], [-4, 7.2, -10], [-50, 17.6, 42], [25, 7.2, -8]];
  for (const [x, y, z] of perched) {
    const b = gull();
    b.g.position.set(x, y, z);
    b.g.rotation.y = rand() * 6;
    b.wings.forEach(({ w, s }) => (w.rotation.z = s * 0.1));
    group.add(b.g);
  }
  const flying = [];
  for (let i = 0; i < 6; i++) {
    const b = gull();
    group.add(b.g);
    flying.push({ ...b, r: 10 + rand() * 18, h: 10 + rand() * 8, speed: 0.15 + rand() * 0.15, phase: rand() * 6, cx: -10 + rand() * 30, cz: 5 + rand() * 20 });
  }

  return {
    lighthouseLantern: lh.lantern,
    update(time) {
      sheets.forEach((p, i) => (p.rotation.x = Math.sin(time * 1.3 + i) * 0.25 + 0.15));
      for (const f of flying) {
        const a = time * f.speed + f.phase;
        f.g.position.set(f.cx + Math.cos(a) * f.r, f.h + Math.sin(a * 2) * 1.2, f.cz + Math.sin(a) * f.r);
        f.g.rotation.y = -a;
        f.wings.forEach(({ w, s }) => (w.rotation.z = s * Math.sin(time * 6 + f.phase) * 0.5));
      }
    },
  };
}
