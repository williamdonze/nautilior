import * as THREE from 'three';
import { AIR_BELLS, LAYOUT } from '../config/settings.js';
import { getFloorHeight, tunnelSection } from './seabed.js';
import { createHalo } from '../loot/glow.js';

/**
 * Cloches à air : de vieilles cloches de plongée en bronze, ancrées au fond par une chaîne,
 * avec une lampe allumée dessous. On vient s'y coller pour refaire le plein d'air.
 * (Dans la chambre : les moments où le respirateur prend le relais et où Loïc respire mieux.)
 */
export class AirBells {
  constructor(scene, colliders = []) {
    const bronze = new THREE.MeshLambertMaterial({ color: '#8a6a3a', side: THREE.DoubleSide });
    bronze.userData.detail = 'metal';
    const dark = new THREE.MeshLambertMaterial({ color: '#2a2622' });
    // profil de la cloche (ouverte en bas), cerclages, anneau de levage
    const prof = [[1.5, 0], [1.55, 0.25], [1.45, 0.9], [1.25, 1.9], [0.85, 2.7], [0.3, 3.05], [0.02, 3.1]].map(([r, y]) => new THREE.Vector2(r, y));
    const dome = new THREE.LatheGeometry(prof, 36);
    this.spots = [];
    // une cloche à mi-parcours de chaque tunnel, dans l'axe
    const inTunnels = LAYOUT.TUNNELS.map((t) => { const z = (t.z0 + t.z1) / 2; return [tunnelSection(t, z).x, z]; });
    for (const [x, z] of [...AIR_BELLS.SPOTS, ...inTunnels]) {
      const floor = getFloorHeight(x, z), y = floor + 6;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.add(new THREE.Mesh(dome, bronze));
      for (const [r, h] of [[1.56, 0.12], [1.3, 1.75]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 36).rotateX(Math.PI / 2), dark); ring.position.y = h; g.add(ring); }
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 18), dark);
      eye.position.y = 3.25;
      g.add(eye);
      // hublots
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, w = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshBasicMaterial({ color: '#f2e6b8' })); w.position.set(Math.cos(a) * 1.36, 1.3, Math.sin(a) * 1.36); w.rotation.y = Math.PI / 2 - a; g.add(w); }
      // chaîne jusqu'au fond, lest
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), dark);
      chain.position.y = -3;
      g.add(chain);
      const weight = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 1.1), dark);
      weight.position.y = -5.8;
      g.add(weight);
      // lampe sous la cloche : on la voit de loin dans le noir
      const light = new THREE.PointLight('#f2e6b8', 10, 22, 1.2);
      light.position.y = 0.4;
      g.add(light);
      const halo = createHalo('#f2e6b8', 5);
      halo.position.y = 0.6;
      g.add(halo);
      g.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      scene.add(g);
      colliders.push({ x, y: y + 1.6, z, r: 1.5 });
      this.spots.push({ x, y, z, group: g, halo, light, phase: x });
    }
  }

  /** @returns {boolean} true si le sous-marin est sous une cloche (l'air se renouvelle) */
  update(dt, time, sub, survival) {
    let at = false;
    for (const b of this.spots) {
      const d = Math.hypot(sub.position.x - b.x, sub.position.y - b.y, sub.position.z - b.z);
      b.group.rotation.z = Math.sin(time * 0.5 + b.phase) * 0.03;
      const near = d < AIR_BELLS.RADIUS;
      b.light.intensity = 10 + (near ? 8 : 0) + Math.sin(time * 2 + b.phase) * 1.5;
      b.halo.material.opacity = 0.5 + (near ? 0.3 : 0);
      if (near) {
        at = true;
        survival.oxygen = Math.min(survival.stats.oxygenMax, survival.oxygen + (AIR_BELLS.REFILL + 1) * dt);
      }
    }
    return at;
  }
}
