import * as THREE from 'three';
import { SEABED, WORLD } from '../config/settings.js';
import { createNoise2D } from './noise.js';
import { paintFaces, smoothstep, clamp } from '../core/utils.js';

const noise = createNoise2D(WORLD.SEED);

/** Interpolation douce d'une liste de points [z, profondeur] (z décroissant) */
function sampleProfile(points, z) {
  if (z >= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [z0, d0] = points[i];
    const [z1, d1] = points[i + 1];
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1);
      return d0 + (d1 - d0) * (t * t * (3 - 2 * t));
    }
  }
  return points[points.length - 1][1];
}

/** Centre du lit du canyon (il serpente) */
export function canyonCenter(z) {
  return Math.sin(z * 0.009) * SEABED.CANYON.meander;
}

/** Masque du canyon : 1 au fond du lit, 0 sur les plateaux */
function canyonMask(x, z) {
  const C = SEABED.CANYON;
  if (z > C.zStart + 40 || z < C.zEnd - 40) return 0;
  // La largeur s'ouvre en entrant et en sortant du canyon
  const along = smoothstep(C.zStart + 40, C.zStart - 30, z) * smoothstep(C.zEnd - 40, C.zEnd + 20, z);
  const w = C.halfWidth * (0.8 + 0.4 * (noise(z * 0.01, 3.3) * 0.5 + 0.5));
  const d = Math.abs(x - canyonCenter(z)) + noise(x * 0.05, z * 0.05) * 6;
  return (1 - smoothstep(w * 0.45, w, d)) * along;
}

/**
 * Hauteur du fond marin en (x, z). Source unique de vérité :
 * géométrie, collisions et placement du décor.
 */
export function getFloorHeight(x, z) {
  const floor = sampleProfile(SEABED.PROFILE, z);
  const rim = z <= SEABED.RIM[0][0] ? sampleProfile(SEABED.RIM, z) : floor;
  const mask = canyonMask(x, z);
  const depth = rim + (floor - rim) * mask;

  // Relief : plus marqué dans le canyon (parois déchiquetées), plus lisse dans les abysses
  const roughness = z < -880 ? 0.6 : z < -545 ? 1.8 : 1;
  const relief = noise.fbm(x * 0.011, z * 0.011, 4) * SEABED.AMPLITUDE * roughness;
  const r = 1 - Math.abs(noise(x * 0.018 + 57, z * 0.018 - 31));
  const ridges = r * r * r * SEABED.RIDGE_AMPLITUDE * roughness;
  const detail = noise(x * 0.08, z * 0.08) * 0.8;
  // Les bords du monde remontent un peu (cuvette) pour cacher les limites
  const edge = smoothstep(150, 205, Math.abs(x)) * 40;
  return -depth + relief + ridges + detail + edge;
}

// Couleurs (sRGB, converties en linéaire par THREE.Color)
const SAND = [new THREE.Color('#6f7a6e'), new THREE.Color('#5d6a60'), new THREE.Color('#7d8476')];
const SILT = [new THREE.Color('#4a4f4a'), new THREE.Color('#545a52'), new THREE.Color('#40463f')];
const GRANITE = [new THREE.Color('#4a4f50'), new THREE.Color('#5c6061'), new THREE.Color('#3a3e40')];
const ABYSS = [new THREE.Color('#1f2629'), new THREE.Color('#262e30'), new THREE.Color('#1a2023')];
const MOSS = new THREE.Color('#3f5a3c');
const SICK = new THREE.Color('#2c4430');
const GRAVEL = new THREE.Color('#3f4240');
const SHELL_SAND = new THREE.Color('#9a968a');
const MUD = new THREE.Color('#2e2a24');

function floorColor(center, normal, out) {
  const steep = 1 - normal.y;
  const n = noise(center.x * 0.05, center.z * 0.05) * 0.5 + 0.5;
  const pick = Math.floor(n * 2.999);
  const depth = -center.y;
  if (steep > 0.18) out.copy(GRANITE[pick]);
  else if (depth < 150) {
    out.copy(SAND[pick]);
    const moss = smoothstep(0.55, 0.8, noise(center.x * 0.03 + 9, center.z * 0.03)) * smoothstep(-90, -40, center.y);
    out.lerp(MOSS, moss * 0.8);
  } else if (depth < 900) {
    out.copy(SILT[pick]);
    // Plaques de vase sombre et coulées de sable
    const g = noise(center.x * 0.05 - 13, center.z * 0.05 + 4);
    if (g > 0.4) out.lerp(MUD, 0.6);
    else if (g < -0.45) out.lerp(SAND[1], 0.4);
  }
  else {
    out.copy(ABYSS[pick]);
    // Vase maladive près du portail
    out.lerp(SICK, smoothstep(-860, -1060, center.z) * 0.6 * (n > 0.6 ? 1 : 0.4));
  }
  // Le fond s'assombrit avec la profondeur
  out.multiplyScalar(1 - clamp(depth / 1400, 0, 0.55));
  return out;
}

/** Un morceau de fond entre z0 et z1 */
function createChunk(z0, z1) {
  const length = z0 - z1;
  const segX = Math.round(SEABED.WIDTH / SEABED.CELL);
  const segZ = Math.round(length / SEABED.CELL);
  let geo = new THREE.PlaneGeometry(SEABED.WIDTH, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, getFloorHeight(pos.getX(i), pos.getZ(i)));
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const tmp = new THREE.Color();
  paintFaces(geo, (center, normal) => floorColor(center, normal, tmp));
  geo.computeBoundingSphere();
  return geo;
}

/** Fond marin complet (groupe de morceaux, chacun écarté du rendu s'il est hors champ) */
export function createSeabed() {
  const group = new THREE.Group();
  group.name = 'seabed';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (let z = SEABED.Z_START; z > SEABED.Z_END; z -= SEABED.CHUNK_LENGTH) {
    const z1 = Math.max(SEABED.Z_END, z - SEABED.CHUNK_LENGTH);
    group.add(new THREE.Mesh(createChunk(z, z1), mat));
  }
  return group;
}
