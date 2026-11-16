import * as THREE from 'three';
import { createNoise2D } from './noise.js';
import { WORLD } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { getFloorHeight, canyonCenter } from './seabed.js';
import { applyDetail } from './detail.js';

/**
 * Éléments marquants de chaque zone :
 *  - Épaves : chalutiers et cargos naufragés ;
 *  - Canyon : aiguilles rocheuses et squelette de baleine ;
 *  - Abysses : tiges luminescentes qui ondulent.
 * Les grosses formes ajoutent des sphères de collision.
 */
const rand = createRandom(WORLD.SEED + 404);

/** Épaves : [x, z, taille] */
const WRECKS = [
  [55, -407, 0.5], [-40, -1079, 1], [70, -1230, 1.3], [-90, -1360, 0.9], [10, -1490, 1.5], [-50, -1598, 1.1], [110, -1663, 1], [-120, -1187, 0.8], [-95, -1130, 1.2], [95, -1420, 1.4], [-70, -1560, 1.0], [60, -1660, 1.6], [-110, -1010, 0.9], [120, -1210, 1.1],
];
/** Positions des épaves (pour y semer plus d'objets) */
export const WRECK_SPOTS = WRECKS.map(([x, z]) => [x, z]);
/** La Marie-Morgane : le chalutier dont les filets ont pris le Nautiliar. Elle repose dans le Canyon ; on y entre. */
export const MARIE = { z: -2604, dx: -10, size: 2.6 };
// Épaves : métal rouillé ; aiguilles du canyon : roche (détail triplanaire)
const vmat = applyDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'metal', 1.4);
const rockMat = applyDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'rock', 1);
const woodMat = applyDetail(new THREE.MeshLambertMaterial({ vertexColors: true }), 'wood', 1);

/** Peint une géométrie : base + taches de rouille */
function weathered(geo, base, rust = '#63321b', amount = 0.4) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rust), c = new THREE.Color();
  paintFaces(geo, () => (rand() < amount ? c.copy(r) : c.copy(b)).multiplyScalar(0.8 + rand() * 0.3));
  return geo;
}

const wnoise = createNoise2D(WORLD.SEED + 313);

/** Couleur par sommet : peinture écaillée, rouille en coulures, concrétions (surfaces lisses) */
function rusted(geo, base, rust, amount, seed = 0) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rust), dark = new THREE.Color('#1c1410'), c = new THREE.Color();
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const v = wnoise(x * 0.5 + seed, y * 0.9 + z * 0.4) * 0.5 + 0.5, drip = wnoise(x * 1.7 + z, seed + 3) * 0.5 + 0.5;
    c.copy(b).lerp(r, Math.max(0, Math.min(1, (v + drip * 0.3 - (1 - amount)) / 0.2))).lerp(dark, Math.max(0, wnoise(x * 0.23, z * 0.23 + seed)) * 0.5);
    c.multiplyScalar(0.85 + 0.3 * (wnoise(x * 3.1, y * 3.1 + z * 2.3) * 0.5 + 0.5));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Coque de navire lisse, le long de X (proue vers +X), pont à y = 0.
 * Des pans de bordé manquent (déchirures) : on voit les membrures à l'intérieur.
 * Renvoie { geo, half(t) } où half(t) est la demi-largeur à la position t (0 poupe … 1 proue).
 */
function shipHull(L, B, D, seed, breach = null) {
  const NT = 48, NA = 18;
  const half = (t) => (B / 2) * Math.pow(Math.min(1, (1 - t) * 3.2), 0.6) * Math.pow(Math.min(1, t * 9), 0.4);
  const sheer = (t) => D * 0.16 * Math.pow(Math.abs(2 * t - 1), 2.2);
  const pos = [], idx = [];
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, w = half(t), d = D * (0.55 + 0.45 * Math.min(1, w / (B * 0.4)));
    for (let k = 0; k <= NA; k++) {
      const a = (k / NA) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      // section en U qui se pince vers la quille
      pos.push((t - 0.5) * L, sheer(t) - Math.pow(sa, 0.75) * d, Math.sign(ca) * Math.pow(Math.abs(ca), 0.6) * w);
    }
  }
  for (let i = 0; i < NT; i++) for (let k = 0; k < NA; k++) {
    const t = i / NT;
    // déchirures : au milieu de la coque seulement, jamais sur la quille
    if (t > 0.18 && t < 0.86 && Math.abs(k - NA / 2) > 2 && wnoise(t * 7 + seed, k * 0.45 + seed) > 0.42) continue;
    if (breach && t > breach[0] && t < breach[1] && k >= breach[2] && k <= breach[3]) continue; // brèche : on entre par là
    const a = i * (NA + 1) + k, b = a + NA + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, half, sheer };
}

