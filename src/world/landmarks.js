import * as THREE from 'three';
import { WORLD } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { getFloorHeight, canyonCenter } from './seabed.js';

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
  [55, -120, 0.5], [-40, -230, 1], [70, -300, 1.3], [-90, -360, 0.9],
  [10, -420, 1.5], [-50, -470, 1.1], [110, -500, 1], [-120, -280, 0.8],
];
/** Positions des épaves (pour y semer plus d'objets) */
export const WRECK_SPOTS = WRECKS.map(([x, z]) => [x, z]);
const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Peint une géométrie : base + taches de rouille */
function weathered(geo, base, rust = '#63321b', amount = 0.4) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rust), c = new THREE.Color();
  paintFaces(geo, () => (rand() < amount ? c.copy(r) : c.copy(b)).multiplyScalar(0.8 + rand() * 0.3));
  return geo;
}

/** Profil de coque extrudé : pont large, quille étroite, proue effilée */
function hullGeometry(length, beam, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(length / 2 - beam, 0);
  shape.quadraticCurveTo(length / 2 + beam * 0.2, depth * 0.3, length / 2 + beam * 0.4, depth);
  shape.lineTo(-length / 2 - beam * 0.1, depth);
  shape.lineTo(-length / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: beam, bevelEnabled: false, curveSegments: 3 });
  geo.translate(0, 0, -beam / 2);
  return geo;
}

/** Une épave de chalutier ou de cargo */
function wreck(x, z, size, colliders) {
  const g = new THREE.Group();
  const floor = getFloorHeight(x, z);
  g.position.set(x, floor - size * 0.6, z);
  g.rotation.set(rand.range(-0.15, 0.15), rand() * Math.PI * 2, rand.range(0.2, 0.5));

  const L = 18 * size, B = 5 * size, D = 4 * size;
  g.add(new THREE.Mesh(weathered(hullGeometry(L, B, D), '#3f4446', '#63321b', 0.45), vmat));
  // Pont et cabine
  const deck = new THREE.Mesh(weathered(new THREE.BoxGeometry(L * 0.9, 0.3, B * 0.95), '#3e2114', '#22140d', 0.5), vmat);
  deck.position.set(-L * 0.02, D, 0);
  g.add(deck);
  const cabin = new THREE.Mesh(weathered(new THREE.BoxGeometry(L * 0.22, D * 0.7, B * 0.7), '#5f6564', '#63321b', 0.5), vmat);
  cabin.position.set(-L * 0.22, D + D * 0.35, 0);
  g.add(cabin);
  // Hublots noirs de la cabine
  for (let i = -1; i <= 1; i++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.6 * size, 0.5 * size, 0.1), new THREE.MeshBasicMaterial({ color: '#020407' }));
    w.position.set(-L * 0.22 + i * 1.3 * size, D * 1.45, B * 0.36);
    g.add(w);
  }
  // Mât brisé, penché
  const mast = new THREE.Mesh(weathered(new THREE.CylinderGeometry(0.15 * size, 0.2 * size, D * 2.2, 5), '#3e2114'), vmat);
  mast.position.set(L * 0.15, D * 2, 0);
  mast.rotation.z = rand.range(-0.6, 0.6);
  g.add(mast);
  // Filet affaissé (fil de fer)
  const net = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.35, D * 1.3, 6, 4), new THREE.MeshLambertMaterial({ color: '#83a39a', wireframe: true }));
  net.position.set(L * 0.3, D * 0.9, B * 0.52);
  net.rotation.y = 0.1;
  g.add(net);

  // Collisions : quelques sphères le long de la coque
  g.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  for (let i = -2; i <= 2; i++) {
    p.set(i * L * 0.2, D * 0.6, 0).applyMatrix4(g.matrixWorld);
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
  const m = new THREE.Mesh(weathered(geo, '#3a3e40', '#26292b', 0.3), vmat);
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
    const z = rand.range(-1110, -880);
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

export function createLandmarks(colliders, uniforms) {
  const group = new THREE.Group();

  // Épaves : une barque dans le récif, le reste dans la zone des épaves
  for (const [x, z, size] of WRECKS) group.add(wreck(x, z, size, colliders));

  // Canyon : aiguilles le long des parois et quelques-unes dans le lit
  for (let i = 0; i < 34; i++) {
    const z = rand.range(-850, -560);
    const side = rand() < 0.5 ? -1 : 1;
    const x = canyonCenter(z) + side * rand.range(20, 70);
    group.add(spire(x, z, rand.range(15, 45)));
  }
  group.add(whale(canyonCenter(-760) + 8, -760, colliders));

  // Abysses
  group.add(glowStalks(160, uniforms));
  return group;
}


