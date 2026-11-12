import * as THREE from 'three';
import { CLAW } from '../config/settings.js';
import { clamp, damp } from '../core/utils.js';
import { createClawModel } from './clawModel.js';
import { solveTwoBone } from './ik.js';
import { stats } from '../submarine/stats.js';

/**
 * Pince du Nautiliar : machine à états.
 *   IDLE     → bras replié sous le nez
 *   EXTEND   → le poignet file vers la cible (accélération puis freinage)
 *   GRAB     → les mâchoires se referment ; l'objet est saisi
 *   RETRACT  → retour, d'autant plus lent que l'objet est lourd
 *   STOW     → l'objet rentre dans la soute
 */
const State = { IDLE: 'idle', EXTEND: 'extend', GRAB: 'grab', RETRACT: 'retract', STOW: 'stow' };

const v3 = (o) => new THREE.Vector3(o.x, o.y, o.z);
const ROOT_LOCAL = v3(CLAW.ROOT);
const REST_LOCAL = v3(CLAW.REST);
const POLE_LOCAL = v3(CLAW.POLE).normalize();
const STOW_LOCAL = new THREE.Vector3(0, -0.4, 1.4); // trappe de la soute

export class Claw {
  /**
   * @param {object} deps scene, sub, sound, bubbles, pickups, hold, onShake(amount), onCapture(pickup, position)
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.model = createClawModel();
    this.scene.add(this.model.group);

    this.state = State.IDLE;
    this.timer = 0;
    this.speed = 0;
    this.open = 0.25;
    this.target = null; // pickup visé (null = coup dans le vide)
    this.carried = null; // pickup tenu par la pince
    this.grabbedDone = false;

    this.root = new THREE.Vector3();
    this.wrist = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.elbow = new THREE.Vector3();
    this.headDir = new THREE.Vector3(0, 0, 1);
    this.grabPoint = new THREE.Vector3();
    this.stowFrom = new THREE.Vector3();

    this._rest = new THREE.Vector3();
    this._pole = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._approach = new THREE.Vector3();
    this._wristGoal = new THREE.Vector3();

    // Éclair de capture (sphère additive qui grossit et s'efface)
    this.flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshBasicMaterial({ color: '#efe3bb', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.visible = false;
    this.flashTime = 0;
    this.scene.add(this.flash);

    this.updateAnchors();
    this.wrist.copy(this._rest);
  }

  get busy() {
    return this.state !== State.IDLE;
  }

  /**
   * Déclenche la pince.
   * @param {{pickup, inRange, point}} aim résultat de la visée
   */
  fire(aim) {
    if (this.busy) return false;
    if (aim.pickup && aim.inRange && this.hold.full) {
      // Soute pleine : la pince refuse de partir
      this.sound.deny();
      return 'full';
    }
    if (aim.pickup && aim.inRange) {
      this.target = aim.pickup;
      this.goal.copy(aim.pickup.object.position);
    } else {
      // Coup dans le vide : vers le point visé, limité à la portée
      this.target = null;
      this.goal.copy(aim.point);
      this._tmp.subVectors(this.goal, this.root);
      const d = this._tmp.length();
      if (d > stats.clawRange) this.goal.copy(this.root).addScaledVector(this._tmp, stats.clawRange / d);
    }
    this.state = State.EXTEND;
    this.speed = 0;
    this.grabbedDone = false;
    this.sound.motorStart();
    this.sound.motorPitch(1.15);
    return true;
  }

  /** Points d'ancrage (épaule, repos, pôle) en coordonnées monde */
  updateAnchors() {
    const body = this.sub.body;
    body.updateWorldMatrix(true, false);
    this.root.copy(ROOT_LOCAL).applyMatrix4(body.matrixWorld);
    this._rest.copy(REST_LOCAL).applyMatrix4(body.matrixWorld);
    this._pole.copy(POLE_LOCAL).transformDirection(body.matrixWorld);
  }

  /** Avance le poignet vers `goal` avec accélération et freinage doux. Renvoie true à l'arrivée. */
  moveWrist(goal, dt, maxSpeed, accel) {
    this._tmp.subVectors(goal, this.wrist);
    const dist = this._tmp.length();
    // Vitesse limitée par la distance restante → décélération en douceur
    this.speed = Math.min(this.speed + accel * dt, maxSpeed, Math.sqrt(2 * accel * dist) + 0.5);
    const step = this.speed * dt;
    if (step >= dist) {
      this.wrist.copy(goal);
      return true;
    }
    this.wrist.addScaledVector(this._tmp, step / dist);
    return false;
  }

