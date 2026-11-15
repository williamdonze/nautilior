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

/** Rayon du corps le long du dos (u : 0 = museau, 1 = base de la queue) */
const radius = (u) => 3.6 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 0.6) * (1 - 0.3 * u) + 0.18;

export function createWhaleModel() {
  const root = new THREE.Group(), L = WHALE.LENGTH;
  // Corps : section ovale, ventre plat et strié, dos sombre, flancs marqués de vieilles cicatrices pâles
  const pos = new Float32Array((NZ + 1) * (NA + 1) * 3), col = new Float32Array(pos.length), idx = [];
  const base = new Float32Array(pos.length), c = new THREE.Color(), back = new THREE.Color('#39464c'), belly = new THREE.Color('#c9cfc4'), scar = new THREE.Color('#aebab2');
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i <= NZ; i++) {
    const u = i / NZ, r = radius(u), z = (0.5 - u) * L;
    for (let k = 0; k <= NA; k++) {
      const a = (k / NA) * TAU, ca = Math.cos(a), sa = Math.sin(a), o = (i * (NA + 1) + k) * 3;
      // tête large et plate dessus, gorge gonflée dessous
      const ry = r * (sa > 0 ? 0.82 : 1 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 2.4))), rx = r * (1.05 - 0.25 * u);
      base[o] = ca * rx; base[o + 1] = sa * ry; base[o + 2] = z;
      const t = THREE.MathUtils.smoothstep(sa, -0.45, 0.25);
      c.copy(belly).lerp(back, t);
      // sillons de la gorge
      if (sa < -0.2 && u < 0.5) c.multiplyScalar(0.72 + 0.28 * Math.pow(Math.abs(Math.sin(ca * 22)), 0.5));
      if (hash(Math.floor(u * 30), Math.floor(k / 2)) > 0.93 && t > 0.5) c.lerp(scar, 0.5);
      c.multiplyScalar(0.85 + 0.3 * hash(i, k));
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
  const mat = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true }), { rim: 0.5, translucent: 0.15, iridescent: 0.12 });
  const body = new THREE.Mesh(geo, mat);
  body.frustumCulled = false;
  body.raycast = () => {};
  root.add(body);

  // Nageoires : deux longues pectorales, la caudale en croissant, un petit aileron
  const finMat = applySkin(new THREE.MeshLambertMaterial({ color: '#5c6b70', side: THREE.DoubleSide }), { rim: 0.6, translucent: 0.3, iridescent: 0.1 });
  const blade = (len, wide, sweep) => {
    const g = new THREE.SphereGeometry(1, 20, 10).scale(len / 2, 0.16 * wide, wide / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (len / 2); p.setZ(i, p.getZ(i) * (1 - 0.55 * Math.max(0, x)) - sweep * x * x * len * 0.25); }
    g.translate(len / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  };
  const pect = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(s * 2.9, -1.6, L * 0.2);
    const m = new THREE.Mesh(blade(11, 3, 1), finMat);
    m.raycast = () => {};
    if (s < 0) m.scale.x = -1;
    f.add(m);
    f.rotation.z = s * -0.5;
    root.add(f);
    pect.push(f);
  }
  const tail = new THREE.Group();
  tail.position.z = -L * 0.5;
  root.add(tail);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(blade(7.5, 4.2, 1.2), finMat); m.raycast = () => {}; if (s < 0) m.scale.x = -1; tail.add(m); }
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 12).scale(0.35, 1, 1.6), finMat);
  dorsal.position.set(0, radius(0.68) * 0.8 + 0.4, (0.5 - 0.68) * L);
  dorsal.rotation.x = -0.5;
  dorsal.raycast = () => {};
  root.add(dorsal);
  // L'œil : petit, sombre, avec un reflet
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshLambertMaterial({ color: '#0c1012' }));
    e.position.set(s * radius(0.16) * 0.98, -0.5, (0.5 - 0.16) * L);
    e.raycast = () => {};
    root.add(e);
  }
  // Des lueurs chaudes le long des flancs, comme les fenêtres d'une maison la nuit
  const lights = [];
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const u = 0.2 + i * 0.09, h = createHalo('#f2d9a0', 2.6);
    h.position.set(s * radius(u) * 1.02, 0.2, (0.5 - u) * L);
    h.material.opacity = 0.4;
    root.add(h);
    lights.push(h);
  }
  const lamp = new THREE.PointLight('#f2d9a0', 14, 60, 1.1);
  lamp.position.set(0, -4, 4);
  root.add(lamp);

  /** Ondulation lente de tout le corps, de la tête à la queue */
  const swim = (t, amount = 1) => {
    for (let i = 0; i <= NZ; i++) {
      const u = i / NZ, w = Math.pow(u, 1.7) * 2.6 * amount, dy = Math.sin(t * 1.1 - u * 3.2) * w;
      for (let k = 0; k <= NA; k++) { const o = (i * (NA + 1) + k) * 3; pos[o + 1] = base[o + 1] + dy; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    tail.position.y = Math.sin(t * 1.1 - 3.2) * 2.6 * amount;
    tail.rotation.x = -Math.cos(t * 1.1 - 3.2) * 0.45 * amount;
    pect.forEach((f, i) => (f.rotation.z = (i ? 1 : -1) * (0.45 + Math.sin(t * 0.55 + i) * 0.22)));
    lights.forEach((h, i) => (h.material.opacity = 0.32 + 0.14 * Math.sin(t * 0.7 + i * 0.9)));
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
