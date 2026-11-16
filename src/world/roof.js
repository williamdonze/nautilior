import * as THREE from 'three';
import { WORLD, ROOFS, LAYOUT, SEABED, RADIATION } from '../config/settings.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight, canyonCenter, surfaceHeight, tunnelAt, tunnelSection, plateauDepth } from './seabed.js';
import { WRECK_SPOTS, MARIE } from './landmarks.js';
import fragmentsData from '../story/fragments.json';
import { applyDetail } from './detail.js';

/**
 * Les plafonds : le fond n'est plus seulement une surface. Par endroits, de la roche passe AU-DESSUS
 * de l'eau libre : voûtes jetées d'une paroi à l'autre du Canyon (avec des puits de lumière), et
 * massifs percés d'un tunnel où le sous-marin se glisse.
 * getRoof(x, z) est la source unique de vérité, comme getFloorHeight pour le sol : maillage,
 * collisions du sous-marin, caméra, hauteur des algues et écho du sonar s'en servent tous.
 */
const noise = createNoise2D(WORLD.SEED + 2718);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const out = { c: 0, t: 0 };

/** Voûte du Canyon : une dalle épaisse entre les deux parois, à une vingtaine de mètres du lit */
function vault(v, x, z) {
  const wob = noise(x * 0.05, v.z0) * 5;
  const edge = Math.min(z - v.z1 + wob, v.z0 - z + wob); // z0 = entrée (côté surface), z1 = sortie (plus profond)
  if (edge <= 0) return false;
  const d = x - canyonCenter(z), W = ROOFS.VAULT_HALF_WIDTH;
  if (Math.abs(d) > W) return false;
  // puits de lumière : des trous dans la dalle, loin des parois
  const hole = noise(x * 0.05 + 9, z * 0.05) - smooth(18, 26, Math.abs(d)) * 0.6;
  if (hole > 0.5) return false;
  const bed = getFloorHeight(canyonCenter(z), z);
  // la dalle s'amincit jusqu'à rien au bord des puits et aux deux bouts : pas de chant vertical
  const k = d / W, lip = Math.min(smooth(0, 9, edge), smooth(0.5, 0.3, hole));
  const c = bed + v.h + 8 * (1 - k * k) + noise(x * 0.07, z * 0.07) * 2.5 - Math.max(0, noise(x * 0.31, z * 0.31)) * 2.2; // la voûte, avec ses pendants
  const t = c + (v.thick * (0.7 + 0.4 * (noise(x * 0.04 + 5, z * 0.04) * 0.5 + 0.5))) * (0.06 + 0.94 * lip);
  if (t <= getFloorHeight(x, z) + 0.5) return false; // noyé dans la paroi
  out.c = c; out.t = t;
  return true;
}

/** Massif : un dôme de roche posé sur le fond, percé d'un tunnel dans sa longueur */
function massif(m, x, z) {
  const dx = x - m.x, dz = z - m.z;
  if (Math.abs(dx) > m.a + 2 && Math.abs(dz) > m.a + 2) return false;
  const u = dx * m.cos + dz * m.sin, v = -dx * m.sin + dz * m.cos;
  const e = (u / m.a) ** 2 + (v / m.b) ** 2;
  if (e >= 1) return false;
  const floor = getFloorHeight(x, z);
  const top = floor * 0.5 + m.floor * 0.5 + m.H * Math.pow(1 - e, 0.55) * (0.8 + 0.35 * (noise(x * 0.06, z * 0.06) * 0.5 + 0.5)) + noise(x * 0.2, z * 0.2) * 0.8;
  if (top < floor + 0.8) return false;
  // le tunnel s'évase aux deux bouts
  const wt = m.wt * (1 + 0.6 * (u / m.a) ** 2), q = v / wt;
  let c = floor;
  // la Salle : le dôme est creux (une caverne), on y entre par les deux bouts du tunnel
  if (m.h) { const ei = e / 0.62; if (ei < 1) c = floor + m.h * Math.pow(1 - ei, 0.5) * (0.88 + 0.24 * (noise(x * 0.05 + 7, z * 0.05) * 0.5 + 0.5)) - Math.max(0, noise(x * 0.23, z * 0.23)) * 3; }
  if (Math.abs(q) < 1) c = Math.max(c, floor + m.ht * Math.sqrt(1 - q * q) * (0.85 + 0.3 * (noise(x * 0.11 + 3, z * 0.11) * 0.5 + 0.5)));
  if (c > top - 1.2) return false; // la voûte serait trop mince : c'est une ouverture
  out.c = c; out.t = top;
  return true;
}

