import * as THREE from 'three';
import { RADIATION, GUARDIAN } from '../config/settings.js';
import { getFloorHeight } from './seabed.js';
import { applySkin } from './detail.js';

/**
 * Le gardien : un ver colossal, sans yeux, épais comme une maison et long comme un train,
 * cuirassé d'anneaux, qui tourne sans fin autour de la déchirure. Rien n'approche du portail sans passer sous ses anneaux.
 *  - elle patrouille en cercle tant que le sous-marin est loin ;
 *  - dans son domaine, elle ne se jette que sur un cœur qui s'emballe (voir PULSE) : pour passer,
 *    il faut avancer lentement, calme, pendant qu'elle tourne tout près ;
 *  - son corps est solide : on s'y cogne, et il abîme la coque ;
 *  - l'impulsion de défense la fait lâcher prise quelques secondes, pas plus.
 * Réglages : GUARDIAN dans config/settings.js.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Tronçon du corps (rayon 1, long de 1, le long de Z) : trois anneaux de cuir épais qui se
 * chevauchent comme des écailles de cuirasse, sillons profonds entre eux, pores qui luisent.
 */
function segmentGeometry() {
  const NA = 40, NT = 18, pos = [], col = [], glow = [], idx = [];
  const hide = new THREE.Color('#2a2622'), ridge = new THREE.Color('#57493a'), groove = new THREE.Color('#1c1814'), pore = new THREE.Color('#9be8a8'), c = new THREE.Color();
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, ring = (t * 3) % 1; // trois anneaux par tronçon
    // profil en dents de scie : chaque anneau monte doucement puis retombe à pic sous le suivant
    const lift = Math.pow(ring, 0.6) * 0.16 - 0.06;
    for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const wart = Math.sin(a * 9 + Math.floor(t * 3) * 2.1) * Math.sin(ring * Math.PI) * 0.035;
      const r = 1 + lift + wart;
      pos.push(ca * r, sa * r, t - 0.5);
      const g = Math.pow(Math.max(0, Math.sin(a * 7 + Math.floor(t * 3) * 1.3)), 24) * (ring > 0.25 && ring < 0.6 ? 1 : 0);
      c.copy(groove).lerp(hide, Math.min(1, ring * 3)).lerp(ridge, Math.pow(ring, 3) * 0.9).lerp(pore, g);
      col.push(c.r, c.g, c.b);
      glow.push(g * 1.5);
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

/**
 * La tête (rayon ≈ 1, regarde vers +Z) : pas d'yeux, pas de mâchoire — une gueule ronde,
 * fermée par quatre lèvres épaisses qui s'ouvrent comme une fleur, et derrière elles un puits
 * tapissé de rangs de crocs en cristal, jusqu'à une lueur verte tout au fond.
 */
function createHead() {
  const head = new THREE.Group();
  const hide = applySkin(new THREE.MeshLambertMaterial({ color: '#2e2924', side: THREE.DoubleSide }), { rim: 0.5, translucent: 0.15, iridescent: 0.2, rimColor: '#7fbf7a' });
  const gum = new THREE.MeshLambertMaterial({ color: '#3a1216', side: THREE.DoubleSide });
  const tooth = new THREE.MeshLambertMaterial({ color: '#b0ac90', emissive: '#10160e' });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // Col : le corps s'évase jusqu'au bord de la gueule
  const outer = [[1.0, -1.4], [1.03, -0.6], [1.1, 0.2], [1.22, 0.8], [1.2, 1.0]].map(([r, z]) => new THREE.Vector2(r, z));
  add(head, new THREE.LatheGeometry(outer, 48).rotateX(Math.PI / 2), hide);
  // Puits : la gorge qui s'enfonce, rouge sombre
  const inner = [[1.2, 1.0], [1.02, 0.85], [0.84, 0.45], [0.62, -0.1], [0.4, -0.8], [0.22, -1.4]].map(([r, z]) => new THREE.Vector2(r, z));
  add(head, new THREE.LatheGeometry(inner, 48).rotateX(Math.PI / 2), gum);
  // Rangs de crocs : de grands crocs courbes au bord, puis des aiguilles de plus en plus serrées
  const fang = new THREE.ConeGeometry(0.05, 0.42, 7).translate(0, 0.21, 0);
  for (let k = 0; k < 6; k++) {
    const z = 0.82 - k * 0.3, r = 0.98 - k * 0.135, n = 34 - k * 3, len = 1.15 - k * 0.13;
    for (let i = 0; i < n; i++) {
      const a = ((i + (k % 2) * 0.5) / n) * TAU, t = add(head, fang, tooth, Math.cos(a) * r, Math.sin(a) * r, z);
      // pointe vers l'axe, couchée vers le fond de la gorge
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), -Math.sin(a), -0.75).normalize());
      t.scale.set(1 + (i % 3 === 0 ? 0.5 : 0), len * (i % 3 === 0 ? 1.35 : 1), 1 + (i % 3 === 0 ? 0.5 : 0));
    }
  }
  // Lueur au fond de la gorge
  add(head, new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: '#7fe89a' }), 0, 0, -1.1);
  const light = new THREE.PointLight('#8fe0a0', 30, 60, 1.3);
  light.position.set(0, 0, 0.6);
  head.add(light);
  // Quatre lèvres : des pans de coupole articulés sur le bord, qui se rejoignent en pointe
  const lips = [];
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * TAU, am = a0 + TAU / 8;
    const geo = new THREE.SphereGeometry(1.24, 14, 12, a0 + 0.02, TAU / 4 - 0.04, 0.02, Math.PI / 2 - 0.02).rotateX(Math.PI / 2);
    // bord épaissi et crénelé
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, y); p.setZ(i, z * 1.35 + Math.sin(Math.atan2(y, x) * 20) * 0.02 * rr); }
    geo.computeVertexNormals();
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(am) * 1.2, Math.sin(am) * 1.2, 0.98);
    geo.translate(-pivot.position.x, -pivot.position.y, 0);
    add(pivot, geo, hide);
    // deux crocs en crochet au bout de chaque lèvre
    for (const s of [-0.25, 0.25]) {
      const h = add(pivot, fang, tooth, -Math.cos(am + s) * 0.95, -Math.sin(am + s) * 0.95, 1.55);
      h.rotation.x = Math.PI; h.scale.setScalar(1.6);
    }
    head.add(pivot);
    lips.push({ pivot, axis: new THREE.Vector3(-Math.sin(am), Math.cos(am), 0) });
  }
  /** Ouverture de la gueule : 0 = lèvres jointes, 1 = grande ouverte */
  const setOpen = (v) => { for (const l of lips) l.pivot.quaternion.setFromAxisAngle(l.axis, -v * 1.75); };
  setOpen(0.1);
  return { head, light, setOpen };
}

