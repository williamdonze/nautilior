import * as THREE from 'three';
import { RADIATION, GUARDIAN } from '../config/settings.js';
import { getFloorHeight } from './seabed.js';
import { applySkin } from './detail.js';

/**
 * Le gardien : une bête colossale, longue comme un train, qui tourne sans fin autour de la
 * déchirure. Rien n'approche du portail sans passer sous ses anneaux.
 *  - elle patrouille en cercle tant que le sous-marin est loin ;
 *  - dès qu'il entre dans son domaine, elle se jette sur lui, gueule ouverte, encore et encore ;
 *  - son corps est solide : on s'y cogne, et il abîme la coque ;
 *  - l'impulsion de défense la fait lâcher prise quelques secondes, pas plus.
 * Réglages : GUARDIAN dans config/settings.js.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Tronçon du corps (rayon 1, long de 1, le long de Z) : anneau côtelé, crête dorsale, taches lumineuses */
function segmentGeometry() {
  const NA = 28, NT = 6, pos = [], col = [], glow = [], idx = [];
  const back = new THREE.Color('#141c1a'), belly = new THREE.Color('#4a5246'), spot = new THREE.Color('#8fe0a0'), c = new THREE.Color();
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, bulge = 1 + 0.07 * Math.sin(t * Math.PI);
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      // crête dorsale en dents de scie, flancs aplatis
      const crest = Math.pow(Math.max(0, sa), 12) * 0.5 * (0.5 + Math.abs(Math.sin(t * Math.PI)));
      pos.push(ca * bulge * 0.92, sa * bulge * (1 + crest), t - 0.5);
      const g = Math.pow(Math.max(0, Math.cos(a * 2) * Math.sin(t * Math.PI)), 10) * (Math.abs(sa) < 0.5 ? 1 : 0);
      c.copy(belly).lerp(back, Math.min(1, sa * 1.4 + 0.75)).lerp(spot, g);
      col.push(c.r, c.g, c.b);
      glow.push(g * 1.6);
    }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NA; j++) {
    const a = i * (NA + 1) + j, b = a + NA + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** La tête (rayon ≈ 1, regarde vers +Z) : crâne, mâchoire articulée, crocs, grappes d'yeux */
function createHead() {
  const head = new THREE.Group();
  const skin = applySkin(new THREE.MeshLambertMaterial({ color: '#1a2320' }), { rim: 0.6, translucent: 0.2, iridescent: 0.3, rimColor: '#7fbf7a' });
  const gum = new THREE.MeshLambertMaterial({ color: '#3a1418' });
  const tooth = new THREE.MeshLambertMaterial({ color: '#c8d0b0', emissive: '#30402a' });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#c8ffb0' });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // Crâne et mâchoire supérieure
  add(head, new THREE.SphereGeometry(1, 36, 22).scale(1.05, 0.85, 1.25), skin, 0, 0.1, -0.2);
  const upper = new THREE.Group();
  head.add(upper);
  add(upper, new THREE.SphereGeometry(1, 32, 16, 0, TAU, 0, Math.PI / 2).scale(0.95, 0.5, 1.9), skin, 0, 0.12, 0.6);
  add(upper, new THREE.CircleGeometry(1, 32).rotateX(Math.PI / 2).scale(0.9, 1, 1.8), gum, 0, 0.11, 0.6);
  // Mâchoire inférieure, articulée à l'arrière
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.05, -0.1);
  head.add(jaw);
  add(jaw, new THREE.SphereGeometry(1, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2).scale(0.88, 0.42, 1.75), skin, 0, 0, 0.7);
  add(jaw, new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2).scale(0.84, 1, 1.66), gum, 0, 0.01, 0.7);
  // Crocs : deux rangées par mâchoire, de tailles inégales
  const fang = new THREE.ConeGeometry(0.055, 0.42, 8);
  for (let i = 0; i < 30; i++) {
    const a = (i / 29 - 0.5) * 2.5, big = i % 4 === 0 ? 1.7 : 1;
    const x = Math.sin(a) * 0.84, z = 0.6 + Math.cos(a) * 1.72;
    const up = add(upper, fang, tooth, x, 0.11 - 0.2 * big, z); up.rotation.x = Math.PI; up.scale.setScalar(big);
    const lo = add(jaw, fang, tooth, x * 0.94, 0.2 * big, 0.7 + Math.cos(a) * 1.58); lo.scale.setScalar(big * 0.9);
  }
  // Yeux : des grappes le long du crâne, de plus en plus petits
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    add(head, new THREE.SphereGeometry(0.11 - i * 0.012, 12, 8), eyeMat, s * (0.72 + i * 0.05), 0.5 - i * 0.03, 0.75 - i * 0.3);
  }
  // Barbillons
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const b = add(jaw, new THREE.CylinderGeometry(0.02, 0.004, 1.6, 6), skin, s * (0.3 + i * 0.22), -0.75, 0.9 - i * 0.4);
    b.rotation.z = s * 0.25;
  }
  const light = new THREE.PointLight('#8fe0a0', 30, 45, 1.3);
  light.position.set(0, 0.3, 2.2);
  head.add(light);
  return { head, jaw, upper, light };
}

