import * as THREE from 'three';
import data from '../config/wildlife.json';
import { WILDLIFE_MODELS } from './wildlifeModels.js';
import { getFloorHeight } from './seabed.js';
import { WORLD } from '../config/settings.js';

/**
 * La grande faune : raies, tortues, requins près de la surface ; raies et requins décharnés,
 * calmars pâles dans les profondeurs. Elle rôde autour du sous-marin, plus ou moins curieuse.
 * Les espèces décharnées abîment la coque quand elles la heurtent.
 * Données : config/wildlife.json.
 */
const SPAWN_MIN = 55, SPAWN_MAX = 85, DESPAWN = 140;
const _v = new THREE.Vector3();

class Animal {
  constructor(id, scene) {
    this.id = id;
    this.spec = data.species[id];
    this.object = WILDLIFE_MODELS[id]();
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
    const a = Math.random() * Math.PI * 2, d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const x = THREE.MathUtils.clamp(sub.position.x + Math.cos(a) * d, WORLD.BOUNDS.minX, WORLD.BOUNDS.maxX);
    const z = THREE.MathUtils.clamp(sub.position.z + Math.sin(a) * d, WORLD.BOUNDS.minZ, WORLD.BOUNDS.maxZ);
    const floor = getFloorHeight(x, z);
    this.pos.set(x, Math.min(-4, Math.max(floor + this.spec.altitude[0], sub.position.y + (Math.random() - 0.5) * 20)), z);
  }

  /** Effrayée (impulsion du sous-marin) : elle fuit pendant `time` secondes */
  scare(time) {
    this.state = 'scared';
    this.timer = time;
  }

  /**
   * Paisibles : elles errent, s'écartent du sous-marin et filent s'il approche.
   * Décharnées : elles rôdent en cercle (stalk), puis foncent droit sur la coque (charge),
   * la percutent, passent au travers de leur élan (pass) et reviennent à la charge.
   * @returns {number} dégâts infligés au sous-marin
   */
  update(dt, time, sub, calm, events = {}) {
    const S = this.spec, hostile = S.damage > 0 && !calm;
    this.wander += dt;
    this.timer -= dt;
    // apparition en fondu
    this.fadeIn = Math.min(1, (this.fadeIn ?? 0) + dt / 3);
    this.object.userData.fade = this.fadeIn;
    const dx = sub.position.x - this.pos.x, dy = sub.position.y - this.pos.y, dz = sub.position.z - this.pos.z;
    const dist = Math.hypot(dx, dy, dz), to = Math.atan2(dx, dz);
    const turnTo = (a) => { const d = a - this.yaw; return Math.atan2(Math.sin(d), Math.cos(d)); };
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
      if (this.timer <= 0 && dist < 48) { this.state = 'charge'; this.timer = 5; events.charge?.(this); }
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
    this.roll += (-this.turn * 0.6 - this.roll) * Math.min(1, dt * 3);
    this.object.rotation.set(this.pitch, this.yaw, this.roll);

    const reach = 2.4 + this.size * 0.3;
    if (hostile && this.state === 'charge' && dist < reach) {
      // Percute la coque, puis file sur son élan avant de revenir
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
    for (const a of this.animals) a.dispose(this.scene);
    this.animals = [];
    this.calm = false;
  }

  /** Impulsion du sous-marin : tout ce qui est à portée prend la fuite */
  scare(position, radius, time) {
    for (const a of this.animals) if (a.pos.distanceTo(position) < radius) a.scare(time);
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
      if (this.animals[i].pos.distanceTo(sub.position) > DESPAWN) {
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
      const d = a.update(dt, time, sub, this.calm, this.events);
      if (d > 0) {
        damage += d;
        this.events.hit?.(a, _v.subVectors(sub.position, a.pos).normalize());
      }
    }
    return damage;
  }
}
