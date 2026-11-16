import * as THREE from 'three';
import { SEABED, WORLD, LAYOUT } from '../config/settings.js';
import { createNoise2D } from './noise.js';
import { smoothstep, clamp } from '../core/utils.js';
import { applyDetail } from './detail.js';

const noise = createNoise2D(WORLD.SEED);

const { BASINS, TUNNELS } = LAYOUT;
const lerp = (a, b, t) => a + (b - a) * t;

/** Centre du lit du canyon (il serpente) */
export function canyonCenter(z) {
  return Math.sin(z * 0.009) * SEABED.CANYON.meander;
}

/** Masque du canyon : 1 au fond du lit, 0 sur le plateau */
function canyonMask(x, z) {
  const C = SEABED.CANYON;
  if (z > C.zStart + 40 || z < C.zEnd - 40) return 0;
  const along = smoothstep(C.zStart + 40, C.zStart - 30, z) * smoothstep(C.zEnd - 40, C.zEnd + 30, z);
  const w = C.halfWidth * (0.8 + 0.4 * (noise(z * 0.01, 3.3) * 0.5 + 0.5));
  const d = Math.abs(x - canyonCenter(z)) + noise(x * 0.05, z * 0.05) * 6;
  return (1 - smoothstep(w * 0.45, w, d)) * along;
}

/** Profondeur du plateau en z : pente douce dans chaque bassin ; entre deux bassins, on raccorde (la barre couvre) */
export function plateauDepth(z) {
  if (z >= BASINS[0].z0) return BASINS[0].d0;
  for (let i = 0; i < BASINS.length; i++) {
    const b = BASINS[i];
    if (z >= b.z1) {
      if (z <= b.z0) return lerp(b.d0, b.d1, (b.z0 - z) / (b.z0 - b.z1));
      const p = BASINS[i - 1];
      return lerp(p.d1, b.d0, smoothstep(p.z1, b.z0, z));
    }
  }
  return BASINS[BASINS.length - 1].d1;
}

/** Le tunnel qui passe en z (ou null) */
export function tunnelAt(z) {
  for (const t of TUNNELS) if (z < t.z0 + 70 && z > t.z1 - 70) return t;
  return null;
}

/**
 * Coupe d'un tunnel en z : son axe (x), son rayon, la hauteur de son sol.
 * Le tunnel descend régulièrement d'un bassin à l'autre, serpente, s'élargit en salles,
 * et (La Trachée) se resserre à intervalles réguliers en arceaux.
 */
const _sec = { x: 0, r: 0, y: 0, s: 0 };
export function tunnelSection(t, z) {
  const s = (t.z0 - z) / (t.z0 - t.z1), sc = Math.max(0, Math.min(1, s));
  let r = t.r * (1 + 0.12 * noise(z * 0.021, t.r));
  for (const [at, rr] of t.rooms) r += (rr - t.r) * Math.exp(-Math.pow(((s - at) * (t.z0 - t.z1)) / (rr * 1.3), 2));
  if (t.ribs) r *= 1 - 0.16 * Math.pow(Math.max(0, Math.cos((z / t.ribs) * Math.PI * 2)), 8);
  // les bouches s'évasent
  r *= 1 + 0.35 * (Math.exp(-Math.pow((sc * (t.z0 - t.z1)) / 40, 2)) + Math.exp(-Math.pow(((1 - sc) * (t.z0 - t.z1)) / 40, 2)));
  _sec.x = lerp(t.x0, t.x1, sc) + Math.sin(sc * Math.PI * t.waves) * t.sway * Math.pow(Math.sin(sc * Math.PI), 0.5);
  _sec.r = r;
  _sec.y = -lerp(t.d0, t.d1, sc * sc * (3 - 2 * sc));
  _sec.s = s;
  return _sec;
}
// profondeur des bouches = celle des bassins qu'elles relient (au fond de la gorge pour le Canyon)
TUNNELS.forEach((t, i) => { t.d0 = BASINS[i].d1 + (i === 2 ? SEABED.CANYON.depth * 0.8 : 0); t.d1 = BASINS[i + 1].d0; });

/**
 * Hauteur du terrain SANS les tunnels : bassins, gorge du Canyon, barres rocheuses, falaises du bord du monde.
 * C'est aussi le dessus de la roche au-dessus d'un tunnel (voir world/roof.js).
 */
