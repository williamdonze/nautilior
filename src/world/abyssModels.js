import * as THREE from 'three';
import { applySkin } from './detail.js';
import { createNoise2D } from './noise.js';
import { build, grid } from './wildlifeModels.js';

/**
 * Créatures des grands fonds : des formes qui n'existent pas.
 * MAQUETTES : ces modèles servent à choisir lesquelles entreront dans le jeu (voir bestiary.html).
 * Toutes mesurent environ 1 unité ; l'échelle réelle sera donnée à l'intégration.
 */
const noise = createNoise2D(1313);
const TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
const mixC = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));
const skin = (opts = {}) => applySkin(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { rim: 0.6, translucent: 0.4, iridescent: 0.3, rimColor: '#7fbf7a', ...opts });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const flat = (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });

/** Sphère déformée colorée par fonction : fn(x, y, z) → { r (rayon), c (couleur), g (lueur) } */
function blob(verts, idx, cx, cy, cz, R, fn, nu = 20, nv = 14) {
  grid(verts, idx, nu, nv, (fu, fv) => {
    const a = fu * TAU, p = fv * Math.PI, x = Math.cos(a) * Math.sin(p), y = Math.cos(p), z = Math.sin(a) * Math.sin(p);
    const o = fn(x, y, z);
    return { p: [cx + x * R * o.r, cy + y * R * o.r, cz + z * R * o.r], c: o.c, u: o.u ?? 0, g: o.g ?? 0 };
  });
}
/** Tube le long de points (rayon variable) */
function tube(verts, idx, pts, radius, color, seg = 8, u0 = 0, u1 = 1, glowFn = null) {
  const n = pts.length, t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0.13, 1, 0.21).normalize();
  grid(verts, idx, n - 1, seg, (fu, fv) => {
    const i = Math.min(n - 1, Math.round(fu * (n - 1))), p = pts[i];
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    a.crossVectors(t, up).normalize(); b.crossVectors(t, a);
    const r = typeof radius === 'function' ? radius(fu) : radius, an = fv * TAU;
    return { p: [p.x + (a.x * Math.cos(an) + b.x * Math.sin(an)) * r, p.y + (a.y * Math.cos(an) + b.y * Math.sin(an)) * r, p.z + (a.z * Math.cos(an) + b.z * Math.sin(an)) * r], c: typeof color === 'function' ? color(fu) : color, u: u0 + (u1 - u0) * fu, g: glowFn ? glowFn(fu) : 0 };
  });
}

/* 1 ─ Le Chapelet : des sphères pâles enfilées sur un cordon, chacune avec sa bouche. Il s'enroule et serre. */
export function createChapelet() {
  const g = new THREE.Group(), verts = [], idx = [];
  const pale = C('#b8b09a'), vein = C('#6a3a3a'), dark = C('#1a0a0c');
  const N = 9, pts = [];
  for (let i = 0; i < N; i++) { const t = i / (N - 1); pts.push(new THREE.Vector3(Math.sin(t * 4.2) * 0.22, Math.cos(t * 3.1) * 0.16 - 0.05, 0.5 - t)); }
  const cord = [];
  for (let i = 0; i <= 60; i++) { const t = (i / 60) * (N - 1), k = Math.min(N - 2, Math.floor(t)); cord.push(pts[k].clone().lerp(pts[k + 1], t - k)); }
  tube(verts, idx, cord, 0.012, vein, 6, 0, 1);
  pts.forEach((p, i) => {
    const R = 0.055 + 0.03 * Math.sin(i * 2.3 + 1) + (i === 0 ? 0.035 : 0), ax = new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3) * 0.6, Math.cos(i * 2.1)).normalize();
    blob(verts, idx, p.x, p.y, p.z, R, (x, y, z) => {
      const d = x * ax.x + y * ax.y + z * ax.z; // vers la bouche
      const mouth = d > 0.72 ? 1 : 0, lip = Math.max(0, 1 - Math.abs(d - 0.72) * 9);
      const v = Math.pow(Math.abs(noise(x * 4 + i, y * 4 + z * 4)), 0.5);
      return { r: (mouth ? 0.72 - (d - 0.72) * 2.4 : 1 + lip * 0.14) * (1 + noise(x * 3, z * 3 + i) * 0.06), c: mouth ? dark : mixC(pale, vein, (1 - v) * 0.7 + lip * 0.6), u: i / N, g: lip * 0.25 };
    }, 22, 16);
    // couronne de dents autour de chaque bouche
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU, s1 = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0.3)).normalize(), s2 = new THREE.Vector3().crossVectors(ax, s1);
      const t = new THREE.Mesh(new THREE.ConeGeometry(R * 0.07, R * 0.42, 5), flat('#e0dcc8'));
      t.position.copy(p).addScaledVector(ax, R * 0.78).addScaledVector(s1, Math.cos(a) * R * 0.5).addScaledVector(s2, Math.sin(a) * R * 0.5);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax.clone().addScaledVector(s1, -Math.cos(a) * 0.9).addScaledVector(s2, -Math.sin(a) * 0.9).normalize());
      g.add(t);
    }
  });
  g.add(new THREE.Mesh(build(verts, idx), Object.assign(skin({ rimColor: '#c8a8a0' }), { userData: { skin: 0.3, swim: true } })));
  return g;
}