/** Une épave de chalutier ou de cargo : coque éventrée, membrures, passerelle, cheminée, mâts, bastingage */
function wreck(x, z, size, colliders, opts = {}) {
  const g = new THREE.Group();
  const floor = getFloorHeight(x, z);
  const L = 18 * size, B = 5 * size, D = 4 * size, seed = x * 0.37 + z * 0.11;
  g.position.set(x, floor + D * (opts.lift ?? 0.45), z);
  g.rotation.set(rand.range(-0.15, 0.15), rand() * Math.PI * 2, rand.range(0.2, 0.5));
  if (opts.rot) g.rotation.set(...opts.rot);
  if (opts.order) g.rotation.order = opts.order; // 'YZX' : cap, puis assiette (proue vers le bas), puis gîte
  const add = (geo, mat, px = 0, py = 0, pz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
  const steel = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  steel.userData.detail = 'metal';
  const dark = new THREE.MeshLambertMaterial({ color: '#1a1512' });
  const bar = (a, b, r, mat = dark) => {
    const va = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(va), len = dir.length();
    const m = add(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.position.copy(va).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  };

  const { geo: hull, half, sheer } = shipHull(L, B, D, seed, opts.breach);
  add(rusted(hull, '#3a4244', '#6a3a1e', 0.55, seed), steel);
  // Membrures : arceaux visibles par les déchirures
  for (let t = 0.1; t < 0.92; t += 0.055) {
    const w = half(t), d = D * (0.55 + 0.45 * Math.min(1, w / (B * 0.4)));
    const rib = new THREE.TorusGeometry(1, 0.035 / Math.max(0.3, w / B), 6, 20, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).scale(1, d * 0.96, w * 0.95);
    add(rib, dark, (t - 0.5) * L, sheer(t), 0);
  }
  // Pont : planches gondolées, panneau de cale béant
  const deck = new THREE.PlaneGeometry(L * 0.94, 1, 60, 8).rotateX(-Math.PI / 2);
  const dp = deck.attributes.position, di = [];
  for (let i = 0; i < dp.count; i++) {
    const t = dp.getX(i) / L + 0.5;
    dp.setZ(i, dp.getZ(i) * 2 * half(t) * 0.97);
    dp.setY(i, sheer(t) - 0.05 + wnoise(dp.getX(i) * 0.4 + seed, dp.getZ(i) * 0.5) * 0.12 * size);
  }
  for (let i = 0; i < deck.index.count; i += 3) {
    const a = deck.index.array[i], cx = dp.getX(a) / L, cz = dp.getZ(a);
    if ((cx > 0.02 && cx < 0.2 && Math.abs(cz) < B * 0.22) || wnoise(cx * 30 + seed, cz * 0.8) > 0.62) continue; // cale ouverte, planches arrachées
    di.push(deck.index.array[i], deck.index.array[i + 1], deck.index.array[i + 2]);
  }
  deck.setIndex(di);
  deck.computeVertexNormals();
  const wood = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  wood.userData.detail = 'wood';
  add(rusted(deck, '#4a3320', '#221610', 0.4, seed + 5), wood);

  // Passerelle à l'arrière : bloc aux angles arrondis, vitres crevées, toit débordant
  const bx = -L * 0.24, by = sheer(0.26), bw = B * 0.62, bh = D * 0.62, bl = L * 0.2;
  const round = (w, h, d, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2);
    sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 6, steps: 4 }).rotateX(-Math.PI / 2);
  };
  add(rusted(round(bl, bh, bw, 0.5 * size), '#6a7272', '#6a3a1e', 0.5, seed + 9), steel, bx, by, 0);
  add(rusted(round(bl * 1.12, 0.14 * size, bw * 1.14, 0.5 * size), '#3a4244', '#6a3a1e', 0.4, seed + 2), steel, bx, by + bh, 0);
  const pane = new THREE.MeshBasicMaterial({ color: '#020407' });
  for (let i = -2; i <= 2; i++) {
    add(new THREE.PlaneGeometry(0.55 * size, 0.5 * size).rotateY(Math.PI / 2), pane, bx + bl / 2 + 0.02, by + bh * 0.68, i * bw * 0.17);
    for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.2 * size, 14).rotateY(s > 0 ? 0 : Math.PI), pane, bx + i * bl * 0.17, by + bh * 0.6, s * (bw / 2 + 0.02));
  }
  // Cheminée couchée par le temps, cerclée
  const funnel = add(rusted(new THREE.CylinderGeometry(0.42 * size, 0.5 * size, D * 0.8, 20, 3, true), '#5a2e1c', '#2a1810', 0.5, seed), steel, bx - bl * 0.15, by + bh + D * 0.38, 0);
  funnel.rotation.z = rand.range(0.1, 0.35);
  add(new THREE.TorusGeometry(0.47 * size, 0.04 * size, 6, 20).rotateX(Math.PI / 2), dark, funnel.position.x - 0.1 * size, funnel.position.y + D * 0.2, 0).rotation.z = funnel.rotation.z;

  // Mât de charge brisé, haubans pendants, treuil
  const mx = L * 0.14, my = sheer(0.64), mt = [mx + rand.range(-1.5, 1.5) * size, my + D * 1.7, rand.range(-1, 1) * size];
  bar([mx, my, 0], mt, 0.12 * size);
  bar([mx, my + D * 0.9, 0], [mx + L * 0.16, my + D * 0.5, rand.range(-0.5, 0.5) * size], 0.07 * size);
  for (const s of [-1, 1]) bar(mt, [mx - L * 0.06, sheer(0.58), s * half(0.58) * 0.95], 0.02 * size);
  add(new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 1.1 * size, 16).rotateX(Math.PI / 2), dark, L * 0.3, sheer(0.8) + 0.4 * size, 0);
  bar([L * 0.3, sheer(0.8) + 0.4 * size, 0], [L * 0.47, sheer(0.97) - 0.2 * size, 0], 0.03 * size);

  // Bastingage : chandeliers et lisse, par tronçons (certains ont disparu)
  for (const s of [-1, 1]) {
    let prev = null;
    for (let t = 0.06; t < 0.97; t += 0.045) {
      const gone = wnoise(t * 9 + seed + s, s * 3) > 0.35;
      const p = [(t - 0.5) * L, sheer(t), s * half(t) * 0.98], top = [p[0], p[1] + 0.9 * size, p[2]];
      if (!gone) { bar(p, top, 0.025 * size); if (prev) bar(prev, top, 0.022 * size); }
      prev = gone ? null : top;
    }
  }
  // Chaîne d'ancre qui pend de la proue
  bar([L * 0.47, sheer(0.97), half(0.97) * 0.6], [L * 0.44, -D * 0.9, half(0.9) + 0.6 * size], 0.045 * size);

  // Collisions : quelques sphères le long de la coque
  g.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  if (opts.hollow) {
    // Épave où l'on entre : des sphères le long du bordé et de la quille, l'intérieur reste libre
    const br = opts.breach, r = 0.55 * size;
    for (let t = 0.05; t < 0.97; t += 0.05) {
      const w = half(t), d = D * (0.55 + 0.45 * Math.min(1, w / (B * 0.4)));
      for (const f of [0.18, 0.5, 0.8, 1]) {
        const sa = Math.pow(f, 1 / 0.75), ca = Math.sqrt(Math.max(0, 1 - sa * sa));
        for (const sd of f === 1 ? [0] : [-1, 1]) {
          if (br && sd > 0 && t > br[0] && t < br[1] && f < 0.8) continue;
          p.set((t - 0.5) * L, sheer(t) - f * d, sd * Math.pow(ca, 0.6) * w).applyMatrix4(g.matrixWorld);
          colliders.push({ x: p.x, y: p.y, z: p.z, r });
        }
      }
    }
    // le pont : un tapis de petites sphères, sauf au-dessus du panneau de cale (c'est par là qu'on descend)
    const dr = 0.42 * size;
    for (let t = 0.05; t < 0.96; t += (dr * 1.8) / L) {
      const w = half(t) - dr * 0.6;
      for (let zz = -w; zz <= w; zz += dr * 1.8) {
        const cx = t - 0.5;
        if (cx > 0.0 && cx < 0.22 && Math.abs(zz) < B * 0.26) continue;
        p.set(cx * L, sheer(t) - dr * 0.7, zz).applyMatrix4(g.matrixWorld);
        colliders.push({ x: p.x, y: p.y, z: p.z, r: dr });
      }
    }
    // la passerelle
    p.set(bx, by + bh * 0.5, 0).applyMatrix4(g.matrixWorld);
    colliders.push({ x: p.x, y: p.y, z: p.z, r: bw * 0.55 });
    if (opts.name) {
      // le nom, sous les vitres de la passerelle et au tableau arrière
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      const k = cv.getContext('2d');
      k.fillStyle = '#1c2224'; k.fillRect(0, 0, 512, 96);
      k.fillStyle = '#b9c2b8'; k.font = '600 54px "Barlow Condensed", sans-serif'; k.textAlign = 'center'; k.fillText(opts.name, 256, 66);
      // la peinture est partie par plaques
      for (let i = 0; i < 260; i++) { k.fillStyle = `rgba(28,34,36,${0.3 + Math.random() * 0.6})`; k.fillRect(Math.random() * 512, Math.random() * 96, 2 + Math.random() * 14, 1 + Math.random() * 4); }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.MeshBasicMaterial({ map: tex, color: '#8a8f88' });
      add(new THREE.PlaneGeometry(bw * 0.8, bw * 0.15).rotateY(Math.PI / 2), board, bx + bl / 2 + 0.04, by + bh * 0.3, 0);
      add(new THREE.PlaneGeometry(B * 0.5, B * 0.094).rotateY(-Math.PI / 2), board, -L * 0.492, sheer(0) - D * 0.16, 0);
    }
    g.userData.hold = new THREE.Vector3(L * 0.11, sheer(0.6) - D * 0.3, 0).applyMatrix4(g.matrixWorld); // sous le panneau de cale
    g.userData.stern = new THREE.Vector3(-L * 0.5, sheer(0) + D * 0.2, 0).applyMatrix4(g.matrixWorld);
    return g;
  }
  for (let i = -2; i <= 2; i++) {
    p.set(i * L * 0.2, -D * 0.4, 0).applyMatrix4(g.matrixWorld);
    colliders.push({ x: p.x, y: p.y, z: p.z, r: B * 0.65 });
  }
  return g;
}

