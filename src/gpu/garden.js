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
import { headroom } from '../world/roof.js';
import { getFloorHeight } from '../world/seabed.js';
import { createNoise2D } from '../world/noise.js';
import { createRandom, smoothstep } from '../core/utils.js';
import { RADIATION, SUBMARINE, WORLD, SEABED } from '../config/settings.js';
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
    const y = a[o + 2], l = leafFmt ? a[o + 4] : 0.5;
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
      const type = kind === 1 ? (rnd() < 0.8 ? 3 : 4) : kind === 2 ? (rnd() < 0.5 ? 4 : 0) : 0;
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

  return {
    big: pack(big, true),
    bigF: pack(big, true, 2, 1.5),
    small: pack(small, true),
    glints: pack(glints, false),
    stalks: new Float32Array(stalks),
  };
}