/**
 * Tunnel sous une barre rocheuse : une voûte en plein cintre qui retombe jusqu'au sol de chaque côté
 * (ce sont ses retombées qui font les parois), avec des pendants. Au-dessus : toute la roche de la barre.
 */
function tunnel(x, z) {
  const t = tunnelAt(z);
  if (!t) return false;
  const c = tunnelSection(t, z), q = (x - c.x) / (c.r * 1.2);
  if (q <= -1 || q >= 1 || c.s < -0.14 || c.s > 1.14) return false;
  const top = surfaceHeight(x, z);
  const H = c.r * 1.5;
  const ceil = dome(x, z) + c.y - 2 + (H + 2) * Math.pow(1 - q * q, 0.55) * (0.92 + 0.16 * (noise(x * 0.045 + 3, z * 0.045) * 0.5 + 0.5)) - Math.max(0, noise(x * 0.21, z * 0.21)) * 2.6;
  if (ceil > top - 1.5) return false; // plus de roche au-dessus : c'est la bouche
  out.c = ceil; out.t = top;
  return true;
}

/* ------------------------------------------------------------------ Cavernes, piliers, poches d'air */
const { BASINS, CAVERNS, POCKETS, TUNNELS } = LAYOUT;
let pillars = null;
/** Les piliers : semés sur une grille, loin de tout ce qui compte (bouches des tunnels, gorge, épaves, souvenirs, poches…) */
function makePillars() {
  pillars = [];
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const keep = [];
  for (const [x, z] of WRECK_SPOTS) keep.push([x, z, 30]);
  for (const f of fragmentsData.fragments) keep.push([f.inCanyon ? canyonCenter(f.z) + f.x : f.x, f.z, 30]);
  for (const p of POCKETS) keep.push([p.x, p.z, p.r + 34]);
  for (const m of ROOFS.MASSIFS) keep.push([m.x, m.z, m.a + 30]);
  for (const t of TUNNELS) keep.push([t.x0, t.z0, 80], [t.x1, t.z1, 80]);
  keep.push([canyonCenter(MARIE.z), MARIE.z, 70], [RADIATION.SOURCE.x, RADIATION.SOURCE.z, 150]);
  for (let b = 1; b < BASINS.length; b++) {
    const B = BASINS[b], G = CAVERNS[b].pillars;
    for (let z = B.z0 - 40; z > Math.max(B.z1, SEABED.Z_END + 90) + 40; z -= G) for (let x = -140; x <= 140; x += G) {
      if (hash(x, z) > 0.62) continue;
      const px = x + (hash(x + 9, z) - 0.5) * G * 0.7, pz = z + (hash(x, z + 7) - 0.5) * G * 0.7, r = 6 + hash(x - 3, z - 5) * 10;
      if (keep.some(([kx, kz, kr]) => Math.hypot(px - kx, pz - kz) < kr + r)) continue;
      if (b === 2 && Math.abs(px - canyonCenter(pz)) < 62) continue; // la gorge du Canyon reste dégagée
      pillars.push({ x: px, z: pz, r });
    }
  }
}
/** Poche d'air en (x, z) : { x, z, r, y (niveau de l'eau), camp } ou null */
export function pocketAt(x, z) {
  if (!ready) prepare();
  for (const p of POCKETS) if (Math.abs(z - p.z) < p.r && Math.abs(x - p.x) < p.r && Math.hypot(x - p.x, z - p.z) < p.r * 0.92) return p;
  return null;
}
export function getPockets() {
  if (!ready) prepare();
  return POCKETS;
}
/** Coupole d'une poche : de combien la voûte se creuse au-dessus de (x, z) */
function dome(x, z) {
  let lift = 0;
  for (const p of POCKETS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) lift = Math.max(lift, p.h * Math.pow(1 - (d / p.r) ** 2, 0.6));
  }
  return lift;
}
/** Bassin profond (caverne) qui contient z, ou 0 */
function cavernIndex(z) {
  for (let b = 1; b < BASINS.length; b++) if (z < BASINS[b].z0 + 40 && z > BASINS[b].z1 - 40) return b;
  return 0;
}
/**
 * Voûte de la caverne en (x, z), ou null hors caverne : haute, bosselée, hérissée de pendants ;
 * elle descend en pilier jusqu'au sol par endroits, et se creuse en coupole au-dessus des poches d'air.
 */