/* 2 ─ L'Écorché : une raie retournée comme un gant. Côtes dehors, chair à vif, et des yeux sous le ventre. */
export function createEcorche() {
  const g = new THREE.Group(), verts = [], idx = [];
  const flesh = C('#7a1e22'), raw = C('#b84a40'), fat = C('#d8b890'), bone = C('#e0dcc0');
  const surf = (top) => (fu, fv) => {
    const u = fu * 2 - 1, au = Math.abs(u), lead = 0.5 - 0.6 * Math.pow(au, 1.5), trail = Math.min(lead - 0.02, -0.4 + 0.3 * Math.pow(au, 1.3) + Math.max(0, noise(u * 6, 2)) * 0.2 * au);
    const z = lead + (trail - lead) * fv, th = 0.1 * Math.pow(1 - au, 1.6) * Math.pow(Math.sin(Math.PI * Math.min(1, fv * 1.05)), 0.7) + 0.004;
    // fibres musculaires : stries dans le sens de l'envergure
    const fib = Math.pow(Math.abs(Math.sin(z * 60 + noise(u * 4, z * 4) * 4)), 3);
    const c = top ? mixC(mixC(flesh, raw, fib), fat, Math.pow(Math.max(0, noise(u * 9, z * 9)), 2) * 1.5) : mixC(flesh, C('#2a0a10'), 0.5 + fib * 0.3);
    return { p: [u * 0.5, (top ? th : -th * 0.6) + 0.04 * au * au, z], c, u, g: 0 };
  };
  grid(verts, idx, 40, 14, surf(true));
  grid(verts, idx, 40, 14, surf(false), true);
  // Côtes à l'extérieur : des arcs d'os qui partent de l'échine, par-dessus les ailes
  for (let k = 0; k < 11; k++) {
    const z = 0.34 - k * 0.062;
    for (const s of [-1, 1]) {
      const span = 0.42 * Math.sin(((k + 1.5) / 13) * Math.PI), pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, x = s * t * span, au = Math.abs(x) / 0.5; pts.push(new THREE.Vector3(x, 0.1 * Math.pow(1 - au, 1.6) + 0.035 * Math.sin(t * Math.PI) + 0.012, z - t * t * 0.1)); }
      tube(verts, idx, pts, (f) => 0.011 * (1 - f * 0.7), bone, 6, 0, s * span * 2);
    }
  }
  // Échine : vertèbres
  for (let k = 0; k < 14; k++) blob(verts, idx, 0, 0.115 - k * 0.003, 0.42 - k * 0.06, 0.024 - k * 0.0008, () => ({ r: 1, c: bone }), 8, 6);
  const m = skin({ rimColor: '#ff9a8a', translucent: 0.6 });
  m.userData.flap = 1;
  g.add(new THREE.Mesh(build(verts, idx), m));
  // Yeux sous le ventre, en grappe, de tailles inégales
  for (let i = 0; i < 9; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012 + (i % 3) * 0.007, 12, 8), glow(i % 4 ? '#ffe0a0' : '#ffffff'));
    e.position.set(Math.sin(i * 2.4) * 0.07, -0.07, 0.18 + Math.cos(i * 1.7) * 0.09);
    g.add(e);
  }
  const tail = [];
  for (let i = 0; i <= 14; i++) tail.push(new THREE.Vector3(Math.sin(i * 0.5) * 0.02, 0.01, -0.4 - i * 0.06));
  const tv = [], ti = [];
  tube(tv, ti, tail, (f) => 0.012 * (1 - f), bone, 5);
  g.add(new THREE.Mesh(build(tv, ti), flat('#e0dcc0')));
  return g;
}