  update(dt, time) {
    this.updateAnchors();
    const weight = this.carried ? this.carried.weight : 0;

    switch (this.state) {
      case State.IDLE: {
        // Le bras suit le sous-marin, avec un tout petit retard élastique
        this.wrist.lerp(this._rest, damp(18, dt));
        this.open += (0.25 - this.open) * damp(6, dt);
        break;
      }

      case State.EXTEND: {
        // On s'arrête un peu avant le centre de l'objet : ce sont les doigts qui le saisissent
        this._approach.subVectors(this.goal, this.root).normalize();
        this._wristGoal.copy(this.goal).addScaledVector(this._approach, -CLAW.GRAB_OFFSET);
        const arrived = this.moveWrist(this._wristGoal, dt, CLAW.EXTEND_SPEED * stats.clawSpeed, CLAW.EXTEND_ACCEL * stats.clawSpeed);
        this.open += (1 - this.open) * damp(10, dt);
        // Le sous-marin s'est trop éloigné : on abandonne
        if (this.target && this.root.distanceTo(this.goal) > stats.clawRange * 1.2) {
          this.startRetract();
        } else if (arrived) {
          this.state = State.GRAB;
          this.timer = 0;
          this.sound.motorPitch(0.8);
        }
        break;
      }

      case State.GRAB: {
        this.timer += dt;
        this.open += (0 - this.open) * damp(1 / (CLAW.CLOSE_TIME * 0.3), dt);
        if (!this.grabbedDone && this.timer >= CLAW.CLOSE_TIME) {
          this.grabbedDone = true;
          if (this.target) {
            this.carried = this.target;
            this.pickups.detach(this.carried);
            this.sound.clank(1);
            this.bubbles.burst(this.grabPoint, 18 + Math.min(this.carried.weight, 40), 2.5);
            this.onShake?.(0.08 + Math.min(this.carried.weight / 200, 0.3) + this.carried.rarity.level * 0.04);
          } else {
            this.sound.clank(0.5); // les mâchoires claquent dans le vide
          }
          this.target = null;
        }
        if (this.timer >= CLAW.CLOSE_TIME + CLAW.HOLD_TIME) this.startRetract();
        break;
      }

      case State.RETRACT: {
        // Plus l'objet est lourd, plus le retour est lent
        const slow = (CLAW.WEIGHT_REF / (CLAW.WEIGHT_REF + weight)) * stats.clawSpeed;
        const arrived = this.moveWrist(this._rest, dt, CLAW.RETRACT_SPEED * slow, CLAW.RETRACT_ACCEL * slow);
        this.sound.motorPitch(0.6 + Math.min(slow, 1) * 0.5);
        // Le bras tremble sous l'effort
        if (weight > 10) {
          const j = Math.min(weight / 100, 0.6) * 0.04;
          this.wrist.x += (Math.random() - 0.5) * j;
          this.wrist.y += (Math.random() - 0.5) * j;
          this.wrist.z += (Math.random() - 0.5) * j;
          // …et le poids tire légèrement le sous-marin vers le bas
          this.sub.velocity.y -= weight * 0.006 * dt;
        }
        if (arrived) {
          this.sound.motorStop();
          if (this.carried) {
            this.state = State.STOW;
            this.timer = 0;
            this.stowFrom.copy(this.carried.object.position);
          } else {
            this.state = State.IDLE;
          }
        }
        break;
      }

      case State.STOW: {
        this.timer += dt;
        this.wrist.lerp(this._rest, damp(18, dt));
        const t = clamp(this.timer / CLAW.STOW_TIME, 0, 1);
        const e = t * t * (3 - 2 * t);
        const obj = this.carried.object;
        const hatch = this._tmp.copy(STOW_LOCAL).applyMatrix4(this.sub.body.matrixWorld);
        obj.position.lerpVectors(this.stowFrom, hatch, e);
        obj.scale.setScalar(Math.max(0.001, 1 - e));
        this.open += (0.6 - this.open) * damp(8, dt); // la pince relâche
        if (t >= 1) this.finishStow(hatch);
        break;
      }
    }

    // --- IK et pose du modèle
    const d = this.root.distanceTo(this.wrist);
    const seg = Math.max(CLAW.SEGMENT_MIN, d / 1.85); // segments télescopiques : toujours un léger coude
    solveTwoBone(this.root, this.wrist, seg, seg, this._pole, this.elbow);
    // La tête vise dans l'axe épaule → poignet (plus stable que l'axe du dernier segment)
    this._tmp.subVectors(this.wrist, this.root);
    if (this._tmp.lengthSq() > 1e-6) this.headDir.copy(this._tmp.normalize());
    this.model.pose(this.root, this.elbow, this.wrist, this.headDir, clamp(this.open, 0, 1));
    this.grabPoint.copy(this.wrist).addScaledVector(this.headDir, CLAW.GRAB_OFFSET);

    // L'objet tenu suit les doigts (rattrapage rapide pour éviter un saut)
    if (this.carried && this.state !== State.STOW) {
      this.carried.object.position.lerp(this.grabPoint, damp(25, dt));
    }

    this.updateFlash(dt);
  }

  /** Remise à zéro brutale (réveil à l'hôpital) : un objet tenu retombe au fond */
  reset() {
    if (this.carried) {
      const p = this.carried.object.position;
      this.pickups.dispose(this.carried);
      this.pickups.spawn(this.carried.item, p.x, p.z);
      this.carried = null;
    }
    this.target = null;
    this.state = State.IDLE;
    this.speed = 0;
    this.sound.motorStop();
    this.updateAnchors();
    this.wrist.copy(this._rest);
  }

  startRetract() {
    this.state = State.RETRACT;
    this.speed = 0;
    this.target = null;
  }

  finishStow(hatch) {
    const pickup = this.carried;
    this.carried = null;
    this.state = State.IDLE;
    this.pickups.dispose(pickup);
    if (!this.hold.add(pickup.item)) {
      // Sécurité : soute remplie entre-temps → l'objet retombe
      this.pickups.drop(pickup.item, hatch);
      this.sound.deny();
      return;
    }
    this.sound.thunk(pickup.weight);
    if (pickup.rarity.level >= 2) this.sound.captureRare(pickup.rarity.level);
    else this.sound.capture();
    this.bubbles.burst(hatch, 12, 1.5);
    this.flash.position.copy(hatch);
    this.flash.material.color.set(pickup.rarity.level >= 1 ? pickup.rarity.color : '#efe3bb');
    this.flash.visible = true;
    this.flashTime = 0;
    this.onCapture?.(pickup, hatch.clone());
  }

  updateFlash(dt) {
    if (!this.flash.visible) return;
    this.flashTime += dt;
    const t = this.flashTime / 0.4;
    if (t >= 1) {
      this.flash.visible = false;
      return;
    }
    this.flash.scale.setScalar(0.4 + t * 2.2);
    this.flash.material.opacity = (1 - t) * 0.8;
  }
}
