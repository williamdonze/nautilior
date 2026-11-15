import * as THREE from 'three';
import { applySkin } from './detail.js';
import { createNoise2D } from './noise.js';

/**
 * Modèles de la grande faune : raies, tortues, requins, calmars — et leurs versions
 * « décharnées » des profondeurs (chair en lambeaux, arêtes à nu qui luisent, yeux allumés).
 * Tous regardent vers +Z et mesurent environ 1 m : la taille réelle est donnée par l'échelle.
 *
 * Animation dans le shader du moteur WebGPU, pilotée par l'attribut aU :
 *   userData.flap : battement d'ailes, aU = position le long de l'aile (−1..1)
 *   userData.swim : ondulation du corps, aU = 0 à la tête, 1 à la queue
 * aGlow : parties qui luisent dans le noir.
 */
const noise = createNoise2D(77);
const TAU = Math.PI * 2;

function skin(opts, anim) {
  const m = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), opts);
  Object.assign(m.userData, anim);
  return m;
}
const glow = (color) => new THREE.MeshBasicMaterial({ color });

/** Assemble une géométrie à partir de sommets { p, c, u, g } et d'indices */
export function build(verts, idx) {
  const n = verts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), aU = new Float32Array(n), aG = new Float32Array(n);
  verts.forEach((v, i) => {
    pos.set(v.p, i * 3); col[i * 3] = v.c.r; col[i * 3 + 1] = v.c.g; col[i * 3 + 2] = v.c.b; aU[i] = v.u; aG[i] = v.g ?? 0;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(aG, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
/** Grille de (nu+1) × (nv+1) sommets : fn(i, j) → sommet */
export function grid(verts, idx, nu, nv, fn, flip = false) {
  const base = verts.length;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) verts.push(fn(i / nu, j / nv));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = base + i * (nv + 1) + j, b = a + nv + 1;
    if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
const C = (hex) => new THREE.Color(hex);
const mixC = (a, b, t) => a.clone().lerp(b, Math.max(0, Math.min(1, t)));

function eyes(group, x, y, z, r, color) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), glow(color));
    e.position.set(s * x, y, z);
    group.add(e);
  }
}

/* ------------------------------------------------------------------ Raies */

/** Raie manta ; zombie = ailes en lambeaux, rayons osseux lumineux, peau nécrosée */
export function createRay(zombie = false) {
  const group = new THREE.Group();
  const back = C(zombie ? '#3a4038' : '#232a33'), belly = C(zombie ? '#8a8a70' : '#b8c0c0');
  const rot = C('#5a6a3a'), bone = C('#c8d0a8'), pale = C('#6f7890');
  const verts = [], idx = [];
  const NU = 40, NV = 14;
  const surf = (top) => (fu, fv) => {
    const u = fu * 2 - 1, au = Math.abs(u);
    const lead = 0.5 - 0.62 * Math.pow(au, 1.5);
    let trail = -0.42 + 0.3 * Math.pow(au, 1.3);
    if (zombie) trail += Math.max(0, noise(u * 7, 3.1)) * 0.3 * Math.min(1, au * 4) + Math.max(0, noise(u * 19, 1.7)) * 0.1;
    trail = Math.min(trail, lead - 0.02);
    const z = lead + (trail - lead) * fv;
    const th = 0.11 * Math.pow(1 - au, 1.7) * Math.pow(Math.sin(Math.PI * Math.min(1, fv * 1.05)), 0.7) + 0.004;
    const y = (top ? th : -th * 0.55) + 0.05 * au * au; // pointes légèrement relevées
    let c, g = 0;
    if (top) {
      c = mixC(back, pale, noise(u * 3, z * 4) * 0.25 + (au > 0.75 ? 0.25 : 0));
      if (zombie) {
        c = mixC(c, rot, noise(u * 5 + 9, z * 6) * 0.9);
        // rayons osseux à nu, de plus en plus visibles vers le bord déchiré
        const rib = Math.pow(Math.max(0, Math.sin(au * 30 + z * 5)), 8) * Math.min(1, au * 3) * (0.4 + 0.6 * fv);
        c = mixC(c, bone, rib); g = rib * 0.7;
      }
    } else {
      c = mixC(belly, back, (noise(u * 6, z * 6 + 4) > 0.35 ? 0.5 : 0) + au * 0.3);
      if (zombie) { const gl = Math.pow(Math.max(0, Math.sin(z * 26)), 6) * (au < 0.22 ? 1 : 0); c = mixC(c, bone, gl); g = gl * 0.9; } // branchies qui luisent
    }
    return { p: [u * 0.5, y, z], c, u, g };
  };
  grid(verts, idx, NU, NV, surf(true));
  grid(verts, idx, NU, NV, surf(false), true);
  const mat = skin({ rim: 0.5, translucent: 0.4, iridescent: zombie ? 0.5 : 0.25, rimColor: zombie ? '#7fbf7a' : '#5fa8a0' }, { flap: 1 });
  group.add(new THREE.Mesh(build(verts, idx), mat));
  // Cornes céphaliques et longue queue
  const horn = new THREE.SphereGeometry(1, 10, 8).scale(0.025, 0.02, 0.09);
  for (const s of [-1, 1]) { const h = new THREE.Mesh(horn, new THREE.MeshLambertMaterial({ color: back })); h.position.set(s * 0.075, 0.01, 0.53); h.rotation.y = s * 0.3; group.add(h); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.002, 0.9, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: zombie ? '#8a8a70' : back }));
  tail.position.set(0, 0.01, -0.82);
  group.add(tail);
  eyes(group, 0.1, 0.035, 0.36, zombie ? 0.016 : 0.012, zombie ? '#b8ff9a' : '#0a0c0e');
  return group;
}

