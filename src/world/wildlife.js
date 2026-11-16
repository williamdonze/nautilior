import * as THREE from 'three';
import data from '../config/wildlife.json';
import { WILDLIFE_MODELS } from './wildlifeModels.js';
import { ABYSS_MODELS } from './abyssModels.js';
import { getFloorHeight, confine } from './seabed.js';
import { WORLD } from '../config/settings.js';

/**
 * La grande faune : raies, tortues, requins près de la surface ; raies et requins décharnés,
 * calmars pâles dans les profondeurs. Elle rôde autour du sous-marin, plus ou moins curieuse.
 * Les espèces décharnées abîment la coque quand elles la heurtent.
 * Données : config/wildlife.json.
 */
const SPAWN_MIN = 55, SPAWN_MAX = 85, DESPAWN = 140;
const _v = new THREE.Vector3();
const MODELS = { ...WILDLIFE_MODELS, ...Object.fromEntries(ABYSS_MODELS.map((m) => [m.id, m.make])) };

class Animal {
  constructor(id, scene) {
    this.id = id;
    this.spec = data.species[id];
    this.object = MODELS[id]();
    this.size = this.spec.size[0] + Math.random() * (this.spec.size[1] - this.spec.size[0]);
    this.object.scale.setScalar(this.size);
    this.object.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    this.pos = this.object.position;
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.roll = 0;
    this.turn = 0; // vitesse de virage courante
    this.wander = Math.random() * 100;
    this.altitude = this.spec.altitude[0] + Math.random() * (this.spec.altitude[1] - this.spec.altitude[0]);
    this.orbitSide = Math.random() < 0.5 ? -1 : 1;
    this.hitCooldown = 0;
    this.object.rotation.order = 'YXZ';
    scene.add(this.object);
  }

