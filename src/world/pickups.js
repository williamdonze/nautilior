import * as THREE from 'three';
import { PICKUPS, SUBMARINE, WORLD } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { rollItem, getRarity } from '../loot/loot.js';
import zonesData from '../config/zones.json';
import fragmentsData from '../story/fragments.json';
import { WRECK_SPOTS } from './landmarks.js';
import { canyonCenter } from './seabed.js';
import { createItemModel } from '../loot/models.js';
import { createHalo, createPillar } from '../loot/glow.js';
import { getFloorHeight } from './seabed.js';

const HIGHLIGHT = new THREE.Color('#cdb57c');

/**
 * Objets posés sur le fond, que la pince peut attraper.
 * Le type d'objet dépend de la profondeur (table de loot pondérée).
 * Chaque objet est un groupe 3D dont `userData.pickup` renvoie vers ses données.
 */
export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.highlighted = null;
    this.rand = createRandom(WORLD.SEED + 101);
    this.spawnAll();
  }

  /**
   * Nouvelle plongée : le fond est repeuplé (tirage différent selon le jour),
   * et les fragments de mémoire pas encore trouvés sont reposés à leur place.
   */
  reset(seed, foundFragments = []) {
    for (const p of [...this.list]) this.dispose(p);
    this.list = [];
    this.highlighted = null;
    this.rand = createRandom(WORLD.SEED + 101 + seed * 7919);
    this.spawnAll();
    for (const f of fragmentsData.fragments) {
      if (!foundFragments.includes(f.id)) this.spawnFragment(f);
    }
  }

  /** Pose un objet tiré au sort selon la profondeur du fond en (x, z) */
  spawnRandom(x, z) {
    return this.spawn(rollItem(-getFloorHeight(x, z), this.rand), x, z);
  }

  spawnAll() {
    const B = WORLD.BOUNDS;
    const sp = SUBMARINE.SPAWN;
    // Près du départ, pour trouver vite de quoi ramasser
    for (let i = 0; i < PICKUPS.NEAR_SPAWN; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = 8 + this.rand() * PICKUPS.NEAR_RADIUS;
      this.spawnRandom(sp.x + Math.cos(a) * d, sp.z + Math.sin(a) * d);
    }
    // Zone par zone ; dans le canyon, la plupart tombent dans le lit
    for (const zone of zonesData.zones) {
      for (let i = 0; i < zone.pickups; i++) {
        const z = this.rand.range(Math.max(zone.zMin, B.minZ), Math.min(zone.zMax, B.maxZ));
        const x = zone.id === 'canyon' && this.rand() < 0.7
          ? canyonCenter(z) + this.rand.range(-25, 25)
          : this.rand.range(B.minX, B.maxX);
        this.spawnRandom(x, z);
      }
    }
    // Les épaves attirent les trouvailles
    for (const [wx, wz] of WRECK_SPOTS) {
      for (let i = 0; i < 4; i++) this.spawnRandom(wx + this.rand.range(-14, 14), wz + this.rand.range(-14, 14));
    }
  }

  /** Fragment de mémoire : un objet unique, à une place fixe */
  spawnFragment(f) {
    const x = f.inCanyon ? canyonCenter(f.z) + f.x : f.x;
    const item = {
      id: `fragment_${f.id}`,
      fragmentId: f.id,
      fragment: true,
      name: f.name,
      description: f.description,
      rarity: 'souvenir',
      weight: 0.4,
      price: 0,
      shape: `keepsake_${f.art}`,
      color: '#ccd8cc',
    };
    return this.spawn(item, x, f.z);
  }

  /** Fragments encore au fond (pour l'appel de proximité) */
  get fragments() {
    return this.list.filter((p) => p.item.fragment);
  }

  /**
   * Pose un objet sur le fond en (x, z).
   * @param {object} item définition de l'objet
   */
  spawn(item, x, z) {
    const rarity = getRarity(item.rarity);
    const { object, materials } = createItemModel(item);
    object.rotation.y = this.rand() * Math.PI * 2;
    object.position.set(x, 0, z);
    object.updateMatrixWorld(true);
    // Le bas de la boîte englobante touche le sol
    const box = new THREE.Box3().setFromObject(object);
    object.position.y = getFloorHeight(x, z) - box.min.y - 0.05;
    const size = box.getSize(new THREE.Vector3());

    const pickup = {
      item,
      rarity,
      object,
      materials,
      weight: item.weight,
      radius: Math.max(size.x, size.y, size.z) * 0.5,
      glowColor: new THREE.Color(rarity.color),
      phase: this.rand() * Math.PI * 2,
      halo: null,
      pillar: null,
    };

    // Lueurs selon la rareté (le halo et la colonne ne sont pas raycastés)
    if (rarity.halo > 0) {
      pickup.halo = createHalo(rarity.color, rarity.halo);
      pickup.halo.raycast = () => {};
      pickup.halo.position.copy(object.position);
      this.scene.add(pickup.halo);
    }
    if (rarity.pillar > 0) {
      pickup.pillar = createPillar(rarity.color, rarity.pillar);
      pickup.pillar.raycast = () => {};
      pickup.pillar.position.copy(object.position);
      this.scene.add(pickup.pillar);
    }

    object.userData.pickup = pickup;
    this.scene.add(object);
    this.list.push(pickup);
    this.applyBaseGlow(pickup, 0);
    return pickup;
  }

  /** Lueur propre (couleur de rareté), légèrement pulsée */
  applyBaseGlow(pickup, time) {
    const g = pickup.rarity.glow;
    const k = g > 0 ? g * (0.75 + Math.sin(time * 2.2 + pickup.phase) * 0.25) : 0;
    for (const m of pickup.materials) m.emissive.copy(pickup.glowColor).multiplyScalar(k);
  }

  /** L'objet quitte le fond (il est dans la pince) : on coupe halo et colonne */
  detach(pickup) {
    const i = this.list.indexOf(pickup);
    if (i >= 0) this.list.splice(i, 1);
    if (this.highlighted === pickup) this.setHighlighted(null);
    this.removeGlow(pickup);
  }

  removeGlow(pickup) {
    for (const key of ['halo', 'pillar']) {
      const o = pickup[key];
      if (!o) continue;
      this.scene.remove(o);
      o.geometry?.dispose();
      o.material.dispose();
      pickup[key] = null;
    }
  }

  /** Supprime définitivement l'objet de la scène */
  dispose(pickup) {
    this.removeGlow(pickup);
    this.scene.remove(pickup.object);
    pickup.object.traverse((o) => o.geometry?.dispose());
    pickup.materials.forEach((m) => m.dispose());
  }

  /** Largue un objet de la soute : il retombe sur le fond sous le sous-marin */
  drop(item, position) {
    const a = this.rand() * Math.PI * 2;
    return this.spawn(item, position.x + Math.cos(a) * 2, position.z + Math.sin(a) * 2);
  }

  setHighlighted(pickup) {
    this.highlighted = pickup;
  }

  /** Objets 3D candidats au raycast : seulement ceux qui sont proches (performance) */
  objectsNear(position, radius = PICKUPS.NEAR_RENDER) {
    const r2 = radius * radius;
    const out = [];
    for (const p of this.list) if (p.object.position.distanceToSquared(position) < r2) out.push(p.object);
    return out;
  }

  update(time, viewer) {
    const hide2 = 130 * 130; // au-delà, le brouillard les rend invisibles : on ne les dessine pas
    const beacon2 = 260 * 260; // halos et colonnes servent de balises un peu plus loin
    for (const p of this.list) {
      const d2 = viewer ? p.object.position.distanceToSquared(viewer) : 0;
      p.object.visible = d2 < hide2;
      if (p.halo) p.halo.visible = d2 < beacon2;
      if (p.pillar) p.pillar.visible = d2 < beacon2;
      if (d2 > hide2) continue;
      if (p === this.highlighted) {
        // Surbrillance chaude de l'objet visé
        const k = 0.35 + Math.sin(time * 7) * 0.15;
        for (const m of p.materials) m.emissive.copy(HIGHLIGHT).multiplyScalar(k);
      } else if (p.rarity.glow > 0) {
        this.applyBaseGlow(p, time);
      } else {
        for (const m of p.materials) m.emissive.setRGB(0, 0, 0);
      }
      if (p.halo) {
        const s = p.halo.userData.baseSize * (0.85 + Math.sin(time * 1.7 + p.phase) * 0.15);
        p.halo.scale.setScalar(s);
      }
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
