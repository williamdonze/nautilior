import * as THREE from 'three';
import { getPockets } from './roof.js';
import { createHalo, createPillar } from '../loot/glow.js';

/**
 * Poches d'air : là où la voûte se creuse en coupole, l'eau a une surface, et de l'air au-dessus.
 * On y monte, on crève la surface, on respire. Une lueur en tombe : on les repère de loin.
 * Dans chaque caverne, la plus grande est un PUITS : une chaîne et un crochet pendent de la voûte,
 * au bout d'un treuil. C'est par là qu'on remonte le Nautiliar au village, soute comprise, et qu'on le redescend.
 * (Dans la chambre : les moments où Loïc respire seul.)
 */
export class AirPockets {
  constructor(scene) {
    this.spots = [];
    const iron = new THREE.MeshLambertMaterial({ color: '#2c2a26' });
    iron.userData.detail = 'metal';
    for (const p of getPockets()) {
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      const color = p.camp ? '#ffe2a8' : '#cfeee6';
      // la surface, vue d'en dessous : un disque de lumière qui tremble
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.9, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(p.camp ? 1.5 : 1.1), side: THREE.DoubleSide }));
      const rim = new THREE.Mesh(new THREE.RingGeometry(p.r * 0.86, p.r * 0.93, 56).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rim.position.y = -0.1;
      // la lueur qui descend dans l'eau
      const shaft = createPillar(color, 60);
      shaft.rotation.x = Math.PI; // vers le bas
      shaft.scale.set(p.r * 1.4, 1, p.r * 1.4);
      shaft.material.uniforms.uOpacity.value = p.camp ? 0.5 : 0.32;
      const halo = createHalo(color, p.r * 3.2);
      halo.position.y = -2;
      const light = new THREE.PointLight(color, p.camp ? 30 : 18, p.camp ? 90 : 60, 1.1);
      light.position.y = -5;
      g.add(disc, rim, shaft, halo, light);
      if (p.camp) {
        // le treuil : une chaîne qui pend de la voûte, un crochet, une lanterne
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 16, 6), iron);
        chain.position.set(0, -4, 0);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 20, Math.PI * 1.45), iron);
        hook.position.set(0, -12.6, 0);
        hook.rotation.z = Math.PI * 0.8;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd98a' }));
        lamp.position.set(0.5, -11.2, 0);
        // une cage de fer autour : la nacelle du treuil
        const cage = new THREE.Group();
        cage.position.y = -9;
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4, b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.4, 5), iron); b.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); b.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); cage.add(b); }
        g.add(chain, hook, lamp, cage);
      }
      g.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
      scene.add(g);
      this.spots.push({ x: p.x, y: p.y, z: p.z, r: p.r, camp: p.camp ?? 0, group: g, disc, rim, light, halo, phase: p.x * 0.1 });
    }
  }

  /** @returns {object|null} la poche où le sous-marin est en surface (il respire), sinon null */
  update(dt, time, sub) {
    let at = null;
    for (const b of this.spots) {
      const far = Math.abs(sub.position.z - b.z) > 420;
      b.group.visible = !far;
      if (far) continue;
      const k = 0.85 + 0.15 * Math.sin(time * 1.7 + b.phase);
      b.light.intensity = (b.camp ? 30 : 18) * k;
      b.halo.material.opacity = 0.5 * k;
      b.rim.scale.setScalar(1 + Math.sin(time * 0.9 + b.phase) * 0.02);
      if (sub.pocket && sub.pocket.x === b.x && sub.pocket.z === b.z && sub.atAir) at = b;
    }
    return at;
  }
}
