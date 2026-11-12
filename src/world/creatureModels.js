import * as THREE from 'three';
import { createHalo } from '../loot/glow.js';

/**
 * Modèles des créatures mutées. Face vers +Z.
 * Pas de lumières dynamiques (coûteuses) : les yeux et leurres sont des matériaux
 * non éclairés + des halos qui percent l'obscurité.
 */
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

/** Déforme une géométrie au hasard (formes difformes) */
function deform(geo, amount, seed = 1) {
  const pos = geo.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    if (!offsets.has(key)) offsets.set(key, 1 + Math.sin(i * 12.9898 + seed * 78.233) * amount);
    const k = offsets.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function eye(parent, x, y, z, r, color = '#e0b050') {
  const e = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), glow(color));
  e.position.set(x, y, z);
  parent.add(e);
  const h = createHalo(color, r * 9);
  h.material.opacity = 0.6;
  h.position.copy(e.position);
  parent.add(h);
  return e;
}

function teeth(parent, count, radius, y, z) {
  const toothMat = lambert('#ccd8cc');
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 3), toothMat);
    t.position.set(Math.cos(a) * radius, y + Math.sin(a) * radius * 0.6, z);
    t.rotation.x = Math.PI / 2;
    t.rotation.z = a;
    parent.add(t);
  }
}

/** Anguille : une tête et une chaîne de segments qui suivent */
export function createEel() {
  const root = new THREE.Group();
  const head = new THREE.Group();
  root.add(head);
  const skin = lambert('#26292b');
  const headMesh = new THREE.Mesh(deform(new THREE.IcosahedronGeometry(0.55, 1), 0.18, 3), skin);
  headMesh.scale.set(0.9, 0.7, 1.5);
  head.add(headMesh);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 5, 1, true), lambert('#22140d'));
  jaw.rotation.x = Math.PI / 2;
  jaw.position.z = 0.75;
  head.add(jaw);
  teeth(head, 7, 0.38, -0.05, 0.85);
  eye(head, 0.32, 0.22, 0.45, 0.08);
  eye(head, -0.3, 0.25, 0.4, 0.07);
  eye(head, 0.12, 0.35, 0.2, 0.05, '#7fbf7a'); // un œil en trop

  const segments = [];
  const segMat = lambert('#2a2c2e');
  const finMat = lambert('#3e2114');
  for (let i = 0; i < 12; i++) {
    const r = 0.5 * (1 - i / 14);
    const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i % 3 ? segMat : skin);
    seg.scale.set(1, 0.8, 1.6);
    if (i % 2 === 0) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, r * 1.4, r * 1.2), finMat);
      fin.position.y = r * 0.8;
      seg.add(fin);
    }
    root.add(seg);
    segments.push(seg);
  }
  // Taille réelle : environ 14 m de long
  const SCALE = 1.8;
  head.scale.setScalar(SCALE);
  for (const seg of segments) seg.scale.multiplyScalar(SCALE);
  return { root, head, segments, spacing: 0.75 * SCALE };
}

/** Poisson-lanterne : corps bouffi et asymétrique, gueule hérissée, leurre lumineux */
export function createLantern() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bulk = new THREE.Mesh(deform(new THREE.IcosahedronGeometry(1.3, 1), 0.25, 7), lambert('#22140d'));
  bulk.scale.set(1, 0.95, 1.25);
  body.add(bulk);
  // Gueule ouverte
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.6, 7, 1, true), new THREE.MeshBasicMaterial({ color: '#05090d', side: THREE.DoubleSide }));
  mouth.rotation.x = Math.PI / 2;
  mouth.position.set(0, -0.35, 1.3);
  body.add(mouth);
  teeth(body, 11, 0.85, -0.35, 1.55);
  // Yeux mal placés
  eye(body, 0.7, 0.5, 0.9, 0.13);
  eye(body, -0.5, 0.75, 0.8, 0.09);
  eye(body, 0.2, 0.95, 0.6, 0.06, '#7fbf7a');
  // Nageoires
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 3), lambert('#3e2114'));
    fin.position.set(s * 1.2, -0.2, -0.2);
    fin.rotation.set(0, 0, s * -1.2);
    body.add(fin);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), lambert('#3e2114'));
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -1.9;
  body.add(tail);
  // Leurre : tige courbée et boule lumineuse
  const stalk = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 3, 8, Math.PI * 0.6), lambert('#26292b'));
  stalk.rotation.y = -Math.PI / 2;
  stalk.position.set(0, 0.9, 0.1);
  body.add(stalk);
  const lure = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), glow('#ccd8cc'));
  lure.position.set(0, 1.5, 1.35);
  body.add(lure);
  const lureHalo = createHalo('#7fbf7a', 4);
  lureHalo.position.copy(lure.position);
  body.add(lureHalo);
  body.scale.setScalar(1.6);
  return { root, body, tail, lure, lureHalo };
}

/** Méduse irradiée : cloche verte translucide, filaments qui pendent */
export function createJelly() {
  const root = new THREE.Group();
  const bellMat = new THREE.MeshBasicMaterial({
    color: '#7fbf7a',
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bell = new THREE.Mesh(deform(new THREE.SphereGeometry(1.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, 2), bellMat);
  root.add(bell);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), glow('#ccd8cc'));
  core.position.y = 0.4;
  root.add(core);
  const halo = createHalo('#7fbf7a', 7);
  halo.material.opacity = 0.5;
  halo.position.y = 0.3;
  root.add(halo);
  const tendrils = [];
  const tMat = new THREE.MeshBasicMaterial({ color: '#83a39a', transparent: true, opacity: 0.6 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
    const len = 2.5 + (i % 3);
    const geo = new THREE.BoxGeometry(0.05, len, 0.05);
    geo.translate(0, -len / 2, 0);
    pivot.add(new THREE.Mesh(geo, tMat));
    root.add(pivot);
    tendrils.push(pivot);
  }
  root.scale.setScalar(1.5);
  return { root, bell, tendrils, halo };
}

/** Poisson ordinaire (pour les bancs instanciés), face vers +Z */
export function createFishGeometry() {
  const body = new THREE.OctahedronGeometry(0.3, 0);
  body.scale(0.45, 0.7, 1.3);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, -0.3, 0, 0.18, -0.62, 0, -0.18, -0.62, 0, 0, -0.3, 0, -0.18, -0.62, 0, 0.18, -0.62], 3)
  );
  tail.computeVertexNormals();
  const b = body.toNonIndexed();
  b.deleteAttribute('uv');
  const merged = new THREE.BufferGeometry();
  const p1 = b.attributes.position.array, p2 = tail.attributes.position.array;
  const pos = new Float32Array(p1.length + p2.length);
  pos.set(p1);
  pos.set(p2, p1.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}