/* 3 ─ La Glaneuse : un corps gros comme le poing au bout de six pattes de dix mètres. Elle marche sur le fond et cueille. */
export function createGlaneuse() {
  const g = new THREE.Group(), verts = [], idx = [];
  const shell = C('#1c1a20'), joint = C('#6a5a70'), tip = C('#c8c0d8');
  const B = new THREE.Vector3(0, 0.92, 0);
  blob(verts, idx, B.x, B.y, B.z, 0.085, (x, y, z) => ({ r: 1 + Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 3)), 6) * 0.12 - (y < -0.2 ? 0.2 : 0), c: mixC(shell, joint, Math.max(0, y) * 0.6 + noise(x * 5, z * 5) * 0.2) }), 24, 16);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3, r = 0.5 + 0.12 * Math.sin(k * 2.7), knee = new THREE.Vector3(Math.cos(a) * r * 0.42, 1.0 + 0.1 * Math.sin(k * 1.9), Math.sin(a) * r * 0.42), foot = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(B.clone().lerp(knee, i / 10));
    for (let i = 1; i <= 22; i++) { const t = i / 22; pts.push(knee.clone().lerp(foot, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * 0.03, 0))); }
    tube(verts, idx, pts, (f) => 0.011 * (1 - f * 0.75) + (Math.abs(f - 0.31) < 0.02 ? 0.012 : 0), (f) => mixC(shell, tip, Math.pow(f, 3)), 6, 0, 1, (f) => (f > 0.96 ? 0.8 : 0));
  }
  // deux bras courts repliés sous le corps, terminés en crochets
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(s * (0.03 + t * 0.07), 0.9 - t * 0.2 + Math.sin(t * Math.PI) * 0.04, 0.06 + t * 0.12 - t * t * 0.1)); }
    tube(verts, idx, pts, (f) => 0.012 * (1 - f * 0.8), (f) => mixC(joint, tip, f), 6);
  }
  g.add(new THREE.Mesh(build(verts, idx), skin({ rimColor: '#b8a0ff', iridescent: 0.6 })));
  // un seul œil, énorme pour ce corps, cerclé
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 14), glow('#e8f0ff'));
  eye.position.set(0, 0.93, 0.065);
  g.add(eye);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), glow('#05060a'));
  pupil.position.set(0, 0.93, 0.097);
  g.add(pupil);
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 24), flat('#6a5a70'));
  lid.position.set(0, 0.93, 0.07);
  g.add(lid);
  return g;
}

/* 4 ─ Le Chœur : des têtes sans corps, bouches grandes ouvertes, qui nagent ensemble et hurlent en chargeant. */
export function createChoeur() {
  const g = new THREE.Group(), verts = [], idx = [];
  const skinC = C('#a8a890'), shade = C('#4a4a3c'), dark = C('#0a0606');
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 15; k++) {
    const p = new THREE.Vector3((rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.7), R = 0.06 + rnd() * 0.04;
    const tilt = (rnd() - 0.5) * 0.6;
    blob(verts, idx, p.x, p.y, p.z, R, (x, y, z) => {
      // visage tourné vers +Z : orbites creuses, bouche béante qui mange la moitié de la tête
      const yy = y * Math.cos(tilt) - x * Math.sin(tilt), xx = x * Math.cos(tilt) + y * Math.sin(tilt);
      const mouth = z > 0.25 && Math.hypot(xx * 1.3, (yy + 0.38) * 1.0) < 0.5;
      const orbit = z > 0.3 && Math.min(Math.hypot(xx - 0.36, yy - 0.3), Math.hypot(xx + 0.36, yy - 0.3)) < 0.2;
      const jaw = yy < -0.2 ? 1 + (-yy - 0.2) * 0.5 : 1; // mâchoire qui pend
      return { r: (mouth ? 0.45 : orbit ? 0.8 : 1) * jaw * (1 + noise(x * 4 + k, z * 4) * 0.05) * (z < -0.5 ? 0.85 : 1), c: mouth || orbit ? dark : mixC(skinC, shade, Math.max(0, -z) * 0.8 + Math.pow(Math.abs(noise(x * 6, y * 6 + k)), 2)), u: Math.max(0, -z) };
    }, 22, 16);
    // lambeaux à la place du cou
    for (let j = 0; j < 4; j++) {
      const pts = [], a = j * 1.6 + k;
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(p.x + Math.cos(a) * R * 0.4 * (1 - t) + Math.sin(t * 5 + j) * 0.015, p.y - R * 0.5 - t * R * 1.2 + Math.sin(a) * R * 0.2, p.z - R * 0.6 - t * R * 2.2)); }
      tube(verts, idx, pts, (f) => R * 0.09 * (1 - f), shade, 5, 0.3, 1);
    }
    // deux points de lumière au fond des orbites
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(R * 0.07, 8, 6), glow('#c8ffb0'));
      e.position.set(p.x + s * R * 0.36 * Math.cos(tilt) + R * 0.3 * Math.sin(tilt) * -1, p.y + R * 0.3, p.z + R * 0.72);
      g.add(e);
    }
  }
  const m = skin({ rimColor: '#c8ffb0', translucent: 0.3 });
  m.userData.swim = true;
  g.add(new THREE.Mesh(build(verts, idx), m));
  return g;
}