  place(sub) {
    let x = 0, z = 0, floor = 0;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      x = THREE.MathUtils.clamp(sub.position.x + Math.cos(a) * d, WORLD.BOUNDS.minX, WORLD.BOUNDS.maxX);
      z = THREE.MathUtils.clamp(sub.position.z + Math.sin(a) * d, WORLD.BOUNDS.minZ, WORLD.BOUNDS.maxZ);
      floor = getFloorHeight(x, z);
      if (floor < sub.position.y + 30) break; // (sinon : une barre rocheuse, pas d'eau à cet endroit)
    }
    this.pos.set(x, this.spec.behavior === 'walker' ? floor : Math.min(-4, Math.max(floor + this.spec.altitude[0], sub.position.y + (Math.random() - 0.5) * 20)), z);
    confine(this.pos);
  }

  /** Effrayée (impulsion du sous-marin) : elle fuit pendant `time` secondes */
  scare(time) {
    if (this.state === 'stuck') this.events?.veil?.(false);
    this.state = 'scared';
    this.timer = time;
  }

  /** La Glaneuse : elle marche sur le fond, vers le sous-marin, et frappe ce qui passe entre ses pattes */
  walker(dt, time, sub, calm) {
    const S = this.spec, dx = sub.position.x - this.pos.x, dz = sub.position.z - this.pos.z, hd = Math.hypot(dx, dz);
    this.hitCooldown -= dt;
    const scared = this.state === 'scared';
    if (scared && this.timer <= 0) this.state = 'roam';
    let want = Math.sin(this.wander * 0.2 + this.size), speed = S.speed * 0.5;
    if (!calm && hd < 70) { const d = Math.atan2(dx, dz) + (scared ? Math.PI : 0) - this.yaw; want = Math.atan2(Math.sin(d), Math.cos(d)) * 2; speed = S.speed * (scared ? 2 : 1); }
    this.turn += (THREE.MathUtils.clamp(want, -1, 1) * S.turn - this.turn) * Math.min(1, dt * 2);
    this.yaw += this.turn * dt;
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    const floor = getFloorHeight(this.pos.x, this.pos.z);
    // le corps monte et descend à chaque pas ; elle s'accroupit avant de frapper
    const above = sub.position.y - floor, inReach = !calm && !scared && hd < this.size * 0.5 && above < this.size * 1.15;
    this.crouch = (this.crouch ?? 0) + ((inReach ? 0.35 : 0) - (this.crouch ?? 0)) * Math.min(1, dt * 3);
    this.pos.y = floor - this.size * this.crouch * 0.5 + Math.abs(Math.sin(this.wander * 1.7)) * this.size * 0.03;
    this.object.rotation.set(Math.sin(this.wander * 1.7) * 0.04, this.yaw, Math.cos(this.wander * 0.85) * 0.05);
    this.object.scale.set(this.size * (1 + this.crouch * 0.25), this.size * (1 - this.crouch * 0.4), this.size * (1 + this.crouch * 0.25));
    if (inReach && this.hitCooldown <= 0 && this.crouch > 0.25) { this.hitCooldown = 3.5; return S.damage; }
    return 0;
  }

  /** Le Linceul : il dérive vers le sous-marin, se plaque sur la bulle du cockpit et ne lâche que sous l'impulsion */
  veil(dt, time, sub, calm, events) {
    const S = this.spec, dx = sub.position.x - this.pos.x, dy = sub.position.y - this.pos.y, dz = sub.position.z - this.pos.z, dist = Math.hypot(dx, dy, dz) || 1;
    if (this.state === 'stuck') {
      const f = sub.forward;
      this.pos.set(sub.position.x + f.x * 2.2, sub.position.y + 0.4, sub.position.z + f.z * 2.2);
      this.object.rotation.set(Math.PI / 2, sub.yaw, 0);
      if (this.timer <= 0 || calm) { this.state = 'scared'; this.timer = 5; events.veil?.(false); }
      return S.damage * dt;
    }
    const away = this.state === 'scared';
    if (away && this.timer <= 0) this.state = 'roam';
    const speed = calm ? 0.4 : away ? 5 : dist < 30 ? S.speed * 3 : S.speed, k = (away ? -1 : 1) * (dist < 90 || away ? 1 : 0);
    this.pos.x += ((dx / dist) * k + Math.sin(this.wander * 0.3) * 0.3) * speed * dt;
    this.pos.y += ((dy / dist) * k + Math.sin(this.wander * 0.9) * 0.25) * speed * dt;
    this.pos.z += ((dz / dist) * k + Math.cos(this.wander * 0.27) * 0.3) * speed * dt;
    this.pos.y = Math.min(-4, Math.max(getFloorHeight(this.pos.x, this.pos.z) + 3, this.pos.y));
    // il ondule comme un drap dans le courant
    this.object.rotation.set(Math.sin(this.wander * 0.7) * 0.35, this.wander * 0.15, Math.cos(this.wander * 0.6) * 0.35);
    const pulse = 1 + Math.sin(this.wander * 1.6) * 0.08;
    this.object.scale.set(this.size * pulse, this.size * (2 - pulse), this.size * pulse);
    if (!calm && !away && dist < 3.2) { this.state = 'stuck'; this.timer = 9; events.veil?.(true); }
    return 0;
  }

  /** Le Chapelet enroulé : il colle à la coque, la serre et la freine, jusqu'à lâcher ou être chassé */
  cling(dt, time, sub) {
    const a = this.wander * 2.2;
    this.pos.set(sub.position.x + Math.cos(a) * 1.6, sub.position.y + Math.sin(a * 1.3) * 0.9, sub.position.z + Math.sin(a) * 1.6);
    this.object.rotation.set(Math.sin(a) * 0.9, a + Math.PI / 2, Math.cos(a) * 0.9);
    sub.velocity.multiplyScalar(Math.exp(-1.4 * dt));
    if (this.timer <= 0) { this.state = 'pass'; this.timer = 1.5; }
    return this.spec.damage * 0.45 * dt;
  }

  /**
   * Paisibles : elles errent, s'écartent du sous-marin et filent s'il approche.
   * Décharnées : elles rôdent en cercle (stalk), puis foncent droit sur la coque (charge),
   * la percutent, passent au travers de leur élan (pass) et reviennent à la charge.
   * @returns {number} dégâts infligés au sous-marin
   */
  update(dt, time, sub, calm, events = {}) {
    const S = this.spec, hostile = S.damage > 0 && !calm;
    this.events = events;
    this.wander += dt;
    this.timer -= dt;
    // apparition en fondu
    this.fadeIn = Math.min(1, (this.fadeIn ?? 0) + dt / 3);
    this.object.userData.fade = this.fadeIn;
    const dx = sub.position.x - this.pos.x, dy = sub.position.y - this.pos.y, dz = sub.position.z - this.pos.z;
    const dist = Math.hypot(dx, dy, dz), to = Math.atan2(dx, dz);
    const turnTo = (a) => { const d = a - this.yaw; return Math.atan2(Math.sin(d), Math.cos(d)); };
    if (S.behavior === 'walker') return this.walker(dt, time, sub, calm);
    if (S.behavior === 'veil') return this.veil(dt, time, sub, calm, events);
    if (this.state === 'cling') return calm ? ((this.state = 'roam'), 0) : this.cling(dt, time, sub);
    let want = Math.sin(this.wander * 0.23 + this.size) * 0.6 + Math.sin(this.wander * 0.071) * 0.5;
    let speed = S.speed * (1 + 0.15 * Math.sin(this.wander * 0.7)), agility = S.turn;
    let targetY = getFloorHeight(this.pos.x, this.pos.z) + this.altitude;
    this.state ??= 'roam';

    if (this.state === 'scared') {
      want = turnTo(to + Math.PI) * 2; speed = S.speed * 3.2; agility = 2.2;
      if (this.timer <= 0) { this.state = 'roam'; this.timer = 6; }
    } else if (!hostile) {
      // Paisible : garde ses distances, détale si on vient sur elle
      const flee = 1 - Math.min(1, Math.max(0, (dist - 9) / 16));
      if (flee > 0) {
        want = want * (1 - flee) + turnTo(to + Math.PI) * 2 * flee;
        speed *= 1 + 2.4 * flee; agility = S.turn + 1.6 * flee;
        targetY += (this.pos.y - sub.position.y > 0 ? 6 : -6) * flee;
      } else if (S.curious > 0 && dist < 70 && !calm) want = want * (1 - S.curious) + turnTo(to + Math.atan2(22, Math.max(dist, 1)) * this.orbitSide) * S.curious;
    } else if (this.state === 'charge') {
      // Droit sur la coque, en visant où elle sera
      const lead = Math.min(1.2, dist / (S.speed * 4.5));
      const ax = dx + sub.velocity.x * lead, az = dz + sub.velocity.z * lead;
      want = turnTo(Math.atan2(ax, az)) * 4; speed = S.speed * 4.5; agility = 3.2;
      targetY = sub.position.y + sub.velocity.y * lead;
      if (this.timer <= 0) { this.state = 'stalk'; this.timer = 2 + Math.random() * 2; }
    } else if (this.state === 'pass') {
      want = 0; speed = S.speed * 3.5; targetY = this.pos.y;
      if (this.timer <= 0) { this.state = 'stalk'; this.timer = 1.5 + Math.random() * 2.5; this.orbitSide *= -1; }
    } else if (dist < 110) {
      // Rôde : cercle serré et rapide autour du sous-marin, à sa hauteur
      this.state = 'stalk';
      want = turnTo(to + Math.atan2(20, Math.max(dist, 1)) * this.orbitSide) * 2;
      speed = S.speed * (dist > 40 ? 2.6 : 1.8); agility = 1.6;
      targetY = sub.position.y + Math.sin(this.wander * 0.6) * 5;
      // elle ne charge qu'un cœur qui s'emballe ; sinon elle continue de tourner, de plus en plus près
      if (this.timer <= 0 && dist < 48 && this.bold && (this.slots?.free ?? 1) > 0) { if (this.slots) this.slots.free--; this.state = 'charge'; this.timer = 5; events.charge?.(this); }
    } else this.state = 'roam';

    this.turn += (THREE.MathUtils.clamp(want, -1, 1) * agility - this.turn) * Math.min(1, dt * 3);
    this.yaw += this.turn * dt;
    // Altitude : jamais dans le fond, jamais hors de l'eau
    const floor = getFloorHeight(this.pos.x + Math.sin(this.yaw) * 6, this.pos.z + Math.cos(this.yaw) * 6);
    targetY = Math.min(-3 - this.size * 0.2, Math.max(floor + 2.5 + this.size * 0.3, targetY));
    const climb = THREE.MathUtils.clamp((targetY - this.pos.y) * 0.35, -0.7, 0.7);
    this.pitch += (-climb * 0.8 - this.pitch) * Math.min(1, dt * 3);
    this.speed = (this.speed ?? speed) + (speed - (this.speed ?? speed)) * Math.min(1, dt * 2.5);
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.pos.y += climb * this.speed * dt;
    confine(this.pos); // sous une barre, l'eau n'est que dans le tunnel
    this.roll += (-this.turn * 0.6 - this.roll) * Math.min(1, dt * 3);
    this.object.rotation.set(this.pitch, this.yaw, this.roll);

    const reach = 2.4 + this.size * 0.3;
    if (hostile && this.state === 'charge' && dist < reach) {
      // Percute la coque, puis file sur son élan avant de revenir
      if (S.behavior === 'cling') { this.state = 'cling'; this.timer = 5; return S.damage * 0.5; }
      this.state = 'pass';
      this.timer = 1.1;
      return S.damage;
    }
    // Personne ne traverse la coque : les corps se repoussent
    if (dist < reach && this.state !== 'pass' && dist > 0.01) {
      const k = (reach - dist) / dist;
      this.pos.x -= dx * k; this.pos.y -= dy * k; this.pos.z -= dz * k;
    }
    return 0;
  }

  dispose(scene) {
    scene.remove(this.object);
    this.object.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}

