/**
 * Le jardin : toutes les plantes de la plongée, sous forme de « feuilles » instanciées
 * (technique d'Abyssal Garden, licence MIT — Maksymilian Dendura).
 *
 * Une feuille = 40 octets : position + longueur, (lacet, inclinaison, largeur, hauteur d'attache),
 * (type, graine 1, graine 2, courbure), numéro de tige (+1 ; 0 = aucune) pour la flexion (kelpSim.js). Le shader fait le reste : forme, ondulation, houle.
 * Les feuilles sont triées par cellule de 24 m pour n'afficher que celles qui sont en vue.
 *
 * Types : 0 kelp vert/doré · 1 tige · 2 herbier turquoise · 3 algue sombre irisée · 4 algue ambrée
 *         5 tapis rose · 6 fronde rouge · 7 touffe bleu-vert · 8 pousse verte luminescente (portail)
 */
import { headroom, getRoof, getPockets } from '../world/roof.js';
import { getFloorHeight, canyonCenter, tunnelAt, tunnelSection } from '../world/seabed.js';
import { createNoise2D } from '../world/noise.js';
import { createRandom, smoothstep } from '../core/utils.js';
import { RADIATION, SUBMARINE, WORLD, SEABED, LAYOUT } from '../config/settings.js';
import fragmentsData from '../story/fragments.json';
import { WRECK_SPOTS } from '../world/landmarks.js';

// Grille de culling (plan XZ)
export const GRID = { OX: -216, OZ: SEABED.Z_END - 10, CELLW: 24, CX: 18, CZ: Math.ceil((SEABED.Z_START - SEABED.Z_END + 30) / 24) };
/** Emprise de la carte du fond (texture) : x0, largeur, z0, longueur */
export const MAP = { X0: -210, W: 420, Z0: SEABED.Z_END, L: SEABED.Z_START - SEABED.Z_END };
const NCELLS = GRID.CX * GRID.CZ;
const TAU = Math.PI * 2;

const noise = createNoise2D(WORLD.SEED + 91);
const fbm = (x, z, s) => noise.fbm(x * s, z * s, 3) * 0.5 + 0.5;

/** Tapis colorés du Récif (0..1) : même fonction pour les plantes et pour la teinte du fond */
export function coverAt(x, z) {
  const reef = smoothstep(-590, -500, z);
  return smoothstep(0.56, 0.74, fbm(x + 300, z - 80, 0.035)) * reef;
}
/** Proximité du portail (0..1) : la vie y devient verte et lumineuse */
export function portalAt(x, z) {
  const S = RADIATION.SOURCE;
  return smoothstep(190, 30, Math.hypot(x - S.x, z - S.z));
}

/** Carte du fond pour le shader : r tapis colorés, g verdissement du portail, a sable */
export function buildGroundMap(w = 128, h = 1536) {
  const map = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = ((i + 0.5) / w) * MAP.W + MAP.X0, z = ((j + 0.5) / h) * MAP.L + MAP.Z0, o = (i + w * j) * 4;
    map[o] = Math.max(coverAt(x, z), portalAt(x, z) * smoothstep(0.45, 0.65, fbm(x, z, 0.06))) * 255;
    map[o + 1] = portalAt(x, z) * 255;
    map[o + 3] = smoothstep(0.42, 0.6, fbm(x - 70, z + 40, 0.04)) * 255;
  }
  return { data: map, w, h };
}