export function cavernCeil(x, z) {
  const b = cavernIndex(z);
  if (!b) return null;
  if (!ready) prepare();
  let c = -plateauDepth(z) + CAVERNS[b].h + noise.fbm(x * 0.008, z * 0.008, 3) * 24 - Math.pow(Math.max(0, noise(x * 0.045 + 11, z * 0.045)), 2) * 16 - Math.max(0, noise(x * 0.2, z * 0.2)) * 2.5;
  for (const p of pillars) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > p.r * 2.6 || Math.abs(dz) > p.r * 2.6) continue;
    const d = Math.hypot(dx, dz) * (1 + 0.18 * noise(x * 0.11, z * 0.11));
    const k = 1 - smooth(p.r * 0.8, p.r * 2.5, d);
    if (k > 0) c -= (c - (getFloorHeight(x, z) - 3)) * Math.pow(k, 1.7);
  }
  return c + dome(x, z);
}
function cavern(x, z) {
  const c = cavernCeil(x, z);
  if (c === null) return false;
  if (surfaceHeight(x, z) > c) return false; // paroi : le terrain lui-même fait le mur
  out.c = c; out.t = 12;
  return true;
}
/** Est-on sous la roche en (x, y, z) ? (tunnel, voûte, caverne : la lumière du jour n'y arrive pas) */
export function isCovered(x, y, z) {
  if (cavernIndex(z)) return true;
  const r = getRoof(x, z);
  return !!r && y < r.c;
}

let ready = false;
function prepare() {
  ready = true;
  for (const m of ROOFS.MASSIFS) { m.cos = Math.cos(m.rot); m.sin = Math.sin(m.rot); m.floor = getFloorHeight(m.x, m.z); }
  // poches des tunnels : à mi-parcours, dans l'axe
  for (const t of TUNNELS) if (!POCKETS.some((p) => p.tunnel === t.id)) { const z = (t.z0 + t.z1) / 2; POCKETS.push({ x: tunnelSection(t, z).x, z, r: 13, tunnel: t.id }); }
  for (const p of POCKETS) p.h = p.camp ? 30 : 18;
  makePillars();
  // niveau de l'eau dans chaque poche : cinq mètres sous le sommet de la coupole
  for (const p of POCKETS) { const r = getRoof(p.x, p.z); p.y = (r ? r.c : -10) - 5; }
}

/**
 * Y a-t-il de la roche au-dessus du fond en (x, z) ?
 * @returns {{c: number, t: number} | null} c = dessous du plafond, t = dessus. Entre le sol et c : de l'eau
 * (ou rien, si c touche le sol : c'est un pilier plein). L'objet renvoyé est réutilisé : ne pas le garder.
 */
export function getRoof(x, z) {
  if (!ready) prepare();
  if (tunnel(x, z)) return out;
  if (z < SEABED.CANYON.zStart && z > SEABED.CANYON.zEnd) { for (const v of ROOFS.VAULTS) if (z < v.z0 + 6 && z > v.z1 - 6 && vault(v, x, z)) return out; }
  for (const m of ROOFS.MASSIFS) if (massif(m, x, z)) return out;
  if (cavern(x, z)) return out;
  return null;
}

/** Hauteur libre sous le plafond (Infinity s'il n'y en a pas) */
export function headroom(x, z) {
  const r = getRoof(x, z);
  return r ? r.c - getFloorHeight(x, z) : Infinity;
}