/** Aiguille rocheuse du canyon */
function spire(x, z, height) {
  const geo = new THREE.CylinderGeometry(rand.range(0.8, 2), rand.range(3, 6), height, 6, 4);
  const pos = geo.attributes.position;
  const n = rand() * 10;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + Math.sin(y * 0.15 + n) * 1.5);
    pos.setZ(i, pos.getZ(i) + Math.cos(y * 0.12 + n) * 1.5);
  }
  const m = new THREE.Mesh(weathered(geo, '#4a4e50', '#3a3e40', 0.3), rockMat);
  m.position.set(x, getFloorHeight(x, z) + height / 2 - 2, z);
  return m;
}

/** Squelette de baleine : colonne et côtes */
function whale(x, z, colliders) {
  const g = new THREE.Group();
  g.position.set(x, getFloorHeight(x, z) + 0.5, z);
  g.rotation.y = 0.6;
  const bone = new THREE.MeshLambertMaterial({ color: '#b9cbc2', flatShading: true });
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 - i * 0.03, 0), bone);
    v.position.set(0, 2.2 - i * 0.05, i * 1.5 - 8);
    g.add(v);
    if (i > 1 && i < 11) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(2.6 - Math.abs(i - 5) * 0.2, 0.15, 3, 7, Math.PI * 0.85), bone);
      rib.position.copy(v.position);
      rib.rotation.set(0, Math.PI / 2, Math.PI + 0.25);
      g.add(rib);
    }
  }
  const skull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 4), bone);
  skull.position.set(0, 1.6, -11);
  skull.rotation.x = 0.2;
  g.add(skull);
  colliders.push({ x, y: g.position.y + 1.5, z, r: 3 });
  return g;
}

