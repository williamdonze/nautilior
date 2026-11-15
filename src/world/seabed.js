import * as THREE from 'three';
import { SEABED, WORLD } from '../config/settings.js';
import { createNoise2D } from './noise.js';
import { smoothstep, clamp } from '../core/utils.js';
import { applyDetail } from './detail.js';

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
  const base = -depth + relief + ridges + detail;
  // Les bords du monde sont de vraies falaises qui montent jusqu'au-dessus de la surface :
  // barrière naturelle, pas de mur invisible. Leur tracé ondule, avec des replats.
  const wx = noise(z * 0.016, 7.7) * 12 + noise(z * 0.06, 2.2) * 5;
  const wz = noise(x * 0.02, 3.3) * 10;
  const e = Math.max(
    smoothstep(152 + wx, 180 + wx, Math.abs(x)),
    smoothstep(-1122 + wz, -1152 + wz, z),
    smoothstep(170 + wz, 198 + wz, z)
  );
  if (e <= 0) return base;
  const step = Math.floor(e * 5) / 5, f = e * 5 - Math.floor(e * 5);
  const terr = step + smoothstep(0.55, 1, f) / 5; // gradins : replats puis ressauts
  const k = e * 0.45 + terr * 0.55;
  return base + (8 - base) * k + noise(x * 0.05, z * 0.05 + 40) * 6 * e * (1 - e);
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
  // Normales lisses et couleur par sommet : le relief fin vient de la texture de détail
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color(), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    floorColor(p, n, tmp);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Fond marin complet (groupe de morceaux, chacun écarté du rendu s'il est hors champ) */
export function createSeabed() {
  const group = new THREE.Group();
  group.name = 'seabed';
  const mat = applyDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'sand', 1);
  for (let z = SEABED.Z_START; z > SEABED.Z_END; z -= SEABED.CHUNK_LENGTH) {
    const z1 = Math.max(SEABED.Z_END, z - SEABED.CHUNK_LENGTH);
    const chunk = new THREE.Mesh(createChunk(z, z1), mat);
    chunk.receiveShadow = true;
    group.add(chunk);
  }
  return group;
}