/* ------------------------------------------------------------------ Requins */

/** Requin ; zombie = flancs ouverts sur les côtes, yeux allumés, nageoires rongées */
export function createShark(zombie = false) {
  const group = new THREE.Group();
  const back = C(zombie ? '#3c423a' : '#3a4650'), belly = C(zombie ? '#8f8f78' : '#c0c8c8');
  const rot = C('#4a5a34'), bone = C('#d0d8b0'), dark = C('#14100c');
  const verts = [], idx = [];
  // Corps : fuseau le long de Z (nez à +0.5), section un peu plus haute que large
  grid(verts, idx, 22, 20, (ft, fa) => {
    const r = 0.105 * Math.pow(Math.sin(Math.PI * Math.pow(ft, 0.72)), 0.85) * (1 - 0.55 * ft * ft) + 0.003;
    const a = fa * TAU, cx = Math.cos(a), sy = Math.sin(a);
    const z = 0.5 - ft;
    let c = mixC(belly, back, sy * 1.6 + 0.6 + noise(z * 8, a) * 0.15), g = 0;
    if (zombie) {
      c = mixC(c, rot, noise(z * 7, a * 2 + 5) * 0.9);
      // flancs ouverts : cavité sombre barrée de côtes pâles
      const open = ft > 0.3 && ft < 0.62 && Math.abs(sy) < 0.55 && noise(z * 3, cx > 0 ? 1 : 9) > -0.2;
      if (open) { const rib = Math.pow(Math.max(0, Math.sin(z * 90)), 3); c = mixC(dark, bone, rib); g = rib * 0.8; }
    } else if (ft > 0.2 && ft < 0.32 && Math.abs(sy) < 0.5) c = mixC(c, dark, Math.pow(Math.max(0, Math.sin(z * 130)), 4) * 0.7); // fentes branchiales
    return { p: [cx * r * 0.82, sy * r * (zombie ? 1.05 : 1.12), z], c, u: ft, g };
  });
  // Nageoires : lames fines (dorsale, pectorales, caudale en croissant)
  const fin = (pts, u0, u1, ragged = 0) => {
    const b = verts.length, col = mixC(back, rot, zombie ? 0.4 : 0);
    pts.forEach((p, i) => verts.push({ p: i && ragged ? [p[0], p[1] + noise(i * 3.3, ragged) * 0.02, p[2] + Math.abs(noise(i * 2.1, ragged)) * 0.03] : p, c: col, u: i === 0 ? u0 : u1 }));
    for (let i = 1; i < pts.length - 1; i++) idx.push(b, b + i, b + i + 1);
  };
  const rg = zombie ? 5 : 0;
  fin([[0, 0.09, 0.08], [0, 0.26, -0.06], [0, 0.2, -0.1], [0, 0.085, -0.1]], 0.42, 0.55, rg);
  for (const s of [-1, 1]) fin([[s * 0.07, -0.03, 0.2], [s * 0.3, -0.1, 0.02], [s * 0.26, -0.1, -0.02], [s * 0.07, -0.04, 0.08]], 0.3, 0.4, rg && rg + s);
  fin([[0, 0, -0.44], [0, 0.24, -0.62], [0, 0.17, -0.6], [0, 0, -0.5], [0, -0.13, -0.58], [0, -0.16, -0.6]], 0.92, 1.25, rg && 11);
  fin([[0, 0.04, -0.3], [0, 0.09, -0.38], [0, 0.035, -0.37]], 0.8, 0.9);
  group.add(new THREE.Mesh(build(verts, idx), skin({ rim: 0.45, translucent: 0.2, iridescent: zombie ? 0.4 : 0.15, rimColor: zombie ? '#7fbf7a' : '#7fa8b8' }, { swim: true })));
  eyes(group, 0.062, 0.03, 0.38, zombie ? 0.014 : 0.009, zombie ? '#c8ff8a' : '#06080a');
  return group;
}

/* ------------------------------------------------------------------ Tortue */