/** Tiges luminescentes des abysses (instanciées, ondulation dans le shader) */
function glowStalks(count, uniforms) {
  const stemGeo = new THREE.CylinderGeometry(0.05, 0.12, 1, 4, 4);
  stemGeo.translate(0, 0.5, 0);
  const tipGeo = new THREE.IcosahedronGeometry(0.22, 0);
  tipGeo.translate(0, 1, 0);
  const sway = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 rootW = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float h = position.y;
        transformed.x += sin(uTime * 0.6 + rootW.x * 0.3) * h * h * 0.25;
        transformed.z += cos(uTime * 0.5 + rootW.z * 0.3) * h * h * 0.2;`
      );
  };
  const stemMat = new THREE.MeshLambertMaterial({ color: '#26292b', flatShading: true });
  stemMat.onBeforeCompile = sway;
  const tipMat = new THREE.MeshBasicMaterial({ color: '#7fbf7a' });
  tipMat.onBeforeCompile = sway;
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const tips = new THREE.InstancedMesh(tipGeo, tipMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  const palette = ['#7fbf7a', '#83a39a', '#ccd8cc', '#5b8fc0'];
  for (let i = 0; i < count; i++) {
    const x = rand.range(-150, 150);
    const z = rand.range(-4130, -3480);
    p.set(x, getFloorHeight(x, z) - 0.2, z);
    const h = rand.range(2, 7);
    s.set(1, h, 1);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    m.compose(p, q, s);
    stems.setMatrixAt(i, m);
    tips.setMatrixAt(i, m);
    tips.setColorAt(i, tint.set(rand.pick(palette)));
  }
  const g = new THREE.Group();
  g.add(stems, tips);
  return g;
}

const MARIE_OPTS = { hollow: true, lift: 0.95, rot: [0.2, 1.86, -0.24], order: 'YZX', breach: [0.5, 0.7, 1, 6], name: 'MARIE-MORGANE' };
/** Aperçu (page de développement) */
export function createMariePreview() {
  const g = wreck(0, MARIE.z, MARIE.size, [], { ...MARIE_OPTS, rot: [0, 0, 0] });
  g.position.set(0, 0, 0);
  return g;
}

export function createLandmarks(colliders, uniforms) {
  const group = new THREE.Group();

  // Épaves : une barque dans le récif, le reste dans la zone des épaves
  for (const [x, z, size] of WRECKS) group.add(wreck(x, z, size, colliders));

  // Canyon : aiguilles le long des parois et quelques-unes dans le lit
  for (let i = 0; i < 70; i++) {
    const z = rand.range(-2980, -2240);
    const side = rand() < 0.5 ? -1 : 1;
    const x = canyonCenter(z) + side * rand.range(20, 70);
    group.add(spire(x, z, rand.range(15, 45)));
  }
  group.add(whale(canyonCenter(-2756) + 8, -2756, colliders));
  const mm = wreck(canyonCenter(MARIE.z) + MARIE.dx, MARIE.z, MARIE.size, colliders, MARIE_OPTS);
  group.add(mm);
  group.userData.marie = mm;

  // Abysses
  group.add(glowStalks(420, uniforms));
  return group;
}


