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

  /** @returns {number} dégâts infligés au sous-marin */
  update(dt, time, sub, calm) {
    const S = this.spec;
    this.wander += dt;
    // Cap souhaité : errance lente, plus un détour vers le sous-marin pour les curieuses
    let want = Math.sin(this.wander * 0.23 + this.size) * 0.6 + Math.sin(this.wander * 0.071) * 0.5;
    const dx = sub.position.x - this.pos.x, dy = sub.position.y - this.pos.y, dz = sub.position.z - this.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    let targetY = getFloorHeight(this.pos.x, this.pos.z) + this.altitude;
    const curious = calm ? 0 : S.curious;
    if (curious > 0 && dist < 90) {
      // Elle vise un point sur un cercle autour du sous-marin : elle tourne autour, puis le frôle
      const ring = S.damage > 0 ? 7 + 9 * (0.5 + 0.5 * Math.sin(this.wander * 0.19)) : 16;
      const to = Math.atan2(dx, dz), off = Math.atan2(ring, Math.max(dist, 1)) * this.orbitSide;
      let d = to + off - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      want = want * (1 - curious) + d * 1.4 * curious;
      targetY = targetY * (1 - curious) + (sub.position.y + Math.sin(this.wander * 0.3) * 3) * curious;
    }
    // Reste dans le couloir du monde
    if (Math.abs(this.pos.x) > WORLD.BOUNDS.maxX - 15) { const d = Math.atan2(-this.pos.x, 0.0001) - this.yaw; want = Math.atan2(Math.sin(d), Math.cos(d)); }
    this.turn += (THREE.MathUtils.clamp(want, -1, 1) * S.turn - this.turn) * Math.min(1, dt * 1.5);
    this.yaw += this.turn * dt;
    // Altitude : jamais dans le fond, jamais hors de l'eau
    const floor = getFloorHeight(this.pos.x + Math.sin(this.yaw) * 6, this.pos.z + Math.cos(this.yaw) * 6);
    targetY = Math.min(-3 - this.size * 0.2, Math.max(floor + 2.5 + this.size * 0.3, targetY));
    const climb = THREE.MathUtils.clamp((targetY - this.pos.y) * 0.25, -0.5, 0.5);
    this.pitch += (-climb * 0.8 - this.pitch) * Math.min(1, dt * 2);
    const speed = S.speed * (1 + 0.15 * Math.sin(this.wander * 0.7));
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    this.pos.y += climb * speed * dt;
    this.roll += (-this.turn * 0.9 - this.roll) * Math.min(1, dt * 2);
    this.object.rotation.set(this.pitch, this.yaw, this.roll);

    // Heurt de la coque
    this.hitCooldown -= dt;
    if (S.damage > 0 && !calm && this.hitCooldown <= 0 && dist < 2.2 + this.size * 0.35) {
      this.hitCooldown = 5;
      this.orbitSide *= -1;
      return S.damage;
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
      const d = a.update(dt, time, sub, this.calm);
      if (d > 0) {
        damage += d;
        this.events.hit?.(a, _v.subVectors(sub.position, a.pos).normalize());
      }
    }
    return damage;
  }
}
