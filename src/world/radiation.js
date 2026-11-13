import * as THREE from 'three';
import { RADIATION } from '../config/settings.js';
import { clamp } from '../core/utils.js';
import { getFloorHeight } from './seabed.js';

/**
 * « Radiation » : la vie brute qui fuit par la déchirure du portail.
 * Pour un monde de morts, elle brûle (règle 4 de l'Envers) : elle use la coque
 * et a transformé les bêtes des abysses. Sa source est le centre de la déchirure.
 */
const source = new THREE.Vector3(
  RADIATION.SOURCE.x,
  getFloorHeight(RADIATION.SOURCE.x, RADIATION.SOURCE.z) + 22,
  RADIATION.SOURCE.z
);

/** Intensité globale (1 = portail ouvert, 0 = portail refermé) */
let scale = 1;
export function setRadiationScale(v) {
  scale = v;
}

/** Niveau de radiation en un point : 0 (hors zone) à 1 (au cœur) */
export function getRadiation(position) {
  const t = clamp(1 - position.distanceTo(source) / RADIATION.RADIUS, 0, 1);
  return t * Math.sqrt(t) * scale; // monte doucement en bordure, fort au centre
}

/** Lumière verte qui teinte la plaine autour de la déchirure (le halo est porté par le portail) */
export function createRadiationSource(scene) {
  const group = new THREE.Group();
  group.position.copy(source);

  const light = new THREE.PointLight(RADIATION.COLOR, 40, 90, 1.2);
  group.add(light);


  scene.add(group);
  return {
    position: source,
    update(time) {
      // Respiration lente et irrégulière
      const pulse = (0.75 + Math.sin(time * 0.9) * 0.15 + Math.sin(time * 2.3) * 0.1) * scale;
      light.intensity = 40 * pulse;
    },
  };
}
