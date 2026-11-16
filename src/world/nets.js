import * as THREE from 'three';
import { WORLD, NETS } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { getFloorHeight, canyonCenter } from './seabed.js';
import { MARIE } from './landmarks.js';
import { createSubmarineModel } from '../submarine/subModel.js';
import { createHalo } from '../loot/glow.js';

/**
 * La forêt de filets : autour de la Marie-Morgane, ses filets ont continué à pêcher tout seuls.
 * Lestés au fond, tirés vers le haut par leurs flotteurs, ils montent comme des murs dans le Canyon.
 * Le sous-marin s'y prend : il faut couper à la pince (clic, en vue cockpit) ou tout arracher d'une impulsion (F).
 * Au milieu, un petit sous-marin pris dans les mailles. Le même que celui du joueur, au début.
 */

/** Texture de mailles (rendu de repli Three.js ; le moteur WebGPU dessine les mailles lui-même) */
let netTex = null;
function netTexture() {
  if (netTex) return netTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const k = cv.getContext('2d');
  k.strokeStyle = '#fff';
  k.lineWidth = 5;
  k.beginPath();
  k.moveTo(0, 0); k.lineTo(64, 64); k.moveTo(64, 0); k.lineTo(0, 64);
  k.stroke();
  netTex = new THREE.CanvasTexture(cv);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  return netTex;
}

export function netMaterial(color = '#48564c') {
  const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, alphaMap: netTexture(), depthWrite: false });
  m.userData.detail = 'net';
  m.userData.netScale = 0.95; // mailles par mètre (grosses : elles doivent se lire de loin)
  return m;
}

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Une nappe de filet entre deux points du fond : le bas suit le sol, le haut flotte.
 * @returns {THREE.Group} avec userData { ax, az, bx, bz, top(u) }
 */
function curtain(ax, az, bx, bz, height, seed, mat, floatMat, ropeMat) {
  const NU = 26, NV = 12, len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const pos = [], uv = [], idx = [], tops = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, x = ax + (bx - ax) * u, z = az + (bz - az) * u;
    const f = getFloorHeight(x, z) - 0.3;
    // la ralingue du haut ondule ; les bouts retombent vers le fond
    const h = height * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * u)), 0.6)) * (0.8 + 0.3 * hash(i * 0.37, seed));
    tops.push(f + h);
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, belly = Math.sin(v * Math.PI) * (1.4 + 1.2 * Math.sin(u * 7 + seed)) + Math.sin(u * 13 + v * 5 + seed) * 0.3;
      pos.push(x + nx * belly, f + h * v, z + nz * belly);
      uv.push(u * len, v * h);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    // déchirures : des pans entiers manquent
    if (hash(Math.floor(i / 3) + seed, Math.floor(j / 3) * 1.7) > 0.8) continue;
    const a = i * (NV + 1) + j, b = a + NV + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.raycast = () => {};
  g.add(mesh);
  // ralingue et flotteurs
  const pts = [];
  for (let i = 0; i <= NU; i++) pts.push(new THREE.Vector3(pos[(i * (NV + 1) + NV) * 3], pos[(i * (NV + 1) + NV) * 3 + 1], pos[(i * (NV + 1) + NV) * 3 + 2]));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), NU * 2, 0.06, 5), ropeMat);
  rope.raycast = () => {};
  g.add(rope);
  const floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8).scale(1, 0.8, 1), floatMat, Math.ceil(NU / 2));
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < floats.count; i++) floats.setMatrixAt(i, m4.makeTranslation(pts[i * 2 + 1].x, pts[i * 2 + 1].y + 0.2, pts[i * 2 + 1].z));
  floats.raycast = () => {};
  g.add(floats);
  g.userData = { ax, az, bx, bz, len, tops, hp: NETS.CUTS, torn: 0, fade: 1 };
  return g;
}

