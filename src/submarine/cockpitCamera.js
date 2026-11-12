import * as THREE from 'three';
import { RENDER, WORLD } from '../config/settings.js';

/**
 * Vue à la première personne, depuis le poste de pilotage.
 * La souris (capturée) fait tourner le regard, dans les limites du hublot ;
 * le réticule reste au centre et le phare suit le regard pour éclairer ce que l'on vise.
 */
const LOOK_YAW = 1.0; // le regard peut tourner jusqu'à ±57° de l'axe du sous-marin
const LOOK_PITCH_UP = 0.6;
const LOOK_PITCH_DOWN = -1.05;
const BASE_PITCH = -0.12; // on regarde un peu vers le fond
const SENSITIVITY = 0.0022; // radians par pixel de souris
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export class CockpitCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(RENDER.FIRST_PERSON_FOV, aspect, 0.1, 130);
    this.yaw = 0;
    this.pitch = BASE_PITCH;
    this.shakeAmount = 0;
    this._q = new THREE.Quaternion();
    this._qy = new THREE.Quaternion();
    this._qx = new THREE.Quaternion();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount * 0.5);
  }

  /** Recentre le regard (changement de vue, nouvelle plongée) */
  reset() {
    this.yaw = 0;
    this.pitch = BASE_PITCH;
  }

  update(dt, sub, pointer) {
    // Regard : la souris capturée fait tourner la tête
    const d = pointer.consumeLook();
    this.yaw = Math.max(-LOOK_YAW, Math.min(LOOK_YAW, this.yaw - d.x * SENSITIVITY));
    this.pitch = Math.max(LOOK_PITCH_DOWN, Math.min(LOOK_PITCH_UP, this.pitch - d.y * SENSITIVITY));

    // Position : le poste de pilotage du modèle, qui suit tangage et roulis
    sub.body.updateWorldMatrix(true, false);
    this.camera.position.copy(sub.cockpit).applyMatrix4(sub.body.matrixWorld);
    this.camera.position.y = Math.min(this.camera.position.y, WORLD.SURFACE_Y - 0.3);

    // Orientation : celle de la coque, retournée vers l'avant (+Z), puis le regard
    sub.body.getWorldQuaternion(this._q);
    this._qy.setFromAxisAngle(Y_AXIS, Math.PI + this.yaw);
    this._qx.setFromAxisAngle(X_AXIS, this.pitch);
    this.camera.quaternion.copy(this._q).multiply(this._qy).multiply(this._qx);

    if (this.shakeAmount > 0.001) {
      const s = this.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmount *= Math.exp(-9 * dt);
    }
    sub.aimLight(this.yaw, this.pitch - BASE_PITCH);
  }

  get depth() {
    return Math.max(0, WORLD.SURFACE_Y - this.camera.position.y);
  }
}
