import * as THREE from 'three';
import { PICKUPS, SUBMARINE, WORLD } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import itemsData from '../loot/items.json';
import { createItemModel } from '../loot/models.js';
import { getFloorHeight } from './seabed.js';

const HIGHLIGHT = new THREE.Color('#cdb57c');

/**
 * Objets posés sur le fond, que la pince peut attraper.
 * Chaque objet est un groupe 3D dont `userData.pickup` renvoie vers ses données.
 */
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.highlighted = null;
    this.rand = createRandom(WORLD.SEED + 101);
    this.totalWeight = itemsData.items.reduce((s, it) => s + it.spawnWeight, 0);
    this.spawnAll();
  }

  /** Tirage pondéré d'un type d'objet */
  pickItem() {
    let r = this.rand() * this.totalWeight;
    for (const it of itemsData.items) {
      r -= it.spawnWeight;
      if (r <= 0) return it;
    }
    return itemsData.items[0];
  }

  spawnAll() {
    const B = WORLD.BOUNDS;
    const sp = SUBMARINE.SPAWN;
    for (let i = 0; i < PICKUPS.COUNT; i++) {
      let x, z;
      if (i < PICKUPS.NEAR_SPAWN) {
        // Une partie près du départ pour trouver vite de quoi tester
        const a = this.rand() * Math.PI * 2;
        const d = 8 + this.rand() * PICKUPS.NEAR_RADIUS;
        x = sp.x + Math.cos(a) * d;
        z = sp.z + Math.sin(a) * d;
      } else {
        x = this.rand.range(B.minX, B.maxX);
        z = this.rand.range(B.minZ, B.maxZ);
      }
      this.spawn(this.pickItem(), x, z);
    }
  }

  spawn(item, x, z) {
    const { object, materials } = createItemModel(item);
    object.rotation.y = this.rand() * Math.PI * 2;
    object.position.set(x, 0, z);
    object.updateMatrixWorld(true);
    // Pose l'objet sur le fond : le bas de sa boîte englobante touche le sol
    const box = new THREE.Box3().setFromObject(object);
    object.position.y = getFloorHeight(x, z) - box.min.y - 0.05;
    const size = box.getSize(new THREE.Vector3());

    const pickup = {
      item,
      object,
      materials,
      weight: item.weight,
      radius: Math.max(size.x, size.y, size.z) * 0.5,
    };
    object.userData.pickup = pickup;
    this.scene.add(object);
    this.list.push(pickup);
    return pickup;
  }

  /** Retire un objet de la liste (il est dans la pince) */
  detach(pickup) {
    const i = this.list.indexOf(pickup);
    if (i >= 0) this.list.splice(i, 1);
    if (this.highlighted === pickup) this.setHighlighted(null);
  }

  /** Supprime définitivement l'objet de la scène */
  dispose(pickup) {
    this.scene.remove(pickup.object);
    pickup.object.traverse((o) => o.geometry?.dispose());
    pickup.materials.forEach((m) => m.dispose());
  }

  setHighlighted(pickup) {
    if (this.highlighted === pickup) return;
    if (this.highlighted) this.highlighted.materials.forEach((m) => m.emissive.setRGB(0, 0, 0));
    this.highlighted = pickup;
  }

  /** Objets 3D candidats au raycast */
  get objects() {
    return this.list.map((p) => p.object);
  }

  update(time) {
    // Surbrillance pulsée de l'objet visé
    if (this.highlighted) {
      const k = 0.35 + Math.sin(time * 7) * 0.15;
      this.highlighted.materials.forEach((m) => m.emissive.copy(HIGHLIGHT).multiplyScalar(k));
    }
  }
}

/** Remonte la hiérarchie jusqu'au groupe qui porte les données de l'objet */
export function findPickup(object3d) {
  let o = object3d;
  while (o) {
    if (o.userData.pickup) return o.userData.pickup;
    o = o.parent;
  }
  return null;
}
