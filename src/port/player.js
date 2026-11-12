import * as THREE from 'three';
import { createCharacter, LOOKS } from './characters.js';
import { damp } from '../core/utils.js';

/**
 * Le joueur à pied, en ciré jaune.
 * Déplacement relatif à la caméra (fixe, regardant vers le village) : avant = vers -Z.
 */
const SPEED = 4.2;
const ACCEL = 14;
const RADIUS = 0.45;

export class Player {
  constructor(scene) {
    this.character = createCharacter(LOOKS.player);
    this.object = this.character.object;
    scene.add(this.object);
    this.position = this.object.position;
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
  }

  place(x, z, yaw = 0) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.object.rotation.y = yaw;
  }

  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /**
   * @param {object} input clavier (axes)
   * @param {object[]} colliders boîtes au sol { minX, maxX, minZ, maxZ }
   * @param {object[]} circles obstacles ronds { x, z, r } (personnages)
   * @param {object} bounds limites de la zone praticable
   */
  update(dt, time, input, colliders, circles, bounds) {
    // Direction voulue
    const ix = input.axis('left', 'right');
    const iz = -input.axis('backward', 'forward');
    let tx = ix, tz = iz;
    const len = Math.hypot(tx, tz);
    if (len > 0) {
      tx = (tx / len) * SPEED;
      tz = (tz / len) * SPEED;
    }
    const k = damp(ACCEL / SPEED, dt);
    this.velocity.x += (tx - this.velocity.x) * k;
    this.velocity.z += (tz - this.velocity.z) * k;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Collisions : cercle contre boîtes
    for (const c of colliders) {
      const nx = Math.max(c.minX, Math.min(this.position.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(this.position.z, c.maxZ));
      const dx = this.position.x - nx, dz = this.position.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          this.position.x = nx + (dx / d) * RADIUS;
          this.position.z = nz + (dz / d) * RADIUS;
        } else {
          // Centre à l'intérieur de la boîte : on sort par le côté le plus proche
          const pushes = [
            [c.minX - RADIUS - this.position.x, 0], [c.maxX + RADIUS - this.position.x, 0],
            [0, c.minZ - RADIUS - this.position.z], [0, c.maxZ + RADIUS - this.position.z],
          ].sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          this.position.x += pushes[0][0];
          this.position.z += pushes[0][1];
        }
      }
    }
    // …et contre les personnages
    for (const c of circles) {
      const dx = this.position.x - c.x, dz = this.position.z - c.z;
      const min = RADIUS + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.position.x = c.x + (dx / d) * min;
        this.position.z = c.z + (dz / d) * min;
      }
    }
    this.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.position.x));
    this.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.position.z));

    // Orientation : se tourne doucement vers la direction de marche
    if (this.speed > 0.3) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = target - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * damp(10, dt);
    }
    this.object.rotation.y = this.yaw;
    this.character.animate(dt, this.speed, time);
  }
}