/** Maquette pour la planche de présentation : la tête et le début du corps, gueule entrouverte */
export function createGuardianPreview(open = 0.75) {
  const g = new THREE.Group();
  const { head, setOpen } = createHead();
  setOpen(open);
  g.add(head);
  const mat = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true }), { rim: 0.35, translucent: 0.1, iridescent: 0.15, rimColor: '#7fbf7a' });
  const geo = segmentGeometry();
  for (let k = 0; k < 9; k++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.sin(k * 0.25) * 0.5 * k * 0.3, -k * k * 0.03, -1.9 - k * 1.2);
    m.scale.set(1 - k * 0.02, 1 - k * 0.02, 1.25);
    m.rotation.y = Math.cos(k * 0.25) * 0.12;
    g.add(m);
  }
  return g;
}

/**
 * Corps du ver : UN SEUL tube continu, recalculé à chaque image le long de l'échine (courbe lisse
 * passant par les tronçons). Aucun joint : il peut se tordre autant qu'il veut sans s'ouvrir.
 * Les anneaux de cuirasse sont modelés dans le rayon ; couleurs et lueurs sont fixées une fois.
 */
const TUBE_ROWS = 10, TUBE_NA = 30; // rangs par tronçon, points par anneau
function createBodyTube(segments) {
  const rows = segments * TUBE_ROWS + 1, W = TUBE_NA + 1, n = rows * W;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glow = new Float32Array(n), idx = [];
  const hide = new THREE.Color('#2a2622'), ridge = new THREE.Color('#57493a'), groove = new THREE.Color('#1c1814'), pore = new THREE.Color('#9be8a8'), c = new THREE.Color();
  const lift = new Float32Array(n); // relief de cuirasse, ajouté au rayon
  for (let i = 0; i < rows; i++) {
    const u = i / TUBE_ROWS, ring = (u * 3) % 1, band = Math.floor(u * 3);
    for (let j = 0; j < W; j++) {
      const a = (j / TUBE_NA) * TAU, k = i * W + j;
      lift[k] = Math.pow(ring, 0.6) * 0.16 - 0.06 + Math.sin(a * 9 + band * 2.1) * Math.sin(ring * Math.PI) * 0.035;
      const g = Math.pow(Math.max(0, Math.sin(a * 7 + band * 1.3)), 24) * (ring > 0.25 && ring < 0.6 ? 1 : 0);
      c.copy(groove).lerp(hide, Math.min(1, ring * 3)).lerp(ridge, Math.pow(ring, 3) * 0.9).lerp(pore, g);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      glow[k] = g * 1.5;
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < TUBE_NA; j++) {
    const a = i * W + j, b = a + W;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setIndex(idx);
  geo.userData.dynamic = true; // le moteur WebGPU réécrit son tampon au lieu de le recréer
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return { geo, lift, rows, W };
}
const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
const crom = (a, b, c2, d, f) => 0.5 * (2 * b + (c2 - a) * f + (2 * a - 5 * b + 4 * c2 - d) * f * f + (3 * b - a - 3 * c2 + d) * f * f * f);

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
    const { head, light, setOpen } = createHead();
    Object.assign(this, { head, light, setOpen });
    this.open = 0.1;
    head.scale.setScalar(G.RADIUS);
    this.group.add(head);
    const mat = applySkin(new THREE.MeshLambertMaterial({ vertexColors: true }), { rim: 0.35, translucent: 0.1, iridescent: 0.15, rimColor: '#7fbf7a' });
    this.tube = createBodyTube(G.SEGMENTS);
    this.body = new THREE.Mesh(this.tube.geo, mat);
    this.body.frustumCulled = false;
    this.spine = Array.from({ length: G.SEGMENTS + 1 }, () => new THREE.Vector3());
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
    this.provoked = false; // posé par la plongée : le pouls dépasse le seuil
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

  /** Recalcule le tube du corps le long de l'échine (tête puis tronçons), sans torsion */
  updateTube(time) {
    const G = GUARDIAN, { geo, lift, rows, W } = this.tube, S = this.spine, N = G.SEGMENTS;
    // l'échine part de l'arrière de la tête
    _t.set(0, 0, 1).applyQuaternion(this.head.quaternion);
    S[0].copy(this.pos).addScaledVector(_t, -G.RADIUS * 1.25);
    for (let k = 0; k < N; k++) S[k + 1].copy(this.segs[k]);
    const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
    _n.set(0, 1, 0);
    for (let i = 0; i < rows; i++) {
      const u = Math.min(N - 1e-4, (i / (rows - 1)) * N), k = Math.floor(u), fr = u - k;
      const a = S[Math.max(0, k - 1)], b = S[k], c = S[k + 1], d = S[Math.min(N, k + 2)];
      _p.set(crom(a.x, b.x, c.x, d.x, fr), crom(a.y, b.y, c.y, d.y, fr), crom(a.z, b.z, c.z, d.z, fr));
      const e = 0.02;
      _t.set(crom(a.x, b.x, c.x, d.x, fr + e), crom(a.y, b.y, c.y, d.y, fr + e), crom(a.z, b.z, c.z, d.z, fr + e)).sub(_p).normalize();
      // repère transporté le long de la courbe : il ne vrille pas
      _n.addScaledVector(_t, -_n.dot(_t));
      if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x);
      _n.normalize();
      _b.crossVectors(_t, _n);
      const t = i / (rows - 1), R = G.RADIUS * (1 - 0.72 * Math.pow(t, 2.2)) * (1 + 0.03 * Math.sin(u * 1.7 - time * 2));
      for (let j = 0; j < W; j++) {
        const an = (j / TUBE_NA) * TAU, cs = Math.cos(an), sn = Math.sin(an), o = (i * W + j) * 3;
        const nx = _n.x * cs + _b.x * sn, ny = _n.y * cs + _b.y * sn, nz = _n.z * cs + _b.z * sn, r = R * (1 + lift[i * W + j]);
        pos[o] = _p.x + nx * r; pos[o + 1] = _p.y + ny * r; pos[o + 2] = _p.z + nz * r;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
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
      // il lâche si le cœur se calme
      if (this.timer <= 0 || dPortal > G.DOMAIN * 1.3 || (!this.provoked && this.timer < G.LUNGE_TIME - 1.5)) { this.state = 'patrol'; this.timer = G.REST; }
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
        else if (this.timer <= 0 && this.provoked) { this.state = 'lunge'; this.timer = G.LUNGE_TIME; this.events.roar?.(); }
        else if (!this.provoked) {
          // Cœur calme : il ne voit pas de proie. Il vient tourner tout près, lentement, et laisse passer.
          this.angle = Math.atan2(this.pos.z - sub.position.z, this.pos.x - sub.position.x) + 0.3;
          desired.set(sub.position.x + Math.cos(this.angle) * 34, sub.position.y + 6 + Math.sin(time * 0.3) * 8, sub.position.z + Math.sin(this.angle) * 34).sub(this.pos).normalize();
          speed = G.SPEED * 0.8;
        }
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
    for (let k = 0; k < G.SEGMENTS; k++) {
      // position glissante entre deux points du chemin, plus une ondulation lente
      const seg = this.segs[k];
      seg.lerpVectors(this.trail[k], this.trail[k + 1], 1 - f);
      seg.y += Math.sin(time * 1.1 - k * 0.4) * 2.2 * (k / (G.SEGMENTS - 1));
    }
    this.updateTube(time);

    // Tête : dans le sens de la nage ; la gueule s'ouvre en grand pendant l'attaque
    this.head.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) this.head.quaternion.slerp(_q.setFromUnitVectors(Z, _d.copy(this.vel).normalize()), Math.min(1, dt * 5));
    // La gueule : entrouverte, elle respire ; elle s'ouvre en fleur à mesure que la proie approche
    const want = this.state === 'lunge' ? Math.min(1, 0.45 + 40 / Math.max(dist, 10)) : 0.1 + Math.max(0, Math.sin(time * 0.5)) * 0.14;
    this.open += (want - this.open) * Math.min(1, dt * 4);
    this.setOpen(this.open);
    this.light.intensity = (this.state === 'lunge' ? 70 : 28) * (0.85 + 0.15 * Math.sin(time * 9));

    if (this.calm || quiet) return 0;
    // Morsure
    let damage = 0;
    if (this.state === 'lunge' && dist < G.RADIUS * 1.25 + 2) {
      damage = G.BITE;
      this.state = 'patrol';
      this.timer = G.REST;
      this.events.bite?.(_v.subVectors(sub.position, this.pos).normalize());
    }
    // Corps solide : le sous-marin est repoussé hors des anneaux, et y laisse de la tôle
    for (let k = 0; k < G.SEGMENTS; k++) {
      const seg = this.segs[k], r = G.RADIUS * (1 - 0.7 * Math.pow(k / (G.SEGMENTS - 1), 2.2)) + 1.4;
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
