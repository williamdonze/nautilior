import * as THREE from 'three';
import { RADIATION } from '../config/settings.js';
import { getFloorHeight } from './seabed.js';

/**
 * La Chambre engloutie : autour de la faille, le fond des Abysses devient une chambre d'hôpital
 * à l'échelle d'un rêve. Un lit immense à moitié enseveli, une potence de perfusion haute comme un mât,
 * une porte seule debout sur la plaine, des dalles de plafond qui dérivent, des néons qui grésillent.
 * Rien n'est expliqué : c'est là que le joueur commence à douter pour de bon.
 */
const TAU = Math.PI * 2;

export function createSunkenRoom(scene, colliders = []) {
  const S = RADIATION.SOURCE, group = new THREE.Group();
  group.name = 'sunkenRoom';
  scene.add(group);
  const mat = (color, kind, extra = {}) => { const m = new THREE.MeshLambertMaterial({ color, ...extra }); if (kind) m.userData.detail = kind; return m; };
  const steel = mat('#8f9a98', 'metal'), white = mat('#cfd6d0', 'stone'), sheet = mat('#b9c4be', 'stone'), tile = mat('#9aa39c', 'stone'), dark = mat('#2a302e', 'metal');
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 1.9) });
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.raycast = () => {}; parent.add(m); return m; };
  const bar = (parent, a, b, r, material) => {
    const va = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(va), len = d.length();
    const m = add(parent, new THREE.CylinderGeometry(r, r, len, 12), material);
    m.position.copy(va).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };
  const at = (x, z) => getFloorHeight(S.x + x, S.z + z);

  /* ---- Le lit : quarante mètres de long, de travers, un pied enfoncé dans la vase */
  {
    const bx = -58, bz = 62, g = new THREE.Group();
    g.position.set(S.x + bx, at(bx, bz) + 3.5, S.z + bz);
    g.rotation.set(0.1, 0.7, -0.16);
    group.add(g);
    const L = 42, W = 20, H = 9;
    // sommier, matelas affaissé, drap qui pend
    add(g, new THREE.BoxGeometry(W, 1.2, L), steel, 0, H, 0);
    const mattress = new THREE.BoxGeometry(W * 0.96, 3, L * 0.97, 14, 1, 26), mp = mattress.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
      // le creux d'un corps, au milieu
      if (y > 0) mp.setY(i, y - 1.3 * Math.exp(-((x / 5) ** 2)) * Math.exp(-(((z + 2) / 13) ** 2)) + Math.sin(x * 0.9 + z * 0.4) * 0.12);
      mp.setX(i, x * (1 - 0.04 * Math.abs(y)));
    }
    mattress.computeVertexNormals();
    add(g, mattress, white, 0, H + 2.1, 0);
    const drape = new THREE.PlaneGeometry(L * 0.7, 9, 40, 6), dp = drape.attributes.position;
    for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getX(i) * 0.9) * 0.7 * (0.3 - dp.getY(i) / 9));
    drape.computeVertexNormals();
    const d1 = add(g, drape, mat('#b9c4be', 'stone', { side: THREE.DoubleSide }), W / 2 + 0.3, H - 1.2, -3);
    d1.rotation.y = Math.PI / 2;
    add(g, new THREE.SphereGeometry(1, 24, 14).scale(6.5, 1.8, 4.2), white, 0, H + 4.4, L / 2 - 6); // l'oreiller
    // pieds, tête et pied de lit en tubes, barrières
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(g, [sx * (W / 2 - 0.6), -4, sz * (L / 2 - 0.8)], [sx * (W / 2 - 0.6), H + (sz > 0 ? 13 : 7), sz * (L / 2 - 0.8)], 0.55, steel);
    for (const [sz, h] of [[1, 13], [-1, 7]]) {
      bar(g, [-W / 2 + 0.6, H + h, sz * (L / 2 - 0.8)], [W / 2 - 0.6, H + h, sz * (L / 2 - 0.8)], 0.55, steel);
      for (let k = -2; k <= 2; k++) bar(g, [k * 3.2, H + 0.5, sz * (L / 2 - 0.8)], [k * 3.2, H + h, sz * (L / 2 - 0.8)], 0.28, steel);
    }
    for (const sx of [-1, 1]) {
      bar(g, [sx * (W / 2 + 0.2), H + 6, -L * 0.3], [sx * (W / 2 + 0.2), H + 6, L * 0.3], 0.35, steel);
      for (let k = -3; k <= 3; k++) bar(g, [sx * (W / 2 + 0.2), H + 0.5, k * L * 0.1], [sx * (W / 2 + 0.2), H + 6, k * L * 0.1], 0.22, steel);
    }
    g.updateMatrixWorld(true);
    for (let k = -3; k <= 3; k++) { const p = new THREE.Vector3(0, H + 1, k * 6).applyMatrix4(g.matrixWorld); colliders.push({ x: p.x, y: p.y, z: p.z, r: 9.5 }); }
  }

  /* ---- La potence : un mât de cinquante-cinq mètres, la poche qui luit, la tubulure qui descend */
  {
    const px = 62, pz = 30, y0 = at(px, pz), g = new THREE.Group();
    g.position.set(S.x + px, y0, S.z + pz);
    g.rotation.z = 0.07;
    group.add(g);
    bar(g, [0, -3, 0], [0, 56, 0], 0.7, steel);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; bar(g, [0, 1.2, 0], [Math.cos(a) * 9, 0.4, Math.sin(a) * 9], 0.45, steel); add(g, new THREE.SphereGeometry(0.9, 12, 8), dark, Math.cos(a) * 9, 0.4, Math.sin(a) * 9); }
    for (const s of [-1, 1]) { bar(g, [0, 55, 0], [s * 5, 56.5, 0], 0.35, steel); add(g, new THREE.TorusGeometry(1, 0.22, 8, 16, Math.PI * 1.4), steel, s * 5, 55.6, 0); }
    // la poche : verre épais, liquide qui luit faiblement
    const bag = add(g, new THREE.CapsuleGeometry(3.2, 6.5, 8, 20).scale(1, 1, 0.42), new THREE.MeshLambertMaterial({ color: '#dff5ee', transparent: true, opacity: 0.35, emissive: '#2a5a48', emissiveIntensity: 0.6, depthWrite: false }), 5, 47.5, 0);
    add(g, new THREE.CapsuleGeometry(2.6, 3.4, 8, 16).scale(1, 1, 0.34), new THREE.MeshBasicMaterial({ color: '#6fd0a8', transparent: true, opacity: 0.35, depthWrite: false }), 5, 45.6, 0);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(5, 41, 0), new THREE.Vector3(5.5, 30, 1), new THREE.Vector3(2, 16, 4), new THREE.Vector3(-8, 6, 9), new THREE.Vector3(-22, 1.5, 12), new THREE.Vector3(-40, 0.8, 16)]);
    add(g, new THREE.TubeGeometry(curve, 60, 0.3, 8), new THREE.MeshLambertMaterial({ color: '#dfeee8', transparent: true, opacity: 0.7 }));
    const light = new THREE.PointLight('#8fe8c0', 26, 60, 1.2);
    light.position.set(5, 45, 2);
    g.add(light);
    group.userData.bag = { bag, light };
    for (let h = 2; h < 54; h += 4) colliders.push({ x: S.x + px - Math.sin(0.07) * h, y: y0 + h, z: S.z + pz, r: 1.6 });
  }

  /* ---- La porte : seule debout sur le chemin de la faille. On passe dessous. */
  {
    const dz = 78, y0 = at(0, dz), g = new THREE.Group();
    g.position.set(S.x, y0 - 1, S.z + dz);
    g.rotation.y = 0.12;
    group.add(g);
    const W = 16, H = 30;
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(2, H + 2, 2.4), white, s * (W / 2 + 1), H / 2, 0);
    add(g, new THREE.BoxGeometry(W + 4, 2.4, 2.4), white, 0, H + 1.2, 0);
    // le battant, entrouvert, avec son hublot rond
    const leaf = new THREE.Group();
    leaf.position.set(-W / 2, 0, 0);
    leaf.rotation.y = -1.15;
    g.add(leaf);
    add(leaf, new THREE.BoxGeometry(W, H, 0.8), mat('#a8b4ae', 'stone'), W / 2, H / 2, 0);
    add(leaf, new THREE.TorusGeometry(2.4, 0.3, 8, 28), steel, W / 2, H * 0.68, 0.45);
    add(leaf, new THREE.CircleGeometry(2.3, 28), new THREE.MeshBasicMaterial({ color: '#31584a' }), W / 2, H * 0.68, 0.42);
    add(leaf, new THREE.BoxGeometry(0.5, 3.4, 0.5), steel, W - 1.5, H * 0.42, 0.7);
    // plaque au-dessus de la porte : un numéro
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 96;
    const k = cv.getContext('2d');
    k.fillStyle = '#dfe6e0'; k.fillRect(0, 0, 256, 96);
    k.fillStyle = '#2a302e'; k.font = '600 64px sans-serif'; k.textAlign = 'center'; k.fillText('112', 128, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    add(g, new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ map: tex }), 0, H + 1.2, 1.25);
    g.updateMatrixWorld(true);
    for (const s of [-1, 1]) for (let h = 2; h < H; h += 4) { const p = new THREE.Vector3(s * (W / 2 + 1), h, 0).applyMatrix4(g.matrixWorld); colliders.push({ x: p.x, y: p.y, z: p.z, r: 1.8 }); }
  }

  /* ---- Carrelage : de grandes dalles qui affleurent sous la vase, par plaques */
  const slabs = [];
  for (let i = -9; i <= 9; i++) for (let j = -9; j <= 9; j++) {
    const x = i * 13, z = j * 13, d = Math.hypot(x, z);
    if (d < 20 || d > 125 || Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1 > 0.1 + (1 - d / 125) * 0.5) continue;
    slabs.push([x, z, (i + j) & 1]);
  }
  const slabMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(12.4, 0.9, 12.4), tile, slabs.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  slabs.forEach(([x, z, odd], i) => {
    dummy.position.set(S.x + x, at(x, z) + 0.15, S.z + z);
    dummy.rotation.set((Math.sin(x) * 0.5) * 0.08, 0, (Math.cos(z) * 0.5) * 0.08);
    dummy.updateMatrix();
    slabMesh.setMatrixAt(i, dummy.matrix);
    slabMesh.setColorAt(i, col.setScalar(odd ? 0.75 : 1.1));
  });
  slabMesh.computeBoundingSphere();
  group.add(slabMesh);

  /* ---- Dalles de plafond : elles se sont détachées et dérivent, loin au-dessus */
  const N = 70, panels = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 0.35, 7), mat('#c4ccc6', 'stone'), N);
  panels.frustumCulled = false;
  group.add(panels);
  const drift = Array.from({ length: N }, (_, i) => ({ a: Math.random() * TAU, r: 26 + Math.random() * 105, h: 10 + Math.pow(Math.random(), 0.7) * 60, w: (Math.random() - 0.5) * 0.02, ax: new THREE.Vector3().randomDirection(), sp: 0.05 + Math.random() * 0.12, ph: i }));
  const q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();

  /* ---- Néons : des tubes tombés, qui grésillent encore */
  const neons = [];
  for (const [x, z, ry, tilt] of [[-22, 40, 0.4, 0.5], [30, 66, -0.8, 0.15], [-70, 8, 1.3, 0.9], [88, -20, 0.2, 0.3], [-36, -52, -0.5, 0.2]]) {
    const m = add(group, new THREE.CylinderGeometry(0.45, 0.45, 18, 10), glow.clone(), S.x + x, at(x, z) + 1 + Math.sin(tilt) * 8, S.z + z);
    m.rotation.set(0, ry, Math.PI / 2 - tilt);
    add(group, new THREE.BoxGeometry(19, 0.6, 2.2), dark, m.position.x, m.position.y - 0.6, m.position.z).rotation.copy(m.rotation).reorder('XYZ');
    neons.push({ m, ph: x * 0.37 });
  }

  return {
    group,
    update(time) {
      for (let i = 0; i < N; i++) {
        const d = drift[i];
        d.a += d.w * 0.016;
        pv.set(S.x + Math.cos(d.a) * d.r, at(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r) + d.h + Math.sin(time * 0.2 + d.ph) * 2, S.z + Math.sin(d.a) * d.r);
        q.setFromAxisAngle(d.ax, time * d.sp + d.ph);
        panels.setMatrixAt(i, dummy.matrix.compose(pv, q, s1));
      }
      panels.instanceMatrix.needsUpdate = true;
      // les néons grésillent : allumés, puis de brèves coupures
      for (const n of neons) {
        const f = Math.sin(time * 37 + n.ph) * Math.sin(time * 5.3 + n.ph * 2) > -0.55 ? 1 : 0.08;
        n.m.material.color.setRGB(1.6 * f, 2.2 * f, 1.9 * f);
      }
      const B = group.userData.bag;
      B.light.intensity = 22 + Math.sin(time * 0.93 * TAU) * 6;
    },
  };
}
