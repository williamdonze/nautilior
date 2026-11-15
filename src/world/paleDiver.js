import * as THREE from 'three';
import { createCharacter } from '../port/characters.js';
import { createHalo } from '../loot/glow.js';
import { getFloorHeight } from './seabed.js';

/**
 * Le plongeur pâle : une silhouette en combinaison, lampe frontale allumée, qu'on aperçoit au loin.
 * Il n'attaque jamais et ne s'approche jamais. Il attend, tend le bras vers le souvenir manquant
 * le plus proche, et s'efface quand on vient vers lui. (C'est Yann : voir docs/LORE.md, section 5.)
 * Il n'apparaît qu'à partir de l'acte II, et de plus en plus souvent en descendant.
 */
const SHOW_DIST = 46, VANISH_DIST = 20;

export class PaleDiver {
  constructor(scene) {
    const pale = '#c9d6d2';
    const c = (this.character = createCharacter({ coat: pale, legs: pale, skin: '#dfe8e4', hair: pale, eyes: '#8fa8a2', hairStyle: 'short' }));
    const g = (this.object = new THREE.Group());
    g.add(c.object);
    // Bouteille dans le dos, masque, lampe frontale
    const grey = new THREE.MeshLambertMaterial({ color: '#8f9c98' });
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 6, 12), grey);
    tank.position.set(0, 1.22, -0.17);
    c.body.add(tank);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.065, 0.05), new THREE.MeshLambertMaterial({ color: '#2a3432' }));
    mask.position.set(0, 0.018, 0.105);
    c.head.add(mask);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: '#f4fff4' }));
    lamp.position.set(0, 0.11, 0.1);
    c.head.add(lamp);
    this.halo = createHalo('#dff5e8', 2.6);
    this.halo.position.set(0, 1.8, 0.2);
    g.add(this.halo);
    this.light = new THREE.PointLight('#dff5e8', 6, 14, 1.3);
    this.light.position.set(0, 1.8, 0.6);
    g.add(this.light);
    g.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    g.visible = false;
    g.userData.fade = 0;
    scene.add(g);
    this.fade = 0;
    this.present = false;
    this.cooldown = 25;
    this.target = new THREE.Vector3();
  }

  /** Nouvelle plongée */
  reset() {
    this.present = false;
    this.fade = 0;
    this.object.visible = false;
    this.cooldown = 20 + Math.random() * 20;
  }

  /**
   * @param {THREE.Vector3[]} missing positions des souvenirs encore au fond
   * @param {number} found nombre de souvenirs déjà retrouvés
   */
  update(dt, time, sub, missing, found) {
    const g = this.object;
    if (!this.present) {
      this.fade = Math.max(0, this.fade - dt / 2.5);
      this.cooldown -= dt;
      // Acte II et au-delà ; plus on a retrouvé de souvenirs, plus il revient vite
      if (this.cooldown <= 0 && found >= 2 && missing.length && sub.depth > 60) {
        let best = null, bd = Infinity;
        for (const p of missing) { const d = p.distanceTo(sub.position); if (d < bd) { bd = d; best = p; } }
        // il se tient sur le chemin, entre le sous-marin et le souvenir, à la limite de la vue
        const dir = new THREE.Vector3().subVectors(best, sub.position);
        dir.y = 0;
        if (dir.lengthSq() > 1) {
          dir.normalize();
          const d = Math.min(SHOW_DIST, bd * 0.7);
          const x = sub.position.x + dir.x * d, z = sub.position.z + dir.z * d;
          g.position.set(x, Math.max(getFloorHeight(x, z) + 2.2, Math.min(-6, sub.position.y - 1)), z);
          this.target.copy(best);
          this.present = d > VANISH_DIST + 6;
          this.wait = 0;
        }
        if (!this.present) this.cooldown = 8;
      }
    } else {
      this.fade = Math.min(1, this.fade + dt / 4);
      this.wait += dt;
      const dist = g.position.distanceTo(sub.position);
      // on approche, ou on l'a assez vu : il s'efface
      if (dist < VANISH_DIST || dist > 90 || this.wait > 40) {
        this.present = false;
        this.cooldown = Math.max(14, 70 - found * 7) * (0.7 + Math.random() * 0.6);
      }
    }
    g.visible = this.fade > 0.01;
    if (!g.visible) return;
    g.userData.fade = this.fade;
    // Tourné vers le sous-marin, il flotte, un bras tendu vers le souvenir
    const c = this.character;
    g.rotation.y = Math.atan2(sub.position.x - g.position.x, sub.position.z - g.position.z);
    g.position.y += Math.sin(time * 0.8) * 0.004;
    c.object.rotation.x = 0.12 + Math.sin(time * 0.6) * 0.03;
    const to = this.target.clone().sub(g.position);
    const yawTo = Math.atan2(to.x, to.z) - g.rotation.y, pitch = Math.atan2(-to.y, Math.hypot(to.x, to.z));
    // bras droit tendu vers la cible (repère du personnage), l'autre le long du corps
    c.arms[1].rotation.set(-Math.PI / 2 + pitch, 0, -Math.sin(yawTo) * 1.1);
    c.arms[0].rotation.x = Math.sin(time * 0.7) * 0.1;
    this.halo.material.opacity = 0.55 * this.fade * (0.85 + 0.15 * Math.sin(time * 5.8));
    this.light.intensity = 6 * this.fade;
  }
}