export class NetForest {
  constructor(scene, colliders = []) {
    const rand = createRandom(WORLD.SEED + 1984);
    const group = (this.group = new THREE.Group());
    group.name = 'nets';
    scene.add(group);
    const mat = netMaterial(), floatMat = new THREE.MeshLambertMaterial({ color: '#9a5a34' }), ropeMat = new THREE.MeshLambertMaterial({ color: '#3c4238' });
    this.curtains = [];
    const cx = (z) => canyonCenter(z);
    // Des murs en travers du Canyon, en quinconce : on peut se faufiler, ou couper
    for (let i = 0; i < NETS.COUNT; i++) {
      const z = -648 - i * (130 / NETS.COUNT) + rand.range(-3, 3);
      if (Math.abs(z - MARIE.z) < 26 && i % 2 === 0) continue; // on laisse l'épave lisible
      // le lit du Canyon fait une cinquantaine de mètres : les nappes le barrent à moitié, en quinconce
      const near = Math.abs(z - MARIE.z) < 30, side = near ? 1 : i % 2 ? 1 : -1, c = cx(z) + side * rand.range(near ? 10 : 3, near ? 14 : 12);
      const half = rand.range(near ? 7 : 9, near ? 10 : 14), skew = rand.range(-7, 7);
      const g = curtain(c - half, z - skew, c + half, z + skew, rand.range(9, 20), i * 3.3, mat, floatMat, ropeMat);
      group.add(g);
      this.curtains.push(g);
    }

    /* Le petit sous-marin pris dans les mailles */
    const lz = MARIE.z - 10, lx = cx(lz) + 5, ly = getFloorHeight(lx, lz) + 2.3;
    const lost = (this.lost = new THREE.Group());
    lost.position.set(lx, ly, lz);
    lost.rotation.set(0.12, -1.9, -0.28); // l'avant vers la Marie-Morgane
    const model = createSubmarineModel(0);
    lost.add(model.group);
    // un linceul de filet par-dessus, lesté de concrétions
    const shroud = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.72).scale(3.1, 2.3, 4.6);
    const sp = shroud.attributes.position, su = shroud.attributes.uv;
    for (let i = 0; i < sp.count; i++) {
      const k = 1 + 0.12 * Math.sin(sp.getX(i) * 3 + sp.getZ(i) * 2.3);
      sp.setXYZ(i, sp.getX(i) * k, sp.getY(i) * k - 0.2, sp.getZ(i) * k);
      su.setXY(i, su.getX(i) * 18, su.getY(i) * 8);
    }
    shroud.computeVertexNormals();
    const cover = new THREE.Mesh(shroud, mat);
    cover.raycast = () => {};
    lost.add(cover);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const strand = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5 + rand() * 4, 2, 6), mat);
      strand.geometry.attributes.uv.array.forEach((v, k, arr) => (arr[k] = v * (k % 2 ? 6 : 1.6)));
      strand.position.set(Math.cos(a) * 3.2, 3 + rand() * 2, Math.sin(a) * 4.6);
      strand.rotation.set(0.1, -a, 0.15);
      strand.raycast = () => {};
      lost.add(strand);
    }
    group.add(lost);
    this.lostCollider = { x: lx, y: ly, z: lz, r: 3.4 };
    colliders.push(this.lostCollider);
    this.lostPose = { x: lx, y: ly, z: lz, yaw: -1.9 };
    this.snagged = null;
    this.snag = 0;
  }

  /** Nouvelle plongée : les filets coupés ne se recousent pas… mais le rêve les retend */
  reset() {
    for (const g of this.curtains) { const u = g.userData; u.hp = NETS.CUTS; u.torn = 0; g.visible = true; g.scale.y = 1; g.position.y = 0; g.userData.fade = 1; }
    this.snagged = null;
    this.snag = 0;
  }

  /**
   * @returns {number} 0..1 : à quel point le sous-marin est pris
   */
  update(dt, time, sub) {
    let hit = null;
    const p = sub.position;
    if (p.z < -620 && p.z > -800) {
      for (const g of this.curtains) {
        const u = g.userData;
        if (u.torn > 0) {
          // le filet coupé s'affaisse et se défait
          u.torn = Math.min(1, u.torn + dt / 1.6);
          g.userData.fade = 1 - u.torn;
          g.position.y = -u.torn * 3;
          if (u.torn >= 1) g.visible = false;
          continue;
        }
        const t = Math.max(0, Math.min(1, ((p.x - u.ax) * (u.bx - u.ax) + (p.z - u.az) * (u.bz - u.az)) / (u.len * u.len)));
        const d = Math.hypot(p.x - (u.ax + (u.bx - u.ax) * t), p.z - (u.az + (u.bz - u.az) * t));
        if (d < NETS.REACH && p.y < u.tops[Math.round(t * (u.tops.length - 1))] + 0.8) hit = g;
        // il frémit quand on s'y débat
        g.position.x = hit === g ? Math.sin(time * 23) * 0.06 * this.snag : 0;
      }
    }
    this.snagged = hit;
    this.snag = Math.max(0, Math.min(1, this.snag + (hit ? dt * 2.5 : -dt * 2)));
    if (hit) {
      // pris : presque plus d'erre, et les mailles retiennent le gouvernail
      const k = Math.exp(-NETS.DRAG * dt);
      sub.velocity.multiplyScalar(k);
      sub.yawVelocity *= k;
    }
    return this.snag;
  }

  /** Un coup de pince dans le filet qui retient le sous-marin. @returns {boolean} true s'il a cédé */
  cut() {
    const g = this.snagged;
    if (!g) return false;
    if (--g.userData.hp > 0) return false;
    g.userData.torn = 0.01;
    return true;
  }

  /** L'impulsion arrache tout ce qui est proche */
  blast(pos, radius) {
    let n = 0;
    for (const g of this.curtains) {
      const u = g.userData;
      if (u.torn > 0) continue;
      if (Math.hypot(pos.x - (u.ax + u.bx) / 2, pos.z - (u.az + u.bz) / 2) < radius + u.len / 2) { u.torn = 0.01; n++; }
    }
    return n;
  }
}

/** Poche d'air sous le pont de la Marie-Morgane : une lampe de cale encore allumée */
export function holdPocket(scene, at) {
  const g = new THREE.Group();
  g.position.copy(at);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: '#f2e6b8' }));
  lamp.raycast = () => {};
  g.add(lamp);
  const light = new THREE.PointLight('#f2e6b8', 12, 26, 1.2);
  g.add(light);
  const halo = createHalo('#f2e6b8', 4);
  g.add(halo);
  scene.add(g);
  return { x: at.x, y: at.y, z: at.z, group: g, halo, light, phase: 7 };
}

/** Aperçus (page de développement) */
export function createNetPreviews() {
  const f = new NetForest(new THREE.Group());
  const c = f.curtains[3], u = c.userData, wrap = new THREE.Group();
  c.position.set(-(u.ax + u.bx) / 2, -getFloorHeight((u.ax + u.bx) / 2, (u.az + u.bz) / 2), -(u.az + u.bz) / 2);
  wrap.add(c);
  f.lost.position.set(0, 0, 0);
  return { curtain: wrap, lost: f.lost };
}
