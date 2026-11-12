import * as THREE from 'three';
import { SEABED, WORLD } from '../config/settings.js';
import { createNoise2D } from './noise.js';
import { paintFaces, smoothstep } from '../core/utils.js';

const noise = createNoise2D(WORLD.SEED);

/**
 * Hauteur du fond marin en (x, z). Source unique de vérité :
 * utilisée pour la géométrie, les collisions et le placement du décor.
 */
export function getFloorHeight(x, z) {
  // Plateau de départ puis pente qui plonge vers -z
  const descent = Math.max(0, -z - SEABED.SLOPE_START);
  const base = -SEABED.BASE_DEPTH - descent * SEABED.SLOPE;
  // Relief doux
  const relief = noise.fbm(x * 0.011, z * 0.011, 4) * SEABED.AMPLITUDE;
  // Crêtes de granit (bruit « ridged »)
  const r = 1 - Math.abs(noise(x * 0.018 + 57, z * 0.018 - 31));
  const ridges = r * r * r * SEABED.RIDGE_AMPLITUDE;
  // Petits détails
  const detail = noise(x * 0.08, z * 0.08) * 0.8;
  return base + relief + ridges + detail;
}

// Couleurs (sRGB, converties automatiquement en linéaire par THREE.Color)
const SAND = [new THREE.Color('#6f7a6e'), new THREE.Color('#5d6a60'), new THREE.Color('#7d8476')];
const SILT_DEEP = new THREE.Color('#3d4a4a');
const GRANITE = [new THREE.Color('#4a4f50'), new THREE.Color('#5c6061'), new THREE.Color('#3a3e40')];
const MOSS = new THREE.Color('#3f5a3c');

export function createSeabed() {
  let geo = new THREE.PlaneGeometry(SEABED.WIDTH, SEABED.LENGTH, SEABED.SEGMENTS_X, SEABED.SEGMENTS_Z);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, SEABED.CENTER_Z);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getFloorHeight(x, z));
  }

  // Non indexé : chaque triangle a sa propre normale → flat shading net
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  const tmp = new THREE.Color();
  paintFaces(geo, (center, normal) => {
    const steep = 1 - normal.y; // 0 = plat, 1 = vertical
    const n = noise(center.x * 0.05, center.z * 0.05) * 0.5 + 0.5;
    const pick = Math.floor(n * 2.999);
    if (steep > 0.18) {
      tmp.copy(GRANITE[pick]);
    } else {
      tmp.copy(SAND[pick]);
      // Mousse / herbiers sur le plateau peu profond
      const moss = smoothstep(0.55, 0.8, noise(center.x * 0.03 + 9, center.z * 0.03)) * smoothstep(-90, -40, center.y);
      tmp.lerp(MOSS, moss * 0.8);
    }
    // Le fond devient plus vaseux et sombre en profondeur
    tmp.lerp(SILT_DEEP, smoothstep(-40, -180, center.y) * 0.6);
    return tmp;
  });

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'seabed';
  return mesh;
}