export class Wildlife {
  /** @param {object} events hit(animal, direction) : une bête décharnée heurte la coque */
  constructor(scene, events = {}) {
    this.scene = scene;
    this.events = events;
    this.animals = [];
    this.calm = false;
  }

  clear() {
    this.events.veil?.(false);
    for (const a of this.animals) a.dispose(this.scene);
    this.animals = [];
    this.calm = false;
  }

  /** Impulsion du sous-marin : tout ce qui est à portée prend la fuite */
  scare(position, radius, time) {
    for (const a of this.animals) if (a.pos.distanceTo(position) < radius) a.scare(time);
  }

  /** Refuge (cloche à air, baleine) : seules les bêtes hostiles s'écartent */
  scareHostile(position, radius, time) {
    for (const a of this.animals) if (a.spec.damage > 0 && a.state !== 'scared' && a.pos.distanceTo(position) < radius) a.scare(time);
  }

  /** Nombre de bêtes en train de charger (pour la musique et les alarmes) */
  get threat() {
    let n = 0;
    for (const a of this.animals) if (a.state === 'charge') n++;
    return n;
  }

  /** @returns {number} dégâts subis par le sous-marin */
  update(dt, time, sub, zoneId) {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (this.animals[i].pos.distanceTo(sub.position) > DESPAWN && this.animals[i].state !== 'stuck') {
        this.animals[i].dispose(this.scene);
        this.animals.splice(i, 1);
      }
    }
    // Complète la population de la zone, un individu à la fois
    for (const [id, wanted] of Object.entries(data.zones[zoneId] ?? {})) {
      let have = 0;
      for (const a of this.animals) if (a.id === id) have++;
      if (have < wanted && Math.random() < dt * 0.6) {
        const a = new Animal(id, this.scene);
        a.place(sub);
        this.animals.push(a);
      }
    }
    let damage = 0;
    for (const a of this.animals) {
      a.bold = this.bold !== false;
      a.slots = this.slots;
      const d = a.update(dt, time, sub, this.calm, this.events);
      if (d > 0) {
        damage += d;
        // (les dégâts continus — étreinte, voile — ne rejouent pas le choc à chaque image)
        if (d >= 1) this.events.hit?.(a, _v.subVectors(sub.position, a.pos).normalize());
      }
    }
    return damage;
  }
}