/** Tableau de flottants extensible */
class Floats {
  constructor(n = 1 << 16) { this.a = new Float32Array(n); this.n = 0; }
  push12(c, x, y, z, l, yaw, tilt, wid, hA, type, s1, s2, bend, col = 0) {
    if (this.n + 14 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const a = this.a; let n = this.n;
    a[n++] = c; a[n++] = x; a[n++] = y; a[n++] = z; a[n++] = l; a[n++] = yaw; a[n++] = tilt; a[n++] = wid; a[n++] = hA; a[n++] = type; a[n++] = s1; a[n++] = s2; a[n++] = bend; a[n++] = col;
    this.n = n;
  }
}
const cellOf = (x, z) => {
  const cx = Math.min(GRID.CX - 1, Math.max(0, Math.floor((x - GRID.OX) / GRID.CELLW)));
  const cz = Math.min(GRID.CZ - 1, Math.max(0, Math.floor((z - GRID.OZ) / GRID.CELLW)));
  return cx + GRID.CX * cz;
};

/** Trie par cellule et emballe (feuilles : 36 octets ; scintillements : 32 octets) */
function pack(L, leafFmt, step = 1, widthMul = 1) {
  const R = 14, count = L.n / R, a = L.a;
  const start = new Uint32Array(NCELLS + 1), fill = new Uint32Array(NCELLS);
  const per = new Uint32Array(NCELLS);
  for (let i = 0; i < count; i++) per[a[i * R]]++;
  let n = 0;
  for (let c = 0; c < NCELLS; c++) { start[c] = n; n += Math.ceil(per[c] / step); }
  start[NCELLS] = n;
  const stride = leafFmt ? 40 : 32;
  const buf = new ArrayBuffer(Math.max(n, 1) * stride), f = new Float32Array(buf), u8 = new Uint8Array(buf);
  const lo = new Float32Array(NCELLS).fill(1e9), hi = new Float32Array(NCELLS).fill(-1e9);
  const seen = new Uint32Array(NCELLS);
  for (let i = 0; i < count; i++) {
    const o = i * R, c = a[o];
    if (seen[c]++ % step) continue;
    const k = start[c] + fill[c]++;
    if (leafFmt) {
      for (let j = 0; j < 8; j++) f[k * 10 + j] = a[o + 1 + j];
      f[k * 10 + 6] *= widthMul;
      u8[k * 40 + 32] = a[o + 9]; u8[k * 40 + 33] = a[o + 10] * 255; u8[k * 40 + 34] = a[o + 11] * 255; u8[k * 40 + 35] = a[o + 12] * 255;
      f[k * 10 + 9] = a[o + 13];
    } else { for (let j = 0; j < 7; j++) f[k * 8 + j] = a[o + 1 + j]; f[k * 8 + 7] = a[o + 13]; }
    const y = a[o + 2], l = leafFmt ? a[o + 4] : Math.max(0.5, a[o + 4]); // (points lumineux : a[4] = hauteur parcourue)
    if (y - l < lo[c]) lo[c] = y - l;
    if (y + l > hi[c]) hi[c] = y + l;
  }
  return { buf, n, start, lo, hi };
}

/**
 * Construit toutes les plantes. `density` (0..1) vient du niveau de détail :
 * moins de feuilles, mais plus larges, pour garder des forêts pleines.
 */
export function buildGarden(density = 1) {
  const rnd = createRandom(WORLD.SEED + 404);
  const rr = (a, b) => a + (b - a) * rnd();
  const wide = 1 + (1 - density) * 0.9;
  const big = new Floats(1 << 20), small = new Floats(1 << 19), glints = new Floats(1 << 17);
  // Tiges simulées : x, y, z du pied et hauteur. `stalk` = tige courante (numéro + 1) des feuilles posées.
  const stalks = [];
  let stalk = 0;
  const newStalk = (x, y, z, H) => { stalks.push(x, y, z, H); stalk = stalks.length / 4; };
  const leaf = (L, x, y, z, len, yaw, tilt, wid, hA, type, s1, s2, bend) =>
    L.push12(cellOf(x, z), x, y, z, len, yaw, tilt, type === 1 ? wid : wid * wide, hA, type, s1, s2, bend, L === small ? 0 : stalk);
  const glint = (x, y, z, hA, seed, hue, size) => glints.push12(cellOf(x, z), x, y, z, hA, seed, hue, size, 0, 0, 0, 0, 0, hA > 0 ? stalk : 0);
  const slopeY = (x, z) => {
    const dx = getFloorHeight(x + 1, z) - getFloorHeight(x - 1, z), dz = getFloorHeight(x, z + 1) - getFloorHeight(x, z - 1);
    return 2 / Math.hypot(dx, 2, dz);
  };
  const S = SUBMARINE.SPAWN;
  const nearWreck = (x, z, r) => WRECK_SPOTS.some(([wx, wz]) => Math.hypot(x - wx, z - wz) < r);

  /* ---- Colonnes de kelp : des brins torsadés portant des centaines de feuilles */
  const column = (x, y, z, H, kind, dens) => {
    newStalk(x, y, z, H);
    const strands = 2 + (rnd() < 0.6) + (rnd() < 0.3), ph = rnd() * TAU, tw = rr(0.1, 0.28), sr = rr(0.2, 0.55), sc = rr(0.75, 1.25);
    const la = rnd() * TAU, lm = rr(0, 0.11), full = rr(0.55, 1.3) * dens;
    const stem = (s, h) => { const a = ph + (s * TAU) / strands + h * tw, r = sr * (1 - (0.6 * h) / H), ln = (lm * h * h) / H; return [x + Math.cos(a) * r + Math.cos(la) * ln, z + Math.sin(a) * r + Math.sin(la) * ln, a]; };
    for (let s = 0; s < strands; s++) for (let h = 0; h < H - 1; h += 1.7) { const p = stem(s, h); leaf(big, p[0], y + h, p[1], 2.1, p[2] + Math.PI / 2, 0.1, 0.17, h, 1, rnd(), rnd(), 0.3); }
    const n = Math.floor(H * 30 * full * density);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rnd(), 0.9), h = t * H, p = stem((rnd() * strands) | 0, h);
      const L = ((0.55 + 0.75 * rnd() * rnd()) * (1 - 0.5 * t * t) * sc + 0.25) * (kind === 1 ? 1.25 : 1.15);
      const tilt = rr(0.4, 1.0) + (rr(0.15, 0.45) - rr(0.4, 1.0)) * t;
      const type = kind === 3 ? (rnd() < 0.85 ? 11 : 15) : kind === 1 ? (rnd() < 0.8 ? 3 : 4) : kind === 2 ? (rnd() < 0.5 ? 4 : 0) : 0;
      leaf(big, p[0], y + h, p[1], L, rnd() * TAU, tilt, L * (kind === 1 ? rr(0.09, 0.13) : rr(0.15, 0.21)) + 0.03, h, type, rnd(), rnd(), rr(0.38, 0.95));
    }
    for (let i = Math.floor(H * (kind === 1 ? 16 : 13) * density); i > 0; i--) {
      const h = rnd() * H, a = rnd() * TAU, r = rr(0.15, 0.8) * (1 - (0.5 * h) / H), ln = (lm * h * h) / H;
      glint(x + Math.cos(a) * r + Math.cos(la) * ln, y + h, z + Math.sin(a) * r + Math.sin(la) * ln, h, rnd(), kind === 1 ? rnd() : rnd() * 0.6, rr(0.018, 0.05));
    }
  };
  // Grandes forêts placées à la main le long du Récif : x, z, rayon, densité
  const FORESTS = [[-70, 120, 40, 0.9], [80, 90, 36, 0.85], [-30, 20, 26, 0.7], [95, -10, 40, 0.9], [-110, -30, 44, 0.9], [20, -70, 30, 0.8], [-60, -110, 36, 0.8], [110, -120, 34, 0.7], [0, 165, 30, 0.6]];
  const kelpDens = (x, z, depth) => {
    if (Math.hypot(x - S.x, z - S.z) < 13) return 0;
    if (depth < 150) {
      let d = smoothstep(0.5, 0.64, fbm(x, z, 0.022)) * 0.5;
      for (const p of FORESTS) d = Math.max(d, p[3] * smoothstep(p[2], p[2] * 0.7, Math.hypot(x - p[0], z - p[1])));
      return d;
    }
    // Épaves : bosquets clairsemés d'algues sombres, plus fournis autour des carcasses
    return (smoothstep(0.56, 0.7, fbm(x + 500, z, 0.02)) * 0.3 + (nearWreck(x, z, 26) ? 0.35 : 0)) * smoothstep(520, 400, depth);
  };
  const occ = new Set();
  for (let i = 0; i < 15000; i++) {
    // le Récif surtout ; quelques bosquets sombres dans le bassin des Épaves
    const x = rr(-196, 196), z = i % 5 < 3 ? rr(-570, 208) : rr(-1760, -950), y = getFloorHeight(x, z), depth = -y;
    if (depth < 9 || rnd() > kelpDens(x, z, depth)) continue;
    const key = Math.floor(x / 2.3) * 4096 + Math.floor(z / 2.3);
    if (occ.has(key) || slopeY(x, z) < 0.55) continue;
    occ.add(key);
    const deep = depth > 150 || (depth > 95 && rnd() < 0.5);
    let H = Math.min(depth - rr(0.8, 5), deep ? rr(7, 20) : rr(15, 40));
    // sous un plafond, le kelp s'arrête au plafond ; dans un pilier plein, il ne pousse pas
    const room = headroom(x, z);
    if (room < 2.5) continue;
    H = Math.min(H, room - 0.6);
    column(x, y - 0.3, z, H, deep ? 1 : rnd() < 0.04 ? 2 : 0, 1);
  }

  /* ---- Bouquets de rubans posés sur le fond, touffes sur les parois */
  const cluster = (x, y, z, n, type, lmin, lmax, wmin, wmax, tmax, sway) => {
    newStalk(x, y, z, lmax + sway);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rnd() * 0.5, L = rr(lmin, lmax);
      leaf(big, x + Math.cos(a) * r, y - 0.15, z + Math.sin(a) * r, L, a, rr(0.05, tmax), rr(wmin, wmax), sway, type, rnd(), rnd(), rr(0.3, 0.8));
    }
  };
  for (let i = Math.floor(120000 * density); i > 0; i--) {
    const x = rr(-200, 200), z = rr(SEABED.Z_END + 50, 210), y = getFloorHeight(x, z), depth = -y;
    if (depth < 6 || Math.hypot(x - S.x, z - S.z) < 6) continue;
    const ny = slopeY(x, z), u = rnd(), pz = portalAt(x, z);
    const h = depth < 150 ? 0.45 + 0.55 * smoothstep(0.45, 0.65, fbm(x - 90, z + 30, 0.03)) : depth < 500 ? 0.3 : depth < 950 ? 0.1 : 0.04;
    if (pz > 0.02) {
      // Autour du portail : des pousses vertes qui luisent, de plus en plus serrées
      if (ny > 0.6 && u < 0.5 * pz) cluster(x, y, z, (5 + rnd() * 12) | 0, 8, 0.5, 2.4, 0.08, 0.2, 0.7, 1.5);
    } else if (ny > 0.75 && u < 0.14 * h && depth < 170) cluster(x, y, z, (8 + rnd() * 14) | 0, 2, 1.0, 3.0, 0.13, 0.26, 0.6, 2.5);
    else if (ny > 0.6 && u < 0.2 * h) cluster(x, y, z, (10 + rnd() * 18) | 0, depth > 500 ? (rnd() < 0.7 ? 3 : 7) : rnd() < 0.8 ? 3 : 4, 0.9, 2.6, 0.14, 0.28, 0.9, 1.5);
    else if (ny < 0.72 && u < 0.3 * (0.4 + h)) {
      // touffes accrochées aux pentes raides
      const dx = getFloorHeight(x + 1, z) - getFloorHeight(x - 1, z), dz = getFloorHeight(x, z + 1) - getFloorHeight(x, z - 1);
      const yaw = Math.atan2(-dz, -dx), n = (5 + rnd() * 7) | 0;
      newStalk(x, y, z, 2.2);
      for (let j = 0; j < n; j++) leaf(big, x, y, z, rr(0.5, 1.6), yaw + rr(-0.9, 0.9), rr(0.3, 1.1), rr(0.06, 0.12), 0.5, depth > 120 ? (rnd() < 0.7 ? 3 : 6) : rnd() < 0.3 ? 6 : 0, rnd(), rnd(), rr(0.2, 0.6));
    }
  }

  /* =====================================================================================
   * Flore des tunnels et des grands fonds. Rien de tout cela n'est une plante : ça luit tout seul.
   * Chaque tunnel a la sienne ; les Abysses ont leurs prairies ; les souvenirs ont leurs fleurs.
   * ===================================================================================== */
  /*
   * Carte de lumière : chaque touffe lumineuse dépose sa couleur autour d'elle (vue de dessus, même emprise que la
   * carte du fond). Le moteur s'en sert pour éclairer le fond, la roche, la coque : là où ça pousse, on y voit.
   */
  const LW = 128, LH = 1536, lightF = new Float32Array(LW * LH * 3);
  const LCOL = { 9: [1, 0.12, 0.1], 10: [0.15, 0.35, 1], 11: [0.25, 0.9, 0.95], 12: [0.85, 0.8, 0.65], 13: [1, 0.9, 0.9], 14: [0.5, 0.9, 0.75], 15: [1, 0.45, 0.08], 16: [1, 0.6, 0.35], 17: [0.95, 0.75, 0.72], 18: [0.5, 0.6, 1], 19: [0.5, 0.9, 1], 20: [1, 0.6, 0.2], 21: [1, 0.88, 0.6], 22: [1, 0.86, 0.5], 24: [0.4, 1, 0.7], 8: [0.2, 1, 0.3] };
  const LAMPS = [[1, 0.58, 0.14], [1, 0.92, 0.74], [1, 0.14, 0.12], [0.22, 0.42, 1], [0.2, 0.95, 0.9], [0.5, 1, 0.6], [0.7, 0.36, 1], [1, 0.5, 0.76]];
  const shine = (x, z, col, power, radius = 7) => {
    const u = ((x - MAP.X0) / MAP.W) * LW, v = ((z - MAP.Z0) / MAP.L) * LH, ru = (radius / MAP.W) * LW, rv = (radius / MAP.L) * LH;
    for (let j = Math.max(0, Math.floor(v - rv)); j <= Math.min(LH - 1, Math.ceil(v + rv)); j++) for (let i = Math.max(0, Math.floor(u - ru)); i <= Math.min(LW - 1, Math.ceil(u + ru)); i++) {
      const d2 = ((i + 0.5 - u) / ru) ** 2 + ((j + 0.5 - v) / rv) ** 2;
      if (d2 >= 1) continue;
      const k = power * (1 - d2) * (1 - d2), o = (i + j * LW) * 3;
      lightF[o] += col[0] * k; lightF[o + 1] += col[1] * k; lightF[o + 2] += col[2] * k;
    }
  };
  const shineType = (x, z, type, n, len) => { const c = LCOL[type]; if (c) shine(x, z, c, 0.012 * n * Math.min(4, len), 5 + Math.min(10, len * 1.6)); };
  /** Point lumineux libre (pas attaché à une tige). mode : 1 lampe, 2 graine, 3 cascade (H = hauteur parcourue), 4 lampion */
  const spark = (x, y, z, mode, colour, size, H = 0) => glints.push12(cellOf(x, z), x, y, z, H, rnd(), mode + (colour + 0.5) / 8, size, 0, 0, 0, 0, 0, 0);
  /** Lampe au bout d'une tige */
  const lamp = (x, y, z, h, colour, size = 0.16) => {
    newStalk(x, y, z, h + 0.5);
    leaf(big, x, y - 0.1, z, h, rnd() * TAU, rr(0, 0.16), 0.045, 0, 1, rnd(), rnd(), 0.5);
    glints.push12(cellOf(x, z), x, y + h, z, h, rnd(), 1 + (colour + 0.5) / 8, size, 0, 0, 0, 0, 0, stalk);
    shine(x, z, LAMPS[colour], 0.05, 6);
  };
  /** Quelle caverne (1 Épaves, 2 Canyon, 3 Abysses) contient z ? 0 sinon */
  const cavOf = (z) => { for (let b = 1; b < 4; b++) if (z < LAYOUT.BASINS[b].z0 && z > LAYOUT.BASINS[b].z1) return b; return 0; };

  const tuft = (x, y, z, n, type, lmin, lmax, wmin, wmax, tmin, tmax, sway, yaw = null, spread = 0.5) => {
    newStalk(x, y, z, lmax + sway);
    shineType(x, z, type, n, lmax);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = rnd() * spread, L = rr(lmin, lmax);
      leaf(big, x + Math.cos(a) * r, y - 0.1, z + Math.sin(a) * r, L, yaw === null ? a : yaw + rr(-0.5, 0.5), rr(tmin, tmax), rr(wmin, wmax), sway, type, rnd(), rnd(), rr(0.3, 0.75));
    }
  };
  /** Ce qui pend d'un plafond (tilt ≈ π : vers le bas) */
  const hang = (x, y, z, n, type, lmin, lmax, wmin, wmax) => {
    newStalk(x, y - lmax, z, lmax);
    shineType(x, z, type, n * 0.5, 4);
    for (let i = 0; i < n; i++) leaf(big, x + rr(-0.5, 0.5), y + 0.2, z + rr(-0.5, 0.5), rr(lmin, lmax), rnd() * TAU, Math.PI - rr(0, 0.22), rr(wmin, wmax), 0.5, type, rnd(), rnd(), rr(0.4, 0.7));
  };
  /** Lys de mer : une tige, une couronne de bras au sommet */
  const lily = (x, y, z, h, type) => {
    newStalk(x, y, z, h + 1);
    shineType(x, z, type, 8, 2);
    leaf(big, x, y - 0.1, z, h, rnd() * TAU, rr(0, 0.12), 0.07, 0, 1, rnd(), rnd(), 0.5);
    const n = (9 + rnd() * 8) | 0;
    for (let i = 0; i < n; i++) leaf(big, x, y + h * 0.96, z, rr(0.5, 1.1), (i / n) * TAU, rr(0.5, 1.15), rr(0.05, 0.09), h, type, rnd(), rnd(), rr(0.55, 0.9));
  };

  for (const t of LAYOUT.TUNNELS) {
    const len = t.z0 - t.z1, tries = Math.floor(len * 62 * density);
    for (let i = 0; i < tries; i++) {
      const z = rr(t.z1 - 30, t.z0 + 30), c = tunnelSection(t, z), cx = c.x, cr = c.r;
      const x = cx + rr(-1, 1) * cr * 1.15, y = getFloorHeight(x, z), R = getRoof(x, z);
      if (!R || R.c - y < 1.5) continue;
      const roofC = R.c, q = Math.abs(x - cx) / (cr * 1.2), u = rnd(), n01 = fbm(x, z, 0.05);
      if (t.id === 'veines') {
        // Des racines rouges et bleues courent sur le sol et remontent les parois ; d'autres pendent de la voûte.
        const type = fbm(x + 40, z, 0.02) > 0.5 ? 9 : 10;
        if (u < 0.34) tuft(x, y, z, (7 + rnd() * 10) | 0, type, 2, 7, 0.16, 0.36, 0.9 + q * 0.3, 1.45, 0.6, Math.PI * (x > cx ? 0 : 1), 1.2);
        else if (u < 0.5 && n01 > 0.45) hang(x, roofC, z, (4 + rnd() * 7) | 0, type, 3, 6 + (roofC - y) * 0.4, 0.13, 0.3);
        else if (u < 0.56) tuft(x, y, z, (10 + rnd() * 10) | 0, type, 0.8, 2.4, 0.12, 0.24, 0.1, 0.8, 0.8);
        if (u < 0.1) glint(x, y + rr(0.5, 6), z, 0, rnd(), type === 9 ? 0.9 : 0.7, rr(0.015, 0.04));
      } else if (t.id === 'trachee') {
        // Des cils pâles en rangs serrés sur les arceaux : ils battent tous ensemble, dans le sens du souffle.
        const rib = Math.pow(Math.max(0, Math.cos((z / t.ribs) * TAU)), 8);
        if (rib > 0.25 && u < 0.85) {
          if (rnd() < 0.6) tuft(x, y, z, (8 + rnd() * 8) | 0, 12, 1.4, 3.6, 0.12, 0.24, 0.25, 0.7, 2.2, Math.PI * 0.5, 0.6);
          else hang(x, roofC, z, (5 + rnd() * 6) | 0, 12, 2, 5, 0.12, 0.24);
        } else if (u < 0.05) tuft(x, y, z, (5 + rnd() * 5) | 0, 12, 0.5, 1.2, 0.04, 0.08, 0.2, 0.9, 1.2);
      } else {
        // Le Jardin de verre : buissons de lames translucides, arbres de verre, panaches de braise autour des sources, lianes.
        const grove = smoothstep(0.42, 0.6, n01);
        if (u < 0.22 * (0.3 + grove)) tuft(x, y, z, (6 + rnd() * 10) | 0, 11, 1.2, 4.5 + grove * 4, 0.12, 0.34, 0.02, 0.5, 0.2, null, 0.9);
        else if (u < 0.36 && grove > 0.5 && q < 0.7) { const H = Math.min(roofC - y - 2, rr(8, 22)); if (H > 5) column(x, y - 0.3, z, H, 3, 0.7); }
        else if (u < 0.46 && fbm(x - 200, z + 90, 0.035) > 0.62) tuft(x, y, z, (10 + rnd() * 14) | 0, 15, 0.8, 2.6, 0.1, 0.2, 0.1, 0.7, 1.4);
        else if (u < 0.5 && n01 < 0.42) hang(x, roofC, z, (2 + rnd() * 4) | 0, 14, 3, 5 + (roofC - y) * 0.45, 0.14, 0.26);
        if (u < 0.16) glint(x, y + rr(0.5, roofC - y - 1), z, 0, rnd(), rnd() < 0.75 ? 0.7 : 0.2, rr(0.015, 0.045));
      }
    }
  }

  /* ---- Canyon et Abysses : prairies de plumes, lys de mer, verre épars ; la Salle et ses lianes */
  for (let i = Math.floor(130000 * density); i > 0; i--) {
    // deux tirages sur trois dans les Abysses : c'est là que la plaine doit être habitée
    const x = rr(-190, 190), z = i % 3 ? rr(SEABED.Z_END + 60, LAYOUT.BASINS[3].z0 + 30) : rr(LAYOUT.BASINS[2].z1, LAYOUT.BASINS[2].z0), y = getFloorHeight(x, z);
    if (tunnelAt(z) || slopeY(x, z) < 0.6 || portalAt(x, z) > 0.5) continue;
    const abyss = z < LAYOUT.BASINS[3].z0 + 40, u = rnd(), R = getRoof(x, z);
    if (R && R.c - y < 2) continue;
    const field = smoothstep(0.46, 0.62, fbm(x + 120, z - 60, 0.018)), lil = smoothstep(0.5, 0.66, fbm(x - 300, z + 200, 0.022));
    if (R && R.c - y > 14 && u < 0.5) { if (u < 0.1) hang(x, R.c, z, (3 + rnd() * 5) | 0, 14, 3, 6 + (R.c - y) * 0.4, 0.14, 0.28); continue; } // voûtes, la Salle
    if (u < (abyss ? 0.6 : 0.22) * (0.15 + field)) tuft(x, y, z, (6 + rnd() * 9) | 0, 12, 1.0, 3.2, 0.14, 0.3, 0.05, 0.45, 1.6);
    else if (u < (abyss ? 0.55 : 0.25) * (0.1 + lil)) lily(x, y, z, rnd() < 0.08 ? rr(5, 9) : rr(1.4, 3.6), abyss ? 12 : 3);
    else if (abyss && u < 0.09) tuft(x, y, z, (5 + rnd() * 7) | 0, 11, 1, 4, 0.14, 0.3, 0.02, 0.45, 0.2);
    else if (abyss && u < 0.098 && !R) column(x, y - 0.3, z, rr(9, 20), 3, 0.6); // arbres de verre : on les voit de loin, on s'y repère
    else if (!abyss && u < 0.03) { const H = rr(5, 13); if (!R || R.c - y > H + 2) column(x, y - 0.3, z, H, 1, 0.5); } // « coraux noirs »
    if (abyss && u < 0.02) glint(x, y + rr(0.4, 3), z, 0, rnd(), 0.7, rr(0.012, 0.03));
  }

  /* =====================================================================================
   * Les cavernes : à foison. Chacune a sa lumière (ambre, bleu, vert pâle) et ses espèces.
   * ===================================================================================== */
  const organs = []; // buissons d'orgues : ils sonnent quand on les frôle (voir dive.js)
  /** Champignon-lanterne : un pied, un chapeau de larges lames à l'horizontale, lumineux par-dessous */
  const mushroom = (x, y, z, h, teal) => {
    newStalk(x, y, z, h + 1);
    leaf(big, x, y - 0.2, z, h, rnd() * TAU, rr(0, 0.1), 0.16 + h * 0.03, 0, 23, rnd(), rnd(), 0.5);
    const n = 11 + ((rnd() * 5) | 0), R0 = 0.9 + h * 0.42, s1 = teal ? rr(0.55, 1) : rr(0, 0.45);
    for (let i = 0; i < n; i++) leaf(big, x, y + h * 0.97, z, R0, (i / n) * TAU, rr(1.35, 1.5), R0 * 0.62, h, 20, s1, rnd(), 0.42);
    shine(x, z, teal ? [0.2, 0.9, 0.8] : [1, 0.6, 0.2], 0.3 + h * 0.06, 6 + h);
    glints.push12(cellOf(x, z), x, y + h * 0.8, z, h * 0.8, rnd(), 1 + ((teal ? 4 : 0) + 0.5) / 8, 0.2, 0, 0, 0, 0, 0, stalk);
  };
  /** Orgues : un buisson de tuyaux de verre, chacun sa teinte */
  const organ = (x, y, z, hmax) => {
    newStalk(x, y, z, hmax);
    const n = 7 + ((rnd() * 9) | 0);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = rnd() * 2.2, h = hmax * rr(0.35, 1); leaf(big, x + Math.cos(a) * r, y - 0.3, z + Math.sin(a) * r, h, rnd() * TAU, rr(0, 0.07), 0.45 + h * 0.025, 0, 18, rnd(), rnd(), 0.3); }
    shine(x, z, [0.5, 0.65, 1], 0.5, 12);
    organs.push(x, y + hmax * 0.4, z);
  };
  /** Saule de verre : un tronc, et des centaines de filaments lumineux qui retombent jusqu'au sol */
  const willow = (x, y, z, h) => {
    newStalk(x, y, z, h);
    leaf(big, x, y - 0.3, z, h, rnd() * TAU, rr(0, 0.08), 0.3, 0, 23, rnd(), rnd(), 0.5);
    const n = Math.floor((110 + rnd() * 90) * (0.5 + 0.5 * density)), R0 = 2.5 + h * 0.22;
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * R0; leaf(big, x + Math.cos(a) * r, y + h - r * 0.35, z + Math.sin(a) * r, (h - r * 0.4) * rr(0.6, 0.98), a, Math.PI - rr(0, 0.12), rr(0.07, 0.13), h * 0.5, 19, rnd(), rnd(), rr(0.4, 0.6)); }
    shine(x, z, [0.5, 0.9, 1], 0.9, 9 + h * 0.3);
  };
  /** Arbre-poumon : tronc pâle, houppier qui se gonfle et se vide */
  const lungTree = (x, y, z, h) => {
    newStalk(x, y, z, h + 3);
    leaf(big, x, y - 0.3, z, h, rnd() * TAU, rr(0, 0.1), 0.34, 0, 23, rnd(), rnd(), 0.5);
    for (const side of [-1, 1]) {
      const a0 = rnd() * TAU, cx = x + Math.cos(a0) * side * 1.4, cz = z + Math.sin(a0) * side * 1.4, n = Math.floor(46 * (0.5 + 0.5 * density));
      for (let i = 0; i < n; i++) { const a = rnd() * TAU; leaf(big, cx, y + h * rr(0.82, 1.02), cz, rr(1.6, 3.4), a, rr(0.2, 2.2), rr(0.5, 0.9), h, 17, rnd(), rnd(), rr(0.5, 0.85)); }
    }
    shine(x, z, [0.95, 0.75, 0.72], 0.6, 10);
  };
  /** Lustre : une tige qui pend de la voûte, une grappe de cloches, une lampe */
  const chandelier = (x, yTop, z, drop) => {
    newStalk(x, yTop - drop, z, drop);
    leaf(big, x, yTop + 0.3, z, drop, rnd() * TAU, Math.PI - rr(0, 0.05), 0.12, 0.5, 23, rnd(), rnd(), 0.5);
    const n = 14 + ((rnd() * 12) | 0), s1 = rnd();
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, r = rnd() * 1.6; leaf(big, x + Math.cos(a) * r, yTop - drop + rr(0, 2.6), z + Math.sin(a) * r, rr(0.9, 1.8), a, Math.PI - rr(0.15, 0.6), rr(0.6, 1), 0.5, 21, s1, rnd(), rr(0.55, 0.8)); }
    spark(x, yTop - drop - 0.5, z, 1, 1, 0.32);
    shine(x, z, [1, 0.88, 0.6], 0.8, 13);
  };
  /** Arbre à l'envers : enraciné dans la voûte, la cime vers le bas */
  const downTree = (x, yTop, z, H) => {
    newStalk(x, yTop - H, z, H);
    leaf(big, x, yTop + 0.5, z, H, rnd() * TAU, Math.PI - rr(0, 0.06), 0.5, 0.5, 23, rnd(), rnd(), 0.5);
    const n = Math.floor(H * 9 * (0.5 + 0.5 * density));
    for (let i = 0; i < n; i++) { const t = Math.pow(rnd(), 0.6), a = rnd() * TAU, r = (0.6 + t * 3.2) * rnd(); leaf(big, x + Math.cos(a) * r, yTop - H * t, z + Math.sin(a) * r, rr(1.2, 3), a, Math.PI - rr(0.5, 1.3), rr(0.4, 0.8), 0.5, 24, rnd(), rnd(), rr(0.5, 0.8)); }
    shine(x, z, [0.4, 1, 0.7], 0.7, 11);
  };
  /** Fleur-horloge : une corolle à plat, douze pétales courts et deux longs, arrêtés sur 4 h 12 */
  const clockFlower = (x, y, z, R0) => {
    const h = R0 * 0.9;
    newStalk(x, y, z, h + 1);
    leaf(big, x, y - 0.2, z, h, 0, 0.05, 0.14, 0, 23, rnd(), rnd(), 0.5);
    for (let i = 0; i < 12; i++) leaf(big, x, y + h, z, R0 * 0.55, (i / 12) * TAU, 1.5, R0 * 0.2, h, 22, rnd(), rnd(), 0.3);
    // les aiguilles : la petite sur le 4, la grande sur 12 minutes (angles depuis le « 12 », sens des aiguilles)
    leaf(big, x, y + h + 0.05, z, R0 * 0.62, Math.PI / 2 - (126 * Math.PI) / 180, 1.52, R0 * 0.14, h, 22, rnd(), rnd(), 0.3);
    leaf(big, x, y + h + 0.05, z, R0 * 0.98, Math.PI / 2 - (72 * Math.PI) / 180, 1.52, R0 * 0.09, h, 22, rnd(), rnd(), 0.3);
    shine(x, z, [1, 0.86, 0.5], 0.35, 5 + R0 * 2);
  };
  /** Œillet : un gros bouton fermé qui s'ouvre quand on approche */
  const bud = (x, y, z, R0) => {
    newStalk(x, y, z, R0 + 1);
    const n = 9;
    for (let i = 0; i < n; i++) leaf(big, x, y + 0.1, z, R0, (i / n) * TAU, 0.75, R0 * 0.55, 0.3, 16, rnd(), rnd(), 0.5);
    glints.push12(cellOf(x, z), x, y + R0 * 0.5, z, R0 * 0.5, rnd(), 1 + 0.5 / 8, 0.16, 0, 0, 0, 0, 0, stalk);
    shine(x, z, [1, 0.6, 0.35], 0.3, 6);
  };
  /** Pommier en fleurs : tronc, charpentières, nuage de fleurs blanches */
  const appleTree = (x, y, z, h) => {
    newStalk(x, y, z, h + 3);
    leaf(big, x, y - 0.3, z, h * 0.5, rnd() * TAU, rr(0, 0.12), 0.5, 0, 23, rnd(), rnd(), 0.5);
    const nb = 6;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * TAU + rr(-0.3, 0.3), L = h * rr(0.5, 0.75), tilt = rr(0.55, 0.95);
      leaf(big, x, y + h * 0.45, z, L, a, tilt, 0.26, h * 0.45, 23, rnd(), rnd(), 0.42);
      const n = Math.floor(34 * (0.5 + 0.5 * density));
      for (let i = 0; i < n; i++) { const t = rr(0.35, 1.05), bx = x + Math.cos(a) * Math.sin(tilt) * L * t, bz = z + Math.sin(a) * Math.sin(tilt) * L * t, by = y + h * 0.45 + Math.cos(tilt) * L * t; leaf(big, bx + rr(-0.6, 0.6), by + rr(-0.3, 0.7), bz + rr(-0.6, 0.6), rr(0.25, 0.45), rnd() * TAU, rr(0.2, 1.4), rr(0.2, 0.3), h, 13, rnd(), rnd(), rr(0.5, 0.9)); }
    }
    for (let i = 0; i < 10; i++) spark(x + rr(-4, 4), y + rr(1, h + 2), z + rr(-4, 4), 2, 1, rr(0.03, 0.06)); // pétales qui dérivent
    shine(x, z, [1, 0.94, 0.92], 0.9, 10);
  };

  // --- Semis général dans les trois cavernes
  const CAV = [null,
    { lampCol: 0, moss: 15, ceil: [0, 1] }, // Épaves : ambre
    { lampCol: 3, moss: 10, ceil: [3, 4] }, // Canyon : bleu
    { lampCol: 5, moss: 12, ceil: [5, 1] }, // Abysses : vert pâle et blanc
  ];
  for (let b = 1; b < 4; b++) {
    const B = LAYOUT.BASINS[b], P = CAV[b], zEnd = Math.max(B.z1, SEABED.Z_END + 70), area = (B.z0 - zEnd) * 290;
    for (let i = Math.floor(area * 0.75 * density); i > 0; i--) {
      const x = rr(-150, 150), z = rr(zEnd, B.z0), y = getFloorHeight(x, z);
      if (y > -20 || slopeY(x, z) < 0.55 || portalAt(x, z) > 0.6) continue;
      const R = getRoof(x, z);
      if (!R || R.c - y < 4) continue;
      const room = R.c - y, u = rnd();
      const fLamp = smoothstep(0.36, 0.56, fbm(x + 700 * b, z, 0.012)), fMoss = smoothstep(0.4, 0.58, fbm(x - 400, z + 300 * b, 0.016)), fTree = smoothstep(0.52, 0.66, fbm(x + 90, z - 900 * b, 0.009));
      if (u < 0.03 + 0.24 * fLamp) lamp(x, y, z, rr(0.7, 2.6), rnd() < 0.85 ? P.lampCol : 1, rr(0.12, 0.2)); // champs de lampes
      else if (u < 0.03 + 0.24 * fLamp + 0.05 + 0.3 * fMoss) { for (let j = 0; j < 5; j++) leaf(small, x + rr(-0.5, 0.5), y - 0.05, z + rr(-0.5, 0.5), rr(0.2, 0.55), rnd() * TAU, rr(0.05, 0.8), rr(0.08, 0.16), 0, P.moss, rnd(), rnd(), rr(0.3, 0.7)); shine(x, z, LCOL[P.moss], 0.1, 4); } // mousses
      else if (u < 0.52 && u > 0.5) bud(x, y, z, rr(1, 2.2)); // œillets, partout, clairsemés
      else {
        // les grandes espèces : rares, tirées à part
        const v = rnd();
        if (b === 1) {
          if (v < 0.05 && (nearWreck(x, z, 34) || fTree > 0.55)) mushroom(x, y, z, rr(2.5, Math.min(8, room - 3)), rnd() < 0.25);
          else if (v < 0.012) mushroom(x, y, z, rr(2, 4.5), rnd() < 0.25);
          else if (v > 0.994 && fTree > 0.3 && room > 16) lungTree(x, y, z, rr(7, Math.min(15, room - 6)));
        } else if (b === 2) {
          if (v < 0.006 && fTree > 0.35 && room > 20) willow(x, y, z, rr(10, Math.min(24, room - 5)));
          else if (v < 0.016 && fTree < 0.25) mushroom(x, y, z, rr(2, 5), true);
          else if (v > 0.9975 && room > 14) organ(x, y, z, rr(8, Math.min(22, room - 3)));
        } else {
          if (v < 0.012 && fTree > 0.4) clockFlower(x, y, z, rr(1.4, 3.6));
          else if (v > 0.997 && room > 14) organ(x, y, z, rr(8, Math.min(26, room - 3)));
          else if (v > 0.994 && v < 0.996 && room > 20) willow(x, y, z, rr(10, 20));
        }
      }
      // la voûte : un ciel de points lumineux (c'est lui qui dit la hauteur du plafond), des lustres, des arbres à l'envers
      if (u > 0.6) {
        const sky = smoothstep(0.35, 0.6, fbm(x - 150, z + 80 * b, 0.02));
        if (u < 0.66 + 0.26 * sky) spark(x, R.c - 0.4, z, 1, P.ceil[rnd() < 0.75 ? 0 : 1], rr(0.07, 0.15));
        else if (u > 0.992 && room > 40) chandelier(x, R.c, z, rr(8, Math.min(30, room * 0.4)));
        else if (b === 3 && u > 0.975 && room > 45) downTree(x, R.c, z, rr(14, Math.min(40, room * 0.5)));
        else if (b === 1 && u > 0.985 && z > B.z0 - 260 && room > 40) { // les grandes racines des Veines ressortent dans la caverne
          const type = rnd() < 0.5 ? 9 : 10, n = 3 + ((rnd() * 4) | 0);
          newStalk(x, y, z, room);
          for (let j = 0; j < n; j++) leaf(big, x + rr(-1.5, 1.5), R.c + 0.5, z + rr(-1.5, 1.5), room * rr(0.7, 1.02), rnd() * TAU, Math.PI - rr(0, 0.1), rr(0.5, 1.1), 0.5, type, rnd(), rnd(), rr(0.42, 0.6));
          shine(x, z, LCOL[type], 0.8, 10);
        }
      }
      // en pleine eau : des graines qui dérivent, des lampions
      if (u > 0.93 && u < 0.962) spark(x, y + rr(4, Math.min(room - 3, 45)), z, 2, P.ceil[0], rr(0.035, 0.07));
      else if (u > 0.962 && u < 0.972 && room > 25) spark(x, y + rr(10, room - 10), z, 4, P.ceil[1], rr(0.22, 0.4));
    }
  }

  // --- Rivières de lumière : des coulées bleues sur le fond, d'un lieu à l'autre (sortie de tunnel → puits → souvenirs → tunnel suivant)
  const river = (pts, colType, lampC) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], len = Math.hypot(x1 - x0, z1 - z0), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      for (let d = 0; d < len; d += 0.7) {
        const t = d / len, w = Math.sin(d * 0.045 + k) * 9 + Math.sin(d * 0.13) * 3;
        const x = x0 + (x1 - x0) * t + nx * (w + rr(-1.4, 1.4)), z = z0 + (z1 - z0) * t + nz * (w + rr(-1.4, 1.4)), y = getFloorHeight(x, z);
        if (headroom(x, z) < 3) continue;
        for (let j = 0; j < 3; j++) leaf(small, x + rr(-0.4, 0.4), y - 0.05, z + rr(-0.4, 0.4), rr(0.18, 0.5), rnd() * TAU, rr(0.1, 0.9), rr(0.08, 0.15), 0, colType, rnd(), rnd(), rr(0.3, 0.7));
        if (rnd() < 0.5) shine(x, z, LCOL[colType], 0.16, 4.5);
        if (rnd() < 0.05) spark(x, y + rr(0.3, 1.2), z, 2, lampC, rr(0.03, 0.05));
      }
    }
  };
  const frag = (id) => { const f = fragmentsData.fragments.find((q) => q.id === id); return [f.inCanyon ? canyonCenter(f.z) + f.x : f.x, f.z]; };
  const PK = LAYOUT.POCKETS, TN = LAYOUT.TUNNELS;
  river([[TN[0].x1, TN[0].z1 - 30], [PK[0].x, PK[0].z], frag('montre'), frag('carnet'), [TN[1].x0, TN[1].z0 + 30]], 15, 0);
  river([[TN[1].x1, TN[1].z1 - 30], [PK[4].x, PK[4].z], frag('plaque'), frag('couteau'), frag('enfance'), [TN[2].x0, TN[2].z0 + 30]], 10, 3);
  river([[TN[2].x1, TN[2].z1 - 30], [PK[8].x, PK[8].z], frag('soins'), [RADIATION.SOURCE.x, RADIATION.SOURCE.z + 60]], 12, 5);

  // --- Cascades qui remontent : sous chaque poche d'air, des filets de lumière montent du fond jusqu'à la surface
  for (const p of getPockets()) {
    const y = getFloorHeight(p.x, p.z), H = p.y - y;
    for (let i = 0; i < 70; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * p.r * 0.7; spark(p.x + Math.cos(a) * r, y + 0.5, p.z + Math.sin(a) * r, 3, p.camp ? 0 : 1, rr(0.05, 0.11), H); }
    shine(p.x, p.z, p.camp ? [1, 0.85, 0.6] : [0.8, 0.95, 0.9], 1.2, p.r * 1.6);
  }

  // --- Les tunnels reçoivent aussi leurs vedettes
  for (const t of TN) for (let i = Math.floor((t.z0 - t.z1) * 0.5 * density); i > 0; i--) {
    const z = rr(t.z1, t.z0), c = tunnelSection(t, z), cx = c.x, cr = c.r, x = cx + rr(-0.8, 0.8) * cr, y = getFloorHeight(x, z), R = getRoof(x, z);
    if (!R || R.c - y < 8) continue;
    const room = R.c - y, u = rnd();
    if (t.id === 'trachee') { if (u < 0.16) lungTree(x, y, z, rr(6, Math.min(13, room - 6))); else if (u < 0.6) spark(x, y + rr(3, room - 2), z, 2, 1, rr(0.03, 0.06)); }
    else if (t.id === 'jardin') { if (u < 0.1) organ(x, y, z, rr(8, Math.min(24, room - 3))); else if (u < 0.2) chandelier(x, R.c, z, rr(5, room * 0.45)); else if (u < 0.7) spark(x, y + rr(3, room - 2), z, 4, 4, rr(0.2, 0.36)); }
    else if (u < 0.5) spark(x, y + rr(2, room - 2), z, 2, rnd() < 0.5 ? 2 : 3, rr(0.035, 0.07));
    else if (u < 0.6) lamp(x, y, z, rr(1, 3), rnd() < 0.5 ? 2 : 3, 0.18);
  }

  // --- Le verger : un seul endroit, dans les Abysses. De vrais pommiers en fleurs, blancs, sous onze cents mètres d'eau.
  {
    const V = LAYOUT.VERGER;
    for (let i = 0; i < V.trees; i++) {
      const a = (i / V.trees) * TAU * 2.4, r = 6 + (i / V.trees) * V.r, x = V.x + Math.cos(a) * r + rr(-3, 3), z = V.z + Math.sin(a) * r + rr(-3, 3);
      if (headroom(x, z) > 14) appleTree(x, getFloorHeight(x, z), z, rr(5.5, 8.5));
    }
    for (let i = 0; i < 500; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * (V.r + 8), x = V.x + Math.cos(a) * r, z = V.z + Math.sin(a) * r, y = getFloorHeight(x, z); for (let j = 0; j < 4; j++) leaf(small, x + rr(-0.3, 0.3), y - 0.05, z + rr(-0.3, 0.3), rr(0.15, 0.4), rnd() * TAU, rr(0.1, 0.8), rr(0.06, 0.1), 0, 13, rnd(), rnd(), 0.5); }
    shine(V.x, V.z, [1, 0.95, 0.93], 1.5, V.r + 12);
  }

  /* ---- Les fleurs de chevet : elles ne poussent qu'autour des souvenirs (on apprend à les chercher) */
  for (const f of fragmentsData.fragments) {
    const fx = f.inCanyon ? canyonCenter(f.z) + f.x : f.x;
    for (let i = 0; i < 46; i++) {
      const a = rnd() * TAU, r = 1.6 + Math.pow(rnd(), 1.6) * 9, x = fx + Math.cos(a) * r, z = f.z + Math.sin(a) * r, y = getFloorHeight(x, z);
      const h = rr(0.5, 1.5);
      newStalk(x, y, z, h + 0.6);
      shine(x, z, LCOL[13], 0.07, 5);
      leaf(big, x, y - 0.05, z, h, rnd() * TAU, rr(0, 0.25), 0.05, 0, 1, rnd(), rnd(), 0.5);
      const n = 5 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) leaf(big, x, y + h * 0.95, z, rr(0.22, 0.4), (k / n) * TAU, rr(0.7, 1.2), rr(0.16, 0.24), h, 13, rnd(), rnd(), rr(0.6, 0.9));
      if (rnd() < 0.5) glint(x, y + h + rr(0.2, 1.4), z, 0, rnd(), 0.95, rr(0.012, 0.028));
    }
  }

  const S0 = RADIATION.SOURCE;
  /* ---- Tapis de petites touffes */
  for (let i = Math.floor(520000 * density); i > 0; i--) {
    // les tapis ne poussent que dans le Récif et autour de la faille : on ne tire que là
    const x = rr(-200, 200), z = i % 8 ? rr(-600, 210) : rr(S0.z - 200, S0.z + 200), u = rnd();
    const m = coverAt(x, z), pz = portalAt(x, z);
    let kind = 0;
    if (pz > 0.05 && u < pz * 0.6 * smoothstep(0.4, 0.62, fbm(x, z, 0.06))) kind = 8;
    else if (m > 0.3 && u < m * 0.9) kind = 5;
    else if (z > -560 && u < 0.3 * smoothstep(0.42, 0.6, fbm(x, z, 0.09)) * (z > -400 ? 1 : 0.4)) kind = 7;
    if (!kind) continue;
    const y = getFloorHeight(x, z);
    if (y > -5 || slopeY(x, z) < 0.72) continue;
    if (kind === 5) {
      for (let j = 0; j < 4; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.12, 0.34), rnd() * TAU, rr(0.05, 0.75), rr(0.04, 0.08), 0, 5, rnd(), rnd(), rr(0.3, 0.7));
      if (rnd() < 0.12) glint(x, y + rr(0.08, 0.22), z, 0, rnd(), 0.82 + rnd() * 0.18, rr(0.01, 0.02));
    } else if (kind === 7) for (let j = 0; j < 3; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.25, 0.7), rnd() * TAU, rr(0.1, 0.8), rr(0.05, 0.1), 0, 7, rnd(), rnd(), rr(0.3, 0.8));
    else {
      for (let j = 0; j < 3; j++) leaf(small, x + rr(-0.1, 0.1), y - 0.05, z + rr(-0.1, 0.1), rr(0.15, 0.5), rnd() * TAU, rr(0.05, 0.7), rr(0.04, 0.09), 0, 8, rnd(), rnd(), rr(0.3, 0.8));
      if (rnd() < 0.25) glint(x, y + rr(0.2, 1.6), z, 0, rnd(), 0.3 + rnd() * 0.3, rr(0.012, 0.03));
    }
  }

  // Carte de lumière → 8 bits (compression douce : beaucoup de petites lueurs s'additionnent sans saturer)
  const light = new Uint8Array(LW * LH * 4);
  for (let i = 0; i < LW * LH; i++) for (let k = 0; k < 3; k++) light[i * 4 + k] = Math.min(255, Math.sqrt(1 - Math.exp(-lightF[i * 3 + k] * 0.9)) * 255);

  return {
    light: { data: light, w: LW, h: LH },
    organs: new Float32Array(organs),
    counts: { leaves: big.n / 14, small: small.n / 14, glints: glints.n / 14, stalks: stalks.length / 4 },
    big: pack(big, true),
    bigF: pack(big, true, 2, 1.5),
    small: pack(small, true),
    glints: pack(glints, false),
    stalks: new Float32Array(stalks),
  };
}