export function surfaceHeight(x, z) {
  const depth = plateauDepth(z) + SEABED.CANYON.depth * canyonMask(x, z);
  // Relief : plus marqué dans le canyon, plus lisse dans les abysses
  const roughness = z < BASINS[3].z0 + 40 ? 0.6 : z < BASINS[2].z0 + 20 && z > BASINS[2].z1 - 20 ? 1.5 : 1;
  const relief = noise.fbm(x * 0.011, z * 0.011, 4) * SEABED.AMPLITUDE * roughness;
  const r = 1 - Math.abs(noise(x * 0.018 + 57, z * 0.018 - 31));
  const ridges = r * r * r * SEABED.RIDGE_AMPLITUDE * roughness;
  const detail = noise(x * 0.08, z * 0.08) * 0.8;
  // la cuvette du lac, au cœur de la Salle
  const SL = LAYOUT.SALLE, bowl = z < SL.z + 60 && z > SL.z - 60 ? 6.5 * (1 - smoothstep(14, 34, Math.hypot(x - SL.x, z - SL.z))) : 0;
  const base = -depth + relief + ridges + detail - bowl;
  // Les bords du monde et les barres entre bassins sont de vraies falaises qui montent au-dessus de la surface.
  const wx = noise(z * 0.016, 7.7) * 12 + noise(z * 0.06, 2.2) * 5;
  const wz = noise(x * 0.02, 3.3) * 10 + noise(x * 0.07, 9.1) * 4;
  let e = Math.max(
    smoothstep(152 + wx, 180 + wx, Math.abs(x)),
    smoothstep(SEABED.Z_END + 68 + wz, SEABED.Z_END + 38 + wz, z),
    smoothstep(170 + wz, 198 + wz, z)
  );
  for (const t of TUNNELS) if (z < t.z0 + 30 && z > t.z1 - 30) e = Math.max(e, smoothstep(t.z0 + wz, t.z0 - 34 + wz, z) * smoothstep(t.z1 - wz, t.z1 + 34 - wz, z));
  if (e <= 0) return base;
  const step = Math.floor(e * 5) / 5, f = e * 5 - Math.floor(e * 5);
  const terr = step + smoothstep(0.55, 1, f) / 5; // gradins : replats puis ressauts
  const k = e * 0.45 + terr * 0.55;
  return base + (8 - base) * k + noise(x * 0.05, z * 0.05 + 40) * 6 * e * (1 - e);
}

/** Sol d'un tunnel en (x, z), ou null hors du tunnel : une cuvette douce, un peu de relief */
function tunnelFloor(x, z) {
  const t = tunnelAt(z);
  if (!t) return null;
  const c = tunnelSection(t, z), q = (x - c.x) / (c.r * 1.2);
  if (q <= -1 || q >= 1 || c.s < -0.14 || c.s > 1.14) return null;
  return c.y + c.r * 0.34 * q * q + noise(x * 0.07, z * 0.07) * 1.1 + noise.fbm(x * 0.02, z * 0.02, 3) * 2.2;
}

/**
 * Hauteur du fond marin en (x, z). Source unique de vérité : géométrie, collisions et placement du décor.
 * Dans un tunnel, c'est le sol du tunnel (la roche qui le couvre est décrite par world/roof.js).
 */
export function getFloorHeight(x, z) {
  const s = surfaceHeight(x, z);
  if (z > TUNNELS[0].z0 + 70) return s;
  const f = tunnelFloor(x, z);
  return f !== null && f < s ? f : s;
}

/**
 * Garde un point dans l'eau : sous une barre rocheuse, il n'y a d'eau que dans le tunnel.
 * (Les bêtes s'en servent pour ne pas nager dans la roche.)
 */
export function confine(p) {
  const t = tunnelAt(p.z);
  if (!t || surfaceHeight(p.x, p.z) < -6) return;
  const c = tunnelSection(t, p.z), lim = c.r * 0.8, dx = p.x - c.x;
  if (Math.abs(dx) > lim) p.x = c.x + Math.sign(dx) * lim;
  p.y = Math.max(c.y + 2.5, Math.min(c.y + c.r * 1.05, p.y));
}

/**
 * Hauteur du fond TEL QU'IL EST DESSINÉ : le maillage a des mailles de SEABED.CELL mètres, et entre
 * deux sommets il est plat. Un petit objet posé à la hauteur exacte du relief peut donc se retrouver
 * enterré sous le maillage (ou flotter au-dessus). Tout ce qui doit se VOIR posé sur le fond utilise
 * cette fonction ; les collisions gardent getFloorHeight.
 */
export function meshFloorHeight(x, z) {
  const C = SEABED.CELL, ox = -SEABED.WIDTH / 2;
  const i = Math.floor((x - ox) / C), j = Math.floor(z / C);
  const x0 = ox + i * C, z0 = j * C, u = (x - x0) / C, v = (z - z0) / C;
  const ha = getFloorHeight(x0, z0), hb = getFloorHeight(x0, z0 + C), hc = getFloorHeight(x0 + C, z0 + C), hd = getFloorHeight(x0 + C, z0);
  // même découpe en deux triangles que THREE.PlaneGeometry (diagonale b–d)
  return u + v <= 1 ? ha + u * (hd - ha) + v * (hb - ha) : hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc);
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
    out.lerp(SICK, smoothstep(-3650, -3930, center.z) * 0.6 * (n > 0.6 ? 1 : 0.4));
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
