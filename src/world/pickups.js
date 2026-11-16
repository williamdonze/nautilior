import { headroom, getRoof } from '../world/roof.js';
import { tunnelSection } from './seabed.js';
import { LAYOUT } from '../config/settings.js';
import * as THREE from 'three';
import { PICKUPS, SUBMARINE, WORLD } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { rollItem, getRarity, UNIQUE_ITEMS } from '../loot/loot.js';
import zonesData from '../config/zones.json';
import fragmentsData from '../story/fragments.json';
import { WRECK_SPOTS } from './landmarks.js';
import { canyonCenter, meshFloorHeight } from './seabed.js';
import { createItemModel } from '../loot/models.js';
import { createHalo, createPillar, createRing } from '../loot/glow.js';
import { getFloorHeight } from './seabed.js';

const HIGHLIGHT = new THREE.Color('#cdb57c');

/**
 * Objets posés sur le fond, que la pince peut attraper.
 * Le type d'objet dépend de la profondeur (table de loot pondérée).
 * Chaque objet est un groupe 3D dont `userData.pickup` renvoie vers ses données.
 */
export class Pickups {
  constructor(scene, colliders = []) {
    this.scene = scene;
    this.colliders = colliders;
    this.list = [];
    this.highlighted = null;
    this.rand = createRandom(WORLD.SEED + 101);
    this.spawnAll();
  }

  /**
   * Nouvelle plongée : le fond est repeuplé (tirage différent selon le jour),
   * et les fragments de mémoire pas encore trouvés sont reposés à leur place.
   */
  reset(seed, foundFragments = [], ownedIds = [], taken = []) {
    this.taken = new Set(taken);
    this.seedBase = WORLD.SEED + 5003 + seed * 104729;
    for (const p of [...this.list]) this.dispose(p);
    this.list = [];
    this.highlighted = null;
    this.rand = createRandom(WORLD.SEED + 101 + seed * 7919);
    this.spawnAll();
    for (const f of fragmentsData.fragments) {
      if (!foundFragments.includes(f.id)) this.spawnFragment(f);
    }
    // Objets uniques (cloche du Marie-Morgane, éclat vert) : toujours à leur place, sauf s'ils sont en soute
    for (const it of UNIQUE_ITEMS) {
      if (!ownedIds.includes(it.id)) this.spawn(it, it.spawn.x, it.spawn.z);
    }
  }

  /** Pose un objet tiré au sort selon la profondeur du fond en (x, z) */
  spawnRandom(x, z) {
    // Chaque emplacement a son numéro et son propre tirage : retirer un objet ne déplace pas les autres
    const index = this.counter++;
    if (this.taken?.has(index)) return null;
    if (headroom(x, z) < 3.5) return null; // sous un massif plein : rien à ramasser là
    const main = this.rand;
    this.rand = createRandom((this.seedBase ?? 1) + index * 131);
    const p = this.spawn(rollItem(-getFloorHeight(x, z), this.rand), x, z);
    this.rand = main;
    if (p) p.index = index;
    return p;
  }

  spawnAll() {
    this.counter = 0;
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
    // Dans les tunnels : le long de l'axe, de quoi récompenser la traversée
    for (const t of LAYOUT.TUNNELS) for (let i = 0; i < PICKUPS.PER_TUNNEL; i++) {
      const z = this.rand.range(t.z1 + 20, t.z0 - 20), c = tunnelSection(t, z), cx = c.x, r = c.r;
      this.spawnRandom(cx + this.rand.range(-0.7, 0.7) * r, z);
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
    // Jamais sous un rocher, un pilier ou une dalle : on glisse l'objet juste à côté
    for (let pass = 0; pass < 2; pass++) for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), R = c.r + 1.2;
      if (d < R && c.y - c.r < getFloorHeight(x, z) + 2.5) { const k = R / Math.max(d, 0.01); x = c.x + (d > 0.01 ? dx : 1) * k; z = c.z + dz * k; }
    }
    const rarity = getRarity(item.rarity);
    const { object, materials } = createItemModel(item);
    object.rotation.y = this.rand() * Math.PI * 2;
    object.position.set(x, 0, z);
    object.updateMatrixWorld(true);
    // Le bas de la boîte englobante touche le sol
    const box = new THREE.Box3().setFromObject(object);
    // posé sur le fond tel qu'il est dessiné (voir meshFloorHeight), à peine enfoncé
    object.position.y = Math.max(meshFloorHeight(x, z), getFloorHeight(x, z) - 0.25) - box.min.y - 0.03;
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

    // Contour blanc : il n'apparaît que de près, quand rien ne cache l'objet (voir mark)
    pickup.ring = createRing(Math.max(1.5, pickup.radius * 3.2 + 0.7));
    pickup.ring.position.copy(object.position);
    pickup.ring.position.y += size.y * 0.5 + 0.25;
    pickup.ring.visible = false;
    pickup.seen = 0;
    this.scene.add(pickup.ring);

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
    for (const key of ['halo', 'pillar', 'ring']) {
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

  /**
   * Contour blanc autour des objets proches que rien ne cache (ni le relief, ni un rocher, ni une épave).
   * @param {THREE.Vector3} eye position du sous-marin
   */
  mark(dt, time, eye) {
    this.markTimer = (this.markTimer ?? 0) - dt;
    const check = this.markTimer <= 0;
    if (check) this.markTimer = 0.3;
    const R2 = PICKUPS.MARK_RADIUS * PICKUPS.MARK_RADIUS;
    for (const p of this.list) {
      if (!p.ring) continue;
      const o = p.object.position, d2 = o.distanceToSquared(eye);
      if (d2 > R2 * 1.6) { if (p.seen > 0) { p.seen = 0; p.ring.visible = false; } p.clear = false; continue; }
      if (check) p.clear = d2 < R2 && !p.held && this.lineOfSight(eye, p.ring.position);
      p.seen = Math.max(0, Math.min(1, p.seen + (p.clear ? dt * 2.5 : -dt * 3)));
      p.ring.visible = p.seen > 0.01;
      if (p.ring.visible) p.ring.material.opacity = p.seen * (0.5 + 0.2 * Math.sin(time * 3 + p.phase));
    }
  }

  /** Rien entre a et b ? (relief, plafonds, rochers et épaves) */
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    const n = Math.max(3, Math.ceil(len / 2));
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (getFloorHeight(x, z) > y + 0.15) return false;
      const r = getRoof(x, z);
      if (r && y > r.c && y < r.t) return false;
    }
    for (const c of this.colliders) {
      // sphère contre segment (on ignore ce qui touche l'objet lui-même)
      const ex = c.x - a.x, ey = c.y - a.y, ez = c.z - a.z;
      const t = Math.max(0, Math.min(1, (ex * dx + ey * dy + ez * dz) / (len * len)));
      if (t > 0.9) continue;
      const px = a.x + dx * t - c.x, py = a.y + dy * t - c.y, pz = a.z + dz * t - c.z;
      if (px * px + py * py + pz * pz < c.r * c.r * 0.8) return false;
    }
    return true;
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
    const hide2 = 95 * 95; // au-delà, le brouillard les rend invisibles : on ne les dessine pas
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
      } else if (p.item.selfGlow) {
        // Objet qui luit de lui-même (l'éclat vert bat comme un cœur)
        const beat = Math.pow(Math.max(0, Math.sin(time * 3.4)), 8);
        const k = p.item.selfGlow * (0.55 + beat * 0.45);
        for (const m of p.materials) m.emissive.copy(p.glowColor).multiplyScalar(k);
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