export class Guardian {
  /** @param {object} events roar(), bite(direction), bump(direction) */
  constructor(scene, events = {}) {
    this.scene = scene;
    this.events = events;
    const G = GUARDIAN;
    const S = RADIATION.SOURCE;
    this.center = new THREE.Vector3(S.x, getFloorHeight(S.x, S.z) + 30, S.z);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const { head, jaw, upper, light } = createHead();
    Object.assign(this, { head, jaw, upper, light });
    head.scale.setScalar(G.RADIUS * 1.15);
    this.group.add(head);
    const mat = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true }), { rim: 0.5, translucent: 0.2, iridescent: 0.35, rimColor: '#7fbf7a' });
    this.body = new THREE.InstancedMesh(segmentGeometry(), mat, G.SEGMENTS);
    this.body.frustumCulled = false;
    this.group.add(this.body);
    this.group.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    this.spacing = G.RADIUS * 1.25;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.trail = []; // positions passées de la tête, espacées de `spacing`
    this.segs = Array.from({ length: G.SEGMENTS }, () => new THREE.Vector3());
    this.reset();
  }

  /** Nouvelle plongée : elle reprend sa ronde */
  reset() {
    const G = GUARDIAN;
    this.state = 'patrol';
    this.timer = G.REST;
    this.angle = Math.random() * TAU;
    this.calm = false;
    this.awake = false;
    this.hitCooldown = 0;
    this.pos.set(this.center.x + Math.cos(this.angle) * G.ORBIT, this.center.y, this.center.z + Math.sin(this.angle) * G.ORBIT);
    this.trail.length = 0;
    // corps déjà déroulé le long du cercle
    for (let k = 0; k < G.SEGMENTS + 2; k++) {
      const a = this.angle - (k * this.spacing) / G.ORBIT;
      this.trail.push(new THREE.Vector3(this.center.x + Math.cos(a) * G.ORBIT, this.center.y, this.center.z + Math.sin(a) * G.ORBIT));
    }
    this.vel.set(-Math.sin(this.angle), 0, Math.cos(this.angle)).multiplyScalar(G.SPEED);
    this.group.visible = false;
  }

  /** Impulsion de défense : elle lâche prise un instant */
  scare(time) {
    if (!this.group.visible) return;
    this.state = 'recoil';
    this.timer = time;
  }

  /** 1 quand elle se jette sur le sous-marin (musique, alarmes) */
  get threat() {
    return this.group.visible && this.state === 'lunge' ? 2 : 0;
  }

  /** Points de contact pour le sonar */
  contacts(out) {
    if (!this.group.visible) return;
    out.push({ id: 'guardian', kind: 'creature', x: this.pos.x, y: this.pos.y, z: this.pos.z, size: GUARDIAN.RADIUS * 3 });
    for (let k = 3; k < this.segs.length; k += 4) out.push({ id: `guardian${k}`, kind: 'creature', x: this.segs[k].x, y: this.segs[k].y, z: this.segs[k].z, size: GUARDIAN.RADIUS * 2 });
  }

  /** @returns {number} dégâts subis par le sous-marin */
  update(dt, time, sub, quiet) {
    const G = GUARDIAN;
    const dPortal = Math.hypot(sub.position.x - this.center.x, sub.position.z - this.center.z);
    // Elle n'existe que lorsque le sous-marin est descendu dans les abysses
    const near = dPortal < G.VISIBLE;
    if (near !== this.group.visible) {
      this.group.visible = near;
      if (near && !this.awake) this.reset(), (this.group.visible = true);
    }
    if (!near) return 0;
    this.timer -= dt;
    this.hitCooldown -= dt;
    const toSub = _v.subVectors(sub.position, this.pos), dist = toSub.length();
    let speed = G.SPEED, agility = 0.9;
    const desired = _d;

    if (this.calm || quiet) this.state = 'patrol';
    if (this.state === 'lunge') {
      // Droit sur la coque, en visant où elle sera
      const lead = Math.min(1.5, dist / G.LUNGE_SPEED);
      desired.copy(sub.velocity).multiplyScalar(lead).add(sub.position).sub(this.pos).normalize();
      speed = G.LUNGE_SPEED; agility = 2.6;
      if (this.timer <= 0 || dPortal > G.DOMAIN * 1.3) { this.state = 'patrol'; this.timer = G.REST; }
    } else if (this.state === 'recoil') {
      desired.copy(toSub).normalize().negate();
      desired.y += 0.4;
      speed = G.LUNGE_SPEED * 0.7; agility = 2;
      if (this.timer <= 0) { this.state = 'patrol'; this.timer = G.REST * 0.6; }
    } else {
      // Ronde : un grand cercle autour de la déchirure, qui ondule en hauteur
      this.angle = Math.atan2(this.pos.z - this.center.z, this.pos.x - this.center.x) + 0.25;
      const y = this.center.y + Math.sin(time * 0.21) * 16;
      desired.set(this.center.x + Math.cos(this.angle) * G.ORBIT, y, this.center.z + Math.sin(this.angle) * G.ORBIT).sub(this.pos).normalize();
      if (!this.calm && !quiet && dPortal < G.DOMAIN) {
        if (!this.awake) { this.awake = true; this.timer = 2.5; this.events.roar?.(); }
        else if (this.timer <= 0) { this.state = 'lunge'; this.timer = G.LUNGE_TIME; this.events.roar?.(); }
      }
    }
    this.vel.lerp(desired.multiplyScalar(speed), Math.min(1, dt * agility));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.max(getFloorHeight(this.pos.x, this.pos.z) + G.RADIUS * 1.2, Math.min(-30, this.pos.y));

    // Le corps suit le chemin de la tête
    if (this.pos.distanceTo(this.trail[0]) > this.spacing) {
      const p = this.trail.pop();
      this.trail.unshift(p.copy(this.pos));
    }
    const f = Math.min(1, this.pos.distanceTo(this.trail[0]) / this.spacing);
    let prev = this.pos;
    for (let k = 0; k < G.SEGMENTS; k++) {
      // position glissante entre deux points du chemin, plus une ondulation latérale
      const a = this.trail[k], b = this.trail[k + 1], seg = this.segs[k];
      seg.lerpVectors(a, b, 1 - f);
      const t = k / (G.SEGMENTS - 1), r = G.RADIUS * (1 - 0.82 * Math.pow(t, 1.6)) * (0.92 + 0.08 * Math.sin(k * 1.7));
      seg.y += Math.sin(time * 1.4 - k * 0.55) * 1.6 * t;
      _d.subVectors(prev, seg);
      const len = _d.length() || 1;
      _q.setFromUnitVectors(Z, _d.divideScalar(len));
      this.body.setMatrixAt(k, _m.compose(seg, _q, _s.set(r, r, len * 1.08)));
      prev = seg;
    }
    this.body.instanceMatrix.needsUpdate = true;

    // Tête : dans le sens de la nage ; la gueule s'ouvre en grand pendant l'attaque
    this.head.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) this.head.quaternion.slerp(_q.setFromUnitVectors(Z, _d.copy(this.vel).normalize()), Math.min(1, dt * 5));
    const open = this.state === 'lunge' ? 0.75 : 0.12 + Math.sin(time * 0.7) * 0.06;
    this.jaw.rotation.x += (open - this.jaw.rotation.x) * Math.min(1, dt * 5);
    this.upper.rotation.x += (-open * 0.35 - this.upper.rotation.x) * Math.min(1, dt * 5);
    this.light.intensity = (this.state === 'lunge' ? 70 : 28) * (0.85 + 0.15 * Math.sin(time * 9));

    if (this.calm || quiet) return 0;
    // Morsure
    let damage = 0;
    if (this.state === 'lunge' && dist < G.RADIUS * 1.5 + 2) {
      damage = G.BITE;
      this.state = 'patrol';
      this.timer = G.REST;
      this.events.bite?.(_v.subVectors(sub.position, this.pos).normalize());
    }
    // Corps solide : le sous-marin est repoussé hors des anneaux, et y laisse de la tôle
    for (let k = 0; k < G.SEGMENTS; k++) {
      const seg = this.segs[k], r = G.RADIUS * (1 - 0.82 * Math.pow(k / (G.SEGMENTS - 1), 1.6)) + 1.4;
      const dx = sub.position.x - seg.x, dy = sub.position.y - seg.y, dz = sub.position.z - seg.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r && d2 > 1e-4) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
        sub.position.set(seg.x + nx * r, seg.y + ny * r, seg.z + nz * r);
        const vn = sub.velocity.x * nx + sub.velocity.y * ny + sub.velocity.z * nz;
        if (vn < 0) sub.velocity.addScaledVector(_v.set(nx, ny, nz), -vn * 1.4);
        if (this.hitCooldown <= 0) {
          this.hitCooldown = 1.5;
          damage += G.BODY;
          this.events.bump?.(_v.set(nx, ny, nz));
        }
        break;
      }
    }
    return damage;
  }
}
