import * as THREE from 'three';
import { WHALE } from '../config/settings.js';
import { getFloorHeight, canyonCenter } from './seabed.js';
import { applySkin } from './detail.js';
import { createHalo } from '../loot/glow.js';

/**
 * La Baleine : une bête immense et paisible qui passe au-dessus du Canyon en chantant.
 * Elle n'attaque jamais. Près d'elle, le pouls se calme. Quand le sous-marin l'approche, elle
 * l'emmène au-dessus d'un souvenir resté au fond, et tourne là un moment, comme on veille.
 * (Dans la chambre : la voix d'Hélène, qui chante tout bas ce qu'elle chantait à ses deux garçons.)
 */
const TAU = Math.PI * 2;
const NZ = 44, NA = 26;

/**
 * Gabarit d'une baleine à bosse, du museau (u = 0) à la naissance de la queue (u = 1) :
 * [u, demi-largeur, hauteur au-dessus de l'axe, hauteur au-dessous] en mètres pour 34 m de long.
 * Grosse tête plate dessus, gorge profonde, dos qui s'arrondit, puis un pédoncule mince et haut.
 */
const SHAPE = [
  [0, 0.45, 0.25, 0.35], [0.025, 1.35, 0.7, 1.3], [0.08, 2.3, 1.2, 2.5], [0.16, 2.95, 1.75, 3.3], [0.26, 3.25, 2.35, 3.65],
  [0.36, 3.2, 2.75, 3.5], [0.46, 2.95, 2.8, 3.0], [0.56, 2.45, 2.55, 2.45], [0.66, 1.85, 2.15, 1.9], [0.76, 1.25, 1.65, 1.4],
  [0.86, 0.72, 1.2, 1.0], [0.94, 0.42, 0.85, 0.7], [1, 0.36, 0.55, 0.5],
];
function shapeAt(u) {
  let k = 0;
  while (k < SHAPE.length - 2 && SHAPE[k + 1][0] < u) k++;
  const a = SHAPE[Math.max(0, k - 1)], b = SHAPE[k], c = SHAPE[k + 1], d = SHAPE[Math.min(SHAPE.length - 1, k + 2)];
  const t = Math.max(0, Math.min(1, (u - b[0]) / (c[0] - b[0])));
  const cr = (i) => 0.5 * (2 * b[i] + (c[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t * t + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * t * t * t);
  return [Math.max(0.05, cr(1)), Math.max(0.05, cr(2)), Math.max(0.05, cr(3))];
}

/** Nageoire plate découpée dans un contour 2D (x = envergure, y = corde), épaisse au milieu, fine aux bords */
function finGeometry(outline, thick) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.9, bevelSize: thick * 1.6, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(-Math.PI / 2); // à plat : l'épaisseur devient verticale
  g.computeVertexNormals();
  return g;
}

export function createWhaleModel() {
  const root = new THREE.Group(), L = WHALE.LENGTH;
  const pos = new Float32Array((NZ + 1) * (NA + 1) * 3), col = new Float32Array(pos.length), idx = [];
  const base = new Float32Array(pos.length), c = new THREE.Color(), back = new THREE.Color('#2b3438'), belly = new THREE.Color('#d6d8cf'), scar = new THREE.Color('#8f9a98'), lipC = new THREE.Color('#12171a');
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i <= NZ; i++) {
    const u = i / NZ, [w, top, bot] = shapeAt(u), z = (0.5 - u) * L;
    for (let k = 0; k <= NA; k++) {
      const a = (k / NA) * TAU, ca = Math.cos(a), sa = Math.sin(a), o = (i * (NA + 1) + k) * 3;
      // section : dos en ogive douce, flancs pleins, ventre large (superellipse)
      const ex = 0.82, sx = Math.sign(ca) * Math.pow(Math.abs(ca), ex), sy = Math.sign(sa) * Math.pow(Math.abs(sa), sa > 0 ? 0.9 : 0.75);
      // sillons de la gorge : de vrais plis, du menton au nombril
      const throat = sa < -0.15 && u < 0.56 ? Math.min(1, (-sa - 0.15) * 3) * Math.min(1, u * 14) * Math.min(1, (0.56 - u) * 8) : 0;
      const groove = throat * (Math.pow(Math.abs(Math.sin(ca * 19)), 0.7) - 0.6) * 0.09;
      base[o] = sx * w * (1 + groove); base[o + 1] = sy * (sa > 0 ? top : bot) * (1 + groove); base[o + 2] = z;
      // robe : dos ardoise presque noir, ventre et gorge blancs, limite ondulée ; ligne de la bouche
      const edge = -0.18 + 0.22 * Math.sin(u * 9) * (1 - u) - (u > 0.6 ? (u - 0.6) * 1.2 : 0);
      const t = THREE.MathUtils.smoothstep(sa, edge - 0.12, edge + 0.12);
      c.copy(belly).lerp(back, t);
      if (throat > 0) c.multiplyScalar(0.62 + 0.38 * Math.pow(Math.abs(Math.sin(ca * 19)), 0.6));
      const mouth = u < 0.3 ? Math.exp(-Math.pow((sa - (-0.02 - 0.5 * Math.pow(u / 0.3, 1.6) + 0.18 * Math.sin(u * 10))) * 16, 2)) * Math.min(1, u * 40) : 0;
      c.lerp(lipC, mouth * 0.85);
      if (hash(Math.floor(u * 34), Math.floor(k / 2)) > 0.94 && t > 0.5) c.lerp(scar, 0.45); // vieilles cicatrices
      if (u < 0.12 && hash(i * 3.1, k * 1.7) > 0.8) c.lerp(belly, 0.35); // balanes sur le menton et le museau
      c.multiplyScalar(0.88 + 0.24 * hash(i, k));
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
  }
  pos.set(base);
  for (let i = 0; i < NZ; i++) for (let k = 0; k < NA; k++) { const a = i * (NA + 1) + k, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.dynamic = true; // le moteur WebGPU réécrit le tampon à chaque image
  const mat = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true }), { rim: 0.45, translucent: 0.1, iridescent: 0.08 });
  const body = new THREE.Mesh(geo, mat);
  body.frustumCulled = false;
  body.raycast = () => {};
  root.add(body);

  const dark = applySkin(new THREE.MeshLambertMaterial({ color: '#2b3438', side: THREE.DoubleSide }), { rim: 0.5, translucent: 0.2, iridescent: 0.08 });
  const pale = applySkin(new THREE.MeshLambertMaterial({ color: '#b9bdb4', side: THREE.DoubleSide }), { rim: 0.5, translucent: 0.25, iridescent: 0.08 });
  const part = (parent, g, m) => { const o = new THREE.Mesh(g, m); o.raycast = () => {}; parent.add(o); return o; };

  // Pectorales : très longues (un tiers du corps), bord d'attaque bosselé, blanches dessous
  const flipper = [[0, -0.9], [1.2, -1.25], [2.6, -1.15], [3.5, -1.4], [4.7, -1.2], [5.6, -1.4], [6.9, -1.1], [7.9, -1.2], [9.2, -0.8], [10.4, -0.55], [11.2, 0.05], [10.2, 0.75], [8, 1.15], [5, 1.3], [2.2, 1.25], [0, 0.9]];
  const pect = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(s * 2.75, -2.3, (0.5 - 0.3) * L);
    const m = part(f, finGeometry(flipper, 0.16), s > 0 ? pale : pale);
    if (s < 0) m.scale.x = -1;
    m.rotation.y = s * -0.55; // balayées vers l'arrière
    f.rotation.z = s * -0.55;
    root.add(f);
    pect.push(f);
  }
  // Caudale : large croissant échancré, à plat (les baleines battent de haut en bas)
  const fluke = [[0, 0.9], [1.4, 1.25], [3.2, 1.15], [5.2, 0.5], [6.6, -0.6], [7.1, -1.5], [6.2, -1.25], [4.6, -0.95], [2.8, -0.9], [1.2, -1.05], [0, -0.55]];
  const tail = new THREE.Group();
  tail.position.z = -L * 0.5 + 0.4;
  root.add(tail);
  for (const s of [-1, 1]) { const m = part(tail, finGeometry(fluke, 0.14), dark); m.rotation.y = Math.PI / 2 * 0; if (s < 0) m.scale.x = -1; m.position.z = -0.9; }
  // Dorsale : une bosse basse et son petit aileron crochu, aux deux tiers du dos
  const dz = (0.5 - 0.66) * L, dTop = shapeAt(0.66)[1];
  const hump = part(root, new THREE.SphereGeometry(1, 20, 12).scale(0.55, 0.45, 2.3), dark);
  hump.position.set(0, dTop - 0.12, dz + 0.6);
  const fin = new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [1.9, 0], [2.3, 0.25], [1.9, 0.95], [1.5, 0.8], [1.0, 0.35]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
  fin.translate(-1, 0, -0.07);
  fin.rotateY(Math.PI / 2);
  const dorsal = part(root, fin, dark);
  dorsal.position.set(0, dTop + 0.1, dz);
  // Tubercules du museau, évents, œil
  for (let i = 0; i < 16; i++) {
    const u = 0.02 + hash(i, 5) * 0.1, a = (hash(i, 9) - 0.5) * 2.2, [w, top] = shapeAt(u);
    const t = part(root, new THREE.SphereGeometry(0.16 + hash(i, 2) * 0.1, 8, 6), dark);
    t.position.set(Math.sin(a) * w * 0.85, Math.cos(a) * top * 0.92, (0.5 - u) * L);
  }
  for (const s of [-1, 1]) {
    const blow = part(root, new THREE.SphereGeometry(0.2, 10, 6).scale(0.7, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: '#0c1012' }));
    blow.position.set(s * 0.22, shapeAt(0.19)[1] * 0.99, (0.5 - 0.19) * L);
    const eyeU = 0.235, [w, , bot] = shapeAt(eyeU);
    const e = part(root, new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshPhongMaterial({ color: '#0a0d0e', shininess: 120 }));
    e.position.set(s * w * 0.965, -bot * 0.3, (0.5 - eyeU) * L);
  }
  // Des lueurs chaudes le long des flancs, comme les fenêtres d'une maison la nuit
  const lights = [];
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const u = 0.26 + i * 0.09, h = createHalo('#f2d9a0', 2.2);
    h.position.set(s * shapeAt(u)[0] * 1.03, 0.3, (0.5 - u) * L);
    h.material.opacity = 0.35;
    root.add(h);
    lights.push(h);
  }
  const lamp = new THREE.PointLight('#f2d9a0', 14, 60, 1.1);
  lamp.position.set(0, -5, 4);
  root.add(lamp);

  /** Nage : la moitié arrière du corps bat lentement de haut en bas, la queue suit avec un temps de retard */
  const swim = (t, amount = 1) => {
    const A = 2.2 * amount, wv = (u) => Math.pow(Math.max(0, u - 0.3) / 0.7, 1.8) * A * Math.sin(t * 1.0 - u * 2.4);
    for (let i = 0; i <= NZ; i++) {
      const dy = wv(i / NZ);
      for (let k = 0; k <= NA; k++) { const o = (i * (NA + 1) + k) * 3; pos[o + 1] = base[o + 1] + dy; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    tail.position.y = wv(1);
    tail.rotation.x = -(wv(1) - wv(0.94)) / (0.06 * L) * 1.6 - Math.cos(t * 1.0 - 2.4) * 0.3 * amount;
    hump.position.y = dTop - 0.12 + wv(0.64);
    dorsal.position.y = dTop + 0.1 + wv(0.66);
    pect.forEach((f, i) => (f.rotation.z = (i ? 1 : -1) * (0.5 + Math.sin(t * 0.5 + i * 0.6) * 0.2)));
    lights.forEach((h, i) => (h.material.opacity = 0.28 + 0.12 * Math.sin(t * 0.7 + i * 0.9)));
  };
  swim(0);
  return { root, swim, lamp };
}

export class Whale {
  constructor(scene) {
    this.model = createWhaleModel();
    this.object = this.model.root;
    this.object.rotation.order = 'YXZ';
    scene.add(this.object);
    this.pos = this.object.position;
    this.target = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this.reset();
  }

  /** Nouvelle plongée : elle repart du haut du Canyon */
  reset() {
    const z = WHALE.Z_START;
    this.pos.set(canyonCenter(z), getFloorHeight(canyonCenter(z), z) + WHALE.HEIGHT, z);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.dir = -1; // elle descend le Canyon, puis le remonte
    this.state = 'cruise';
    this.timer = 0;
    this.songTimer = 6;
    this.near = 0;
    this.goal = null;
  }

  /**
   * @param {THREE.Vector3[]} missing souvenirs encore au fond
   * @returns {number} 0..1 : proximité (le pouls s'apaise)
   */
  update(dt, time, sub, missing, sound) {
    const p = this.pos, dist = p.distanceTo(sub.position);
    this.near = Math.max(0, 1 - dist / WHALE.CALM_RADIUS);
    // --- Où va-t-elle ?
    if (this.state === 'cruise') {
      const z = p.z + this.dir * 30;
      if (z < WHALE.Z_END) this.dir = 1;
      else if (z > WHALE.Z_START) this.dir = -1;
      const tz = p.z + this.dir * 30, tx = canyonCenter(tz) + Math.sin(time * 0.05) * 12;
      this.target.set(tx, getFloorHeight(tx, tz) + WHALE.HEIGHT + Math.sin(time * 0.08) * 8, tz);
      // le sous-marin vient à elle : elle l'emmène vers un souvenir
      if (dist < WHALE.LEAD_RADIUS && missing.length && this.timer <= 0) {
        let best = null, bd = WHALE.LEAD_RANGE;
        for (const m of missing) { const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; best = m; } }
        if (best) { this.goal = best.clone(); this.state = 'lead'; sound?.whaleSong?.(1); this.songTimer = 12; }
      }
      this.timer -= dt;
    } else if (this.state === 'lead') {
      this.target.set(this.goal.x, this.goal.y + WHALE.WATCH_HEIGHT, this.goal.z);
      // elle attend qu'on la suive
      this.slow = dist > 70;
      if (Math.hypot(p.x - this.goal.x, p.z - this.goal.z) < 30) { this.state = 'watch'; this.timer = WHALE.WATCH_TIME; this.angle = Math.atan2(p.x - this.goal.x, p.z - this.goal.z); }
      // le souvenir a été remonté entre-temps
      if (!missing.some((m) => m.distanceToSquared(this.goal) < 4)) { this.state = 'cruise'; this.timer = 20; }
    } else {
      // elle tourne au-dessus, lentement
      this.angle += (dt * WHALE.SPEED * 0.6) / 28;
      this.target.set(this.goal.x + Math.sin(this.angle + 0.5) * 28, this.goal.y + WHALE.WATCH_HEIGHT, this.goal.z + Math.cos(this.angle + 0.5) * 28);
      this.timer -= dt;
      if (this.timer <= 0 || !missing.some((m) => m.distanceToSquared(this.goal) < 4)) { this.state = 'cruise'; this.timer = 40; }
    }
    // --- Elle vire large : c'est une très grosse bête
    const to = this._v.subVectors(this.target, p), wantYaw = Math.atan2(to.x, to.z), wantPitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
    const dy = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw)), turn = Math.max(-WHALE.TURN * dt, Math.min(WHALE.TURN * dt, dy));
    this.yaw += turn;
    this.pitch += (Math.max(-0.35, Math.min(0.35, wantPitch)) - this.pitch) * Math.min(1, dt * 0.4);
    const speed = WHALE.SPEED * (this.state === 'watch' ? 0.6 : this.slow && this.state === 'lead' ? 0.35 : 1);
    p.x += Math.sin(this.yaw) * Math.cos(this.pitch) * speed * dt;
    p.z += Math.cos(this.yaw) * Math.cos(this.pitch) * speed * dt;
    p.y += Math.sin(this.pitch) * speed * dt;
    p.y = Math.max(p.y, getFloorHeight(p.x, p.z) + 14);
    this.object.rotation.set(-this.pitch, this.yaw, -(turn / Math.max(dt, 1e-4)) * 1.2);
    this.model.swim(time, speed / WHALE.SPEED);
    // --- Le chant : on l'entend de très loin
    this.songTimer -= dt;
    if (this.songTimer <= 0) {
      this.songTimer = 13 + Math.random() * 10;
      const v = Math.max(0, 1 - dist / WHALE.SONG_RADIUS);
      if (v > 0.02) sound?.whaleSong?.(v);
    }
    return this.near;
  }
}