/** Maillage d'une région : dessous, dessus et chants, d'après getRoof */
function build(x0, x1, z0, z1, step, sample = getRoof, open = false) {
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const C = new Float32Array((nx + 1) * (nz + 1)).fill(NaN), T = new Float32Array(C.length), F = new Float32Array(C.length);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, r = sample(x, z), k = j * (nx + 1) + i;
    if (r) { C[k] = r.c; T[k] = r.t; F[k] = getFloorHeight(x, z); }
  }
  const pos = [], idx = [];
  const vert = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const N = (nx + 1) * (nz + 1), bot = new Int32Array(N).fill(-1), top = new Int32Array(N).fill(-1);
  const has = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && !Number.isNaN(C[j * (nx + 1) + i]) && !Number.isNaN(C[j * (nx + 1) + i + 1]) && !Number.isNaN(C[(j + 1) * (nx + 1) + i]) && !Number.isNaN(C[(j + 1) * (nx + 1) + i + 1]);
  const vb = (i, j) => { const k = j * (nx + 1) + i; return bot[k] >= 0 ? bot[k] : (bot[k] = vert(x0 + i * step, C[k], z0 + j * step)); };
  const vt = (i, j) => { const k = j * (nx + 1) + i; return top[k] >= 0 ? top[k] : (top[k] = vert(x0 + i * step, T[k], z0 + j * step)); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!has(i, j)) continue;
    const k = j * (nx + 1) + i, ks = [k, k + 1, k + nx + 1, k + nx + 2];
    // dessus (normale vers le haut)
    if (!open) { const a = vt(i, j), b = vt(i + 1, j), c = vt(i, j + 1), d = vt(i + 1, j + 1); idx.push(a, c, b, b, c, d); }
    // dessous (normale vers le bas), sauf là où le plafond repose sur le sol
    if (ks.some((q) => C[q] > F[q] + 0.05)) { const e = vb(i, j), f = vb(i + 1, j), g = vb(i, j + 1), h = vb(i + 1, j + 1); idx.push(e, f, g, f, h, g); }
    // chants : là où la cellule voisine n'existe pas, on ferme entre dessous et dessus
    const side = (i0, j0, i1, j1) => {
      const p = j0 * (nx + 1) + i0, q = j1 * (nx + 1) + i1, xa = x0 + i0 * step, za = z0 + j0 * step, xb = x0 + i1 * step, zb = z0 + j1 * step;
      if (T[p] - C[p] > 45 && T[q] - C[q] > 45) return; // au cœur d'une barre : la paroi du terrain fait déjà le travail
      const s0 = vert(xa, C[p], za), s1 = vert(xb, C[q], zb), s2 = vert(xa, T[p], za), s3 = vert(xb, T[q], zb);
      idx.push(s0, s2, s1, s1, s2, s3);
    };
    if (open) continue; // (voûte de caverne : rien au-dessus, pas de chants)
    if (!has(i, j - 1)) side(i + 1, j, i, j);
    if (!has(i, j + 1)) side(i, j + 1, i + 1, j + 1);
    if (!has(i - 1, j)) side(i, j, i, j + 1);
    if (!has(i + 1, j)) side(i + 1, j + 1, i + 1, j);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Les maillages des plafonds (à ajouter au décor : le sonar les relève avec le reste) */
export function createRoofs() {
  const group = new THREE.Group();
  group.name = 'roofs';
  const mat = applyDetail(new THREE.MeshLambertMaterial({ color: '#5d605c', side: THREE.DoubleSide }), 'rock', 1);
  const add = (geo) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.raycast = () => {}; m.castShadow = m.receiveShadow = true; group.add(m); };
  const W = ROOFS.VAULT_HALF_WIDTH + 2;
  for (const v of ROOFS.VAULTS) {
    let xa = Infinity, xb = -Infinity;
    for (let z = v.z1 - 6; z <= v.z0 + 6; z += 4) { xa = Math.min(xa, canyonCenter(z) - W); xb = Math.max(xb, canyonCenter(z) + W); }
    add(build(xa, xb, v.z1 - 8, v.z0 + 8, ROOFS.STEP));
  }
  // les trois tunnels (toute la largeur du monde : ils serpentent)
  for (const t of LAYOUT.TUNNELS) add(build(-150, 150, t.z1 - 72, t.z0 + 72, ROOFS.STEP));
  // les voûtes des trois cavernes, par tranches de 200 m (mailles plus larges : elles sont loin au-dessus)
  const cav = (x, z) => (cavern(x, z) ? out : null);
  for (let b = 1; b < BASINS.length; b++) for (let z = BASINS[b].z0 + 40; z > BASINS[b].z1 - 40; z -= 200) add(build(-184, 184, Math.max(z - 200, BASINS[b].z1 - 40), z, ROOFS.STEP * 2, cav, true));
  for (const m of ROOFS.MASSIFS) add(build(m.x - m.a - 2, m.x + m.a + 2, m.z - m.a - 2, m.z + m.a + 2, ROOFS.STEP * 0.75));
  return group;
}