export function createTurtle() {
  const group = new THREE.Group();
  const shell = C('#2a3530'), plate = C('#55604a'), skinC = C('#3a4a44'), bellyC = C('#9a9a78');
  const verts = [], idx = [];
  // Carapace : dôme à carènes longitudinales (tortue luth), plastron clair
  grid(verts, idx, 20, 24, (ft, fa) => {
    const a = fa * TAU, pol = ft * Math.PI, sr = Math.sin(pol);
    const x = Math.cos(a) * sr, yy = Math.sin(a) * sr, z = Math.cos(pol);
    const top = yy > 0;
    const ridge = top ? Math.pow(Math.abs(Math.cos(Math.atan2(x, yy) * 3.5)), 6) * 0.02 : 0;
    const c = top ? mixC(shell, plate, ridge * 40 + noise(x * 6, z * 6) * 0.35) : bellyC;
    return { p: [x * 0.3, yy * (top ? 0.15 : 0.07) + ridge, z * 0.42 - 0.04], c, u: 0 };
  });
  // Tête, queue
  grid(verts, idx, 8, 12, (ft, fa) => {
    const a = fa * TAU, pol = ft * Math.PI, sr = Math.sin(pol);
    return { p: [Math.cos(a) * sr * 0.07, Math.sin(a) * sr * 0.06, Math.cos(pol) * 0.1 + 0.44], c: mixC(skinC, plate, noise(a * 3, pol * 3) * 0.4), u: 0 };
  });
  // Nageoires : grandes palettes avant qui battent (aU = envergure), petites à l'arrière
  const flipper = (side, z0, len, chord, sweep, anim) => {
    const b = verts.length, n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = side * (0.22 + len * t), w = chord * Math.sin(Math.PI * (0.15 + 0.85 * t)) * (1 - 0.5 * t);
      const zc = z0 - sweep * t * t;
      verts.push({ p: [x, -0.02, zc + w], c: skinC, u: anim ? side * t : 0 }, { p: [x, -0.02, zc - w], c: mixC(skinC, plate, 0.5), u: anim ? side * t : 0 });
    }
    for (let i = 0; i < n; i++) { const a = b + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  for (const s of [-1, 1]) { flipper(s, 0.24, 0.48, 0.09, 0.3, true); flipper(s, -0.32, 0.2, 0.07, 0.16, false); }
  group.add(new THREE.Mesh(build(verts, idx), skin({ rim: 0.35, translucent: 0.15, iridescent: 0.1 }, { flap: 0.8 })));
  eyes(group, 0.055, 0.02, 0.49, 0.01, '#06080a');
  return group;
}

/* ------------------------------------------------------------------ Calmar */

/** Calmar pâle des grands fonds : il nage manteau en avant, tentacules à la traîne, yeux immenses */
export function createSquid() {
  const group = new THREE.Group();
  const flesh = C('#8a3a34'), paleC = C('#c89a90'), spot = C('#ffd0b0');
  const verts = [], idx = [];
  // Manteau (pointe vers +Z) et tête
  grid(verts, idx, 16, 18, (ft, fa) => {
    const a = fa * TAU;
    const r = ft < 0.75 ? 0.02 + 0.085 * Math.pow(ft / 0.75, 0.7) : 0.105 - 0.03 * Math.sin(((ft - 0.75) / 0.25) * Math.PI * 0.5);
    const z = 0.5 - ft * 0.62;
    const dots = Math.pow(Math.max(0, noise(z * 40, a * 6)), 4);
    return { p: [Math.cos(a) * r, Math.sin(a) * r, z], c: mixC(mixC(flesh, paleC, noise(z * 5, a) * 0.5 + 0.3), spot, dots), u: ft * 0.25, g: dots * 0.8 };
  });
  // Nageoires de la pointe du manteau
  for (const s of [-1, 1]) {
    const b = verts.length;
    verts.push({ p: [s * 0.04, 0, 0.46], c: paleC, u: 0 }, { p: [s * 0.2, 0, 0.3], c: paleC, u: 0.1 }, { p: [s * 0.07, 0, 0.12], c: flesh, u: 0.1 });
    idx.push(b, b + 1, b + 2);
  }
  // Huit bras et deux longs tentacules
  for (let k = 0; k < 10; k++) {
    const long = k >= 8, a0 = (k / 8) * TAU + (long ? 0.4 : 0), len = long ? 0.95 : 0.5 + 0.1 * Math.sin(k * 2.1);
    grid(verts, idx, 10, 5, (ft, fa) => {
      const a = fa * TAU, r = (long ? 0.012 : 0.022) * (1 - ft * 0.85) + (long && ft > 0.8 ? 0.014 : 0);
      const spread = 0.07 + ft * (long ? 0.05 : 0.1);
      return { p: [Math.cos(a0) * spread + Math.cos(a) * r, Math.sin(a0) * spread + Math.sin(a) * r, -0.12 - ft * len], c: mixC(flesh, paleC, ft), u: 0.3 + ft * 0.9, g: long && ft > 0.8 ? 0.6 : 0 };
    });
  }
  group.add(new THREE.Mesh(build(verts, idx), skin({ rim: 0.7, translucent: 0.7, iridescent: 0.5, rimColor: '#ffb0a0' }, { swim: true })));
  eyes(group, 0.1, 0, -0.08, 0.035, '#ffe8a0');
  return group;
}

export const WILDLIFE_MODELS = {
  raie: () => createRay(false),
  raieZombie: () => createRay(true),
  requin: () => createShark(false),
  requinZombie: () => createShark(true),
  tortue: createTurtle,
  calmar: createSquid,
};
