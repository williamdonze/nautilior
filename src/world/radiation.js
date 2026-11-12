import * as THREE from 'three';
import { RADIATION } from '../config/settings.js';
import { clamp } from '../core/utils.js';
import { getFloorHeight } from './seabed.js';
import { createHalo } from '../loot/glow.js';

/**
 * Zone de radiation : une énergie surnaturelle qui suinte du point le plus profond.
 * (Provisoire : en phase 6, la source sera le portail au fond des abysses.)
 */
const source = new THREE.Vector3(
  RADIATION.SOURCE.x,
  getFloorHeight(RADIATION.SOURCE.x, RADIATION.SOURCE.z) + 4,
  RADIATION.SOURCE.z
);

/** Niveau de radiation en un point : 0 (hors zone) à 1 (au cœur) */
export function getRadiation(position) {
  const t = clamp(1 - position.distanceTo(source) / RADIATION.RADIUS, 0, 1);
  return t * Math.sqrt(t); // monte doucement en bordure, fort au centre
}

/** Lueur verdâtre au fond : halo + lumière qui teinte les rochers alentour */
export function createRadiationSource(scene) {
  const group = new THREE.Group();
  group.position.copy(source);

  const light = new THREE.PointLight(RADIATION.COLOR, 40, 70, 1.2);
  group.add(light);

  const halo = createHalo(RADIATION.COLOR, 26);
  halo.raycast = () => {};
  group.add(halo);
  const core = createHalo('#e8ece2', 5);
  core.raycast = () => {};
  group.add(core);

  scene.add(group);
  return {
    position: source,
    update(time, viewer) {
      // Respiration lente et irrégulière
      const pulse = 0.75 + Math.sin(time * 0.9) * 0.15 + Math.sin(time * 2.3) * 0.1;
      light.intensity = 40 * pulse;
      // Le halo n'est perceptible qu'en approchant (il n'est pas soumis au brouillard)
      const d = viewer.distanceTo(source);
      const near = clamp(1 - (d - 30) / 120, 0, 1);
      halo.material.opacity = 0.35 * near * pulse;
      core.material.opacity = 0.6 * near * pulse;
      halo.scale.setScalar(26 * (0.9 + pulse * 0.15));
    },
  };
}
