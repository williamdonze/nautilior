import * as THREE from 'three';
import { CAMERA, RENDER, SUBMARINE, WORLD } from '../config/settings.js';
import { damp, clamp } from '../core/utils.js';
import { getFloorHeight } from '../world/seabed.js';

/**
 * Caméra à la troisième personne qui suit le sous-marin en douceur.
 * La position et le point visé sont lissés séparément : la caméra « traîne » un peu
 * derrière les virages, ce qui donne une sensation de masse.
 */
export class FollowCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(RENDER.FOV, aspect, 0.1, 400);
    this.lookAt = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    this.base = new THREE.Vector3(); // position lissée, sans secousse
    this.shakeAmount = 0;
    this.zoom = 1; // zoom visé (molette)
    this.zoomSmooth = 1;
    window.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.001), CAMERA.ZOOM_MIN, CAMERA.ZOOM_MAX);
      },
      { passive: false }
    );
  }

  /** Secousse brève (chocs, capture d'un objet lourd…) */
  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Place la caméra directement derrière la cible (sans lissage) */
  snap(sub) {
    this.computeDesired(sub);
    this.base.copy(this._desired);
    this.camera.position.copy(this._desired);
    this.lookAt.copy(this._desiredLook);
    this.camera.lookAt(this.lookAt);
  }

  computeDesired(sub) {
    const fwd = sub.forward;
    this._desired
      .copy(sub.position)
      .addScaledVector(fwd, -CAMERA.DISTANCE * this.zoomSmooth)
      .add({ x: 0, y: CAMERA.HEIGHT * this.zoomSmooth, z: 0 })
      // Décalage vers la droite du sous-marin (droite = avant × haut)
      .add({ x: -fwd.z * CAMERA.SIDE * this.zoomSmooth, y: 0, z: fwd.x * CAMERA.SIDE * this.zoomSmooth });
    this._desiredLook.copy(sub.position).addScaledVector(fwd, CAMERA.LOOK_AHEAD);
    // On regarde un peu dans la direction de la montée / descente
    this._desiredLook.y += sub.velocity.y * 0.8 - CAMERA.LOOK_DOWN;
  }

  update(dt, sub) {
    this.zoomSmooth += (this.zoom - this.zoomSmooth) * damp(6, dt);
    this.computeDesired(sub);
    this.base.lerp(this._desired, damp(CAMERA.POS_SMOOTH, dt));
    this.lookAt.lerp(this._desiredLook, damp(CAMERA.LOOK_SMOOTH, dt));

    // Jamais sous le fond ni au-dessus de la surface
    const p = this.base;
    p.y = Math.max(p.y, getFloorHeight(p.x, p.z) + 1.2);
    p.y = Math.min(p.y, WORLD.SURFACE_Y - 0.4);

    // Secousse qui s'amortit rapidement
    this.camera.position.copy(p);
    if (this.shakeAmount > 0.001) {
      const s = this.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shakeAmount *= Math.exp(-9 * dt);
    }

    this.camera.lookAt(this.lookAt);

    // Légère ouverture du champ de vision avec la vitesse
    const maxSpeed = SUBMARINE.FORWARD_ACCEL / SUBMARINE.FORWARD_DRAG;
    const fov = RENDER.FOV + clamp(sub.speed / maxSpeed, 0, 1) * CAMERA.SPEED_FOV_BOOST;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * damp(2, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Profondeur de la caméra (pour l'ambiance) */
  get depth() {
    return Math.max(0, WORLD.SURFACE_Y - this.camera.position.y);
  }
}
