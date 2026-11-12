import * as THREE from 'three';
import { stats } from '../submarine/stats.js';
import { findPickup } from '../world/pickups.js';

/**
 * Visée à la souris : un rayon part de la caméra à travers le curseur.
 * Donne l'objet survolé, s'il est à portée de la pince, et le point visé.
 */
export class Aim {
  constructor(camera, pickups, seabed) {
    this.camera = camera;
    this.pickups = pickups;
    this.seabed = seabed;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    // Résultat courant
    this.pickup = null;
    this.inRange = false;
    this.distance = 0;
    this.point = new THREE.Vector3();
  }

  /** Mise à jour à chaque frame (raycast léger : seulement les objets) */
  update(pointer, clawRoot) {
    this.raycaster.setFromCamera(pointer.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickups.objects, true);
    this.pickup = hits.length ? findPickup(hits[0].object) : null;
    if (this.pickup) {
      this.distance = clawRoot.distanceTo(this.pickup.object.position);
      this.inRange = this.distance <= stats.clawRange;
      this.point.copy(this.pickup.object.position);
    } else {
      this.inRange = false;
    }
  }

  /** Au clic dans le vide : point visé sur le fond, ou à portée max dans la direction du curseur */
  resolvePoint(clawRoot) {
    if (this.pickup) return this;
    const hit = this.raycaster.intersectObject(this.seabed, false)[0];
    if (hit) {
      this.point.copy(hit.point);
    } else {
      // Rien sous le curseur : on vise le point du rayon le plus proche de la portée max
      const ray = this.raycaster.ray;
      const t = Math.max(0, ray.direction.dot(this._tmp().subVectors(clawRoot, ray.origin))) + stats.clawRange;
      ray.at(t, this.point);
    }
    return this;
  }

  _tmp() {
    return (this.__tmp ||= new THREE.Vector3());
  }
}
