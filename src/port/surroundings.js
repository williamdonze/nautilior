import * as THREE from 'three';
import { createNoise2D } from '../world/noise.js';
import { applyDetail } from '../world/detail.js';

/**
 * Ce qui enferme Port-Kermor : une falaise en fer à cheval tout autour du village, ouverte
 * seulement sur la mer, et l'unique route qui en sort — par un tunnel, éboulé depuis toujours.
 * Barrière naturelle : on ne quitte pas le village.
 */
const noise = createNoise2D(9173);
const TAU = Math.PI * 2;
export const TUNNEL = { x: 19, z: -52 }; // bouche du tunnel, dans la paroi du fond
const HALF_X = 53, BACK_Z = -52, SEA_Z = 40;

/** Point du tracé au pied de la falaise (t de 0 à 1 : pointe ouest → fond → pointe est) et sa normale vers l'extérieur */
function path(t) {
  const a = t * Math.PI, c = Math.cos(a), s = Math.sin(a), e = 0.3;
  const x = -HALF_X * Math.sign(c) * Math.pow(Math.abs(c), e), z = SEA_Z - (SEA_Z - BACK_Z) * Math.pow(s, e);
  const n = new THREE.Vector2(x * 0.7, z + 6).normalize();
  return { x, z, nx: n.x, nz: n.y };
}

function cliffs(group) {
  const NS = 150, NH = 9, pos = [], col = [], idx = [];
  const grey = new THREE.Color('#5d5f5a'), brown = new THREE.Color('#57493a'), grass = new THREE.Color('#3f4a34'), c = new THREE.Color();
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, p = path(t);
    // la falaise s'abaisse vers les deux pointes, dans la mer
    const end = Math.min(1, Math.min(t, 1 - t) * 7);
    const H = (20 + (noise(t * 9, 1.3) * 0.5 + 0.5) * 12) * (0.25 + 0.75 * end);
    // paroi bien plane autour de la bouche du tunnel
    const calm = Math.min(1, Math.hypot(p.x - TUNNEL.x, p.z - TUNNEL.z) / 9);
    for (let j = 0; j <= NH + 1; j++) {
      const plateau = j > NH, v = Math.min(1, j / NH), y = v * H - 0.5;
      const bulge = (noise(t * 40 + 7, v * 3.5) * 2.4 + noise(t * 110, v * 9 + 3) * 0.8) * calm * (plateau ? 0 : 1);
      const out = v * v * 3.2 + bulge + (plateau ? 46 : 0);
      pos.push(p.x + p.nx * out, y + (plateau ? noise(t * 30, 5) * 2 : 0), p.z + p.nz * out);
      c.copy(grey).lerp(brown, noise(t * 14, v * 2 + 9) * 0.5 + 0.5).multiplyScalar(0.75 + 0.35 * v);
      if (v > 0.93) c.lerp(grass, 0.8);
      col.push(c.r, c.g, c.b);
    }
  }
  const W = NH + 2;
  for (let i = 0; i < NS; i++) for (let j = 0; j < W - 1; j++) {
    const a = i * W + j, b = a + W;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = applyDetail(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'rock', 0.6);
  group.add(new THREE.Mesh(geo, mat));
}

function tunnel(group, colliders) {
  const g = new THREE.Group();
  g.position.set(TUNNEL.x, 0, TUNNEL.z + 0.6);
  group.add(g);
  const stone = applyDetail(new THREE.MeshLambertMaterial({ color: '#6a6c66' }), 'stone', 1.2);
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  // Bouche : un trou noir, cerclé d'une voûte de pierre de taille
  add(new THREE.CircleGeometry(3.4, 28, 0, Math.PI).scale(1, 1.15, 1), new THREE.MeshBasicMaterial({ color: '#030405' }), 0, 0, 0.05);
  add(new THREE.PlaneGeometry(6.8, 1.2), new THREE.MeshBasicMaterial({ color: '#030405' }), 0, 0.3, 0.05);
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI, vous = add(new THREE.BoxGeometry(0.95, 0.75, 1.1), stone, Math.cos(a) * 3.75, Math.sin(a) * 4.3 + 0.2, 0.3);
    vous.rotation.z = a - Math.PI / 2;
  }
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(1, 1.2, 1.2), stone, s * 3.75, 0.3, 0.3);
  // Éboulis : blocs entassés jusqu'aux deux tiers de la voûte
  const rock = applyDetail(new THREE.MeshLambertMaterial({ color: '#77756c' }), 'rock', 1);
  const rgeo = [0, 1, 2].map((k) => {
    const geo = new THREE.IcosahedronGeometry(1, 2), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + noise(x * 1.7 + k * 9, y * 1.7 + z) * 0.28; p.setXYZ(i, x * d, y * d * 0.8, z * d); }
    geo.computeVertexNormals();
    return geo;
  });
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const y = Math.pow(rnd(), 1.6) * 3.2, w = 3.3 * (1 - y / 5.2), s = 0.55 + rnd() * 0.9 * (1 - y / 5);
    const m = add(rgeo[i % 3], rock, (rnd() * 2 - 1) * w, y + s * 0.3, 0.2 + rnd() * 2.6 * (1 - y / 4));
    m.scale.setScalar(s);
    m.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
  }
  // Barrière et panneau délavé
  const wood = applyDetail(new THREE.MeshLambertMaterial({ color: '#5a4630' }), 'wood', 1);
  for (const x of [-2.6, 2.6]) add(new THREE.BoxGeometry(0.16, 1.5, 0.16), wood, x, 0.75, 4.2);
  add(new THREE.BoxGeometry(5.6, 0.22, 0.08), wood, 0, 1.2, 4.2).rotation.z = 0.04;
  add(new THREE.BoxGeometry(5.6, 0.22, 0.08), wood, 0, 0.65, 4.2).rotation.z = -0.03;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const k = cv.getContext('2d');
  k.fillStyle = '#b9b4a4'; k.fillRect(0, 0, 256, 96);
  k.fillStyle = '#7a2a20'; k.font = 'bold 40px sans-serif'; k.textAlign = 'center';
  k.fillText('ROUTE BARRÉE', 128, 60);
  k.fillStyle = 'rgba(90, 80, 60, 0.35)';
  for (let i = 0; i < 40; i++) k.fillRect(rnd() * 256, rnd() * 96, rnd() * 50, 2 + rnd() * 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(1.9, 0.7), new THREE.MeshLambertMaterial({ map: tex }), 0, 1.75, 4.26).rotation.z = -0.06;
  add(new THREE.BoxGeometry(0.1, 0.7, 0.08), wood, 0, 1.45, 4.2);
  // La route qui y mène
  const road = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 26).rotateX(-Math.PI / 2), applyDetail(new THREE.MeshLambertMaterial({ color: '#34373a' }), 'stone', 2));
  road.position.set(TUNNEL.x, 0.02, TUNNEL.z + 13.5);
  group.add(road);
  colliders.push({ minX: TUNNEL.x - 3.4, maxX: TUNNEL.x + 3.4, minZ: TUNNEL.z - 1, maxZ: TUNNEL.z + 5 });
}

/** Ajoute falaises, tunnel éboulé et route au décor du port */
export function buildSurroundings(group, colliders) {
  cliffs(group);
  tunnel(group, colliders);
}