/* 5 ─ Le Linceul : une nappe presque invisible qui dérive, et se plaque sur la bulle du cockpit. */
export function createLinceul() {
  const g = new THREE.Group(), verts = [], idx = [];
  const veil = C('#9ab8c0'), vein = C('#e0f4f0'), N = 46;
  grid(verts, idx, N, N, (fu, fv) => {
    const u = fu * 2 - 1, v = fv * 2 - 1, r = Math.hypot(u, v);
    // drapé : bombé au centre, bords qui retombent et ondulent
    const y = 0.22 * Math.cos(Math.min(1, r) * Math.PI * 0.5) - 0.3 * r * r + Math.sin(Math.atan2(v, u) * 7 + r * 5) * 0.05 * r + noise(u * 3, v * 3) * 0.03;
    const net = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(u * 16 + noise(u * 3, v * 3) * 3) * Math.sin(v * 16 + noise(v * 3, u * 3) * 3)) * 3), 2);
    const k = 0.55 * (1 + noise(u * 2, v * 2) * 0.12);
    return { p: [u * k, y, v * k], c: mixC(veil, vein, net), u: r, g: net * 0.5 + (r < 0.12 ? 0.8 : 0) };
  });
  // bords en lambeaux : on retire les mailles du bord là où le bruit le dit
  const geo = build(verts, idx), p = geo.attributes.position, keep = [];
  for (let i = 0; i < geo.index.count; i += 3) {
    const a = geo.index.array[i], x = p.getX(a), z = p.getZ(a), r = Math.hypot(x, z) / 0.55;
    if (r > 1.0 || (r > 0.72 && noise(x * 9, z * 9) > 0.15 - (r - 0.72) * 1.2)) continue;
    keep.push(geo.index.array[i], geo.index.array[i + 1], geo.index.array[i + 2]);
  }
  geo.setIndex(keep);
  const m = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false }), { rim: 0.9, translucent: 0.9, iridescent: 0.7, rimColor: '#c8fff0' });
  g.add(new THREE.Mesh(geo, m));
  // filaments qui pendent du centre
  const fv = [], fi = [];
  for (let k = 0; k < 12; k++) {
    const pts = [], a = k * 0.52, r0 = 0.05 + (k % 3) * 0.05;
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(Math.cos(a) * r0 + Math.sin(t * 6 + k) * 0.02, 0.15 - t * (0.5 + (k % 4) * 0.12), Math.sin(a) * r0 + Math.cos(t * 5 + k) * 0.02)); }
    tube(fv, fi, pts, (f) => 0.004 * (1 - f * 0.6), vein, 4, 0, 1, (f) => (f > 0.9 ? 1 : 0.15));
  }
  g.add(new THREE.Mesh(build(fv, fi), skin({ rimColor: '#c8fff0' })));
  return g;
}

export const ABYSS_MODELS = [
  { id: 'chapelet', name: 'Le Chapelet', make: createChapelet },
  { id: 'ecorche', name: "L'Écorché", make: createEcorche },
  { id: 'glaneuse', name: 'La Glaneuse', make: createGlaneuse },
  { id: 'choeur', name: 'Le Chœur', make: createChoeur },
  { id: 'linceul', name: 'Le Linceul', make: createLinceul },
];
