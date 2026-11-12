import * as THREE from 'three';
import { paintFaces } from '../core/utils.js';
import { createNoise2D } from '../world/noise.js';

/**
 * Modèle low-poly du Nautiliar, construit à partir de primitives.
 * Axe avant = +Z local. Peinture vert-de-gris délavée rongée par la rouille.
 */
const noise = createNoise2D(42);

const PAINT = [new THREE.Color('#4b5a52'), new THREE.Color('#56645a'), new THREE.Color('#42504a')];
const RUST = [new THREE.Color('#63321b'), new THREE.Color('#8a4f28'), new THREE.Color('#3e2114')];
const DARK_METAL = new THREE.Color('#26292b');

/** Peint une géométrie : peinture de base + taches de rouille selon un bruit 3D approché */
function rusty(geo, rustAmount = 0.45, base = PAINT) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const c = new THREE.Color();
  paintFaces(geo, (p, n, i) => {
    const v = noise(p.x * 1.4 + p.z * 0.9, p.y * 1.8 - p.z * 0.6) * 0.5 + 0.5;
    // Coulures : la rouille s'accumule vers le bas de la coque
    const drip = noise(p.z * 2.2 + p.x, 3.7) * 0.5 + 0.5;
    const rust = v + (n.y < -0.2 ? 0.15 : 0) + (drip > 0.7 && p.y < 0.4 ? 0.2 : 0);
    if (rust > 1 - rustAmount) return c.copy(RUST[i % 3]);
    return c.copy(base[i % 3]);
  });
  return geo;
}

function darkMetal(geo) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const c = new THREE.Color();
  return paintFaces(geo, (_, __, i) => c.copy(DARK_METAL).multiplyScalar(0.85 + (i % 3) * 0.1));
}

export function createSubmarineModel() {
  const root = new THREE.Group();
  const body = new THREE.Group(); // partie qui tangue / roule
  root.add(body);

  const metal = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: '#cdb57c' });
  const lampGlass = new THREE.MeshBasicMaterial({ color: '#efe3bb' });

  const add = (geo, mat = metal, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    return m;
  };

  // --- Coque principale (cylindre octogonal le long de Z)
  const hull = new THREE.CylinderGeometry(1, 1, 6, 8, 3);
  hull.rotateX(Math.PI / 2);
  add(rusty(hull));

  // Nez arrondi
  const nose = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  nose.rotateX(Math.PI / 2);
  nose.scale(1, 1, 1.1);
  nose.translate(0, 0, 3);
  add(rusty(nose, 0.35));

  // Queue conique
  const tail = new THREE.ConeGeometry(1, 2.4, 8, 2);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -4.2);
  add(rusty(tail, 0.55));

  // Cerclages rivetés
  for (const z of [-2.2, 0, 2.2]) {
    const ring = new THREE.TorusGeometry(1.03, 0.07, 3, 8);
    ring.rotateZ(Math.PI / 8);
    ring.translate(0, 0, z);
    add(darkMetal(ring));
  }

  // --- Kiosque
  const tower = new THREE.CylinderGeometry(0.5, 0.7, 1.2, 6);
  tower.scale(1, 1, 1.6);
  tower.translate(0, 1.35, 0.4);
  add(rusty(tower, 0.5));
  const hatch = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 6);
  hatch.translate(0, 2.0, 0.3);
  add(darkMetal(hatch));
  // Périscope
  const periscope = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 4);
  periscope.translate(0, 2.4, 0.9);
  add(darkMetal(periscope));
  const periscopeHead = new THREE.BoxGeometry(0.16, 0.14, 0.3);
  periscopeHead.translate(0, 2.95, 1.0);
  add(darkMetal(periscopeHead));

  // --- Hublots latéraux (lueur chaude de la cabine)
  for (const side of [-1, 1]) {
    for (const z of [1.2, -0.4]) {
      const port = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6);
      port.rotateZ(Math.PI / 2);
      port.translate(side * 0.98, 0.2, z);
      add(port, glow);
    }
  }

  // --- Phare à l'avant
  const lampHousing = new THREE.CylinderGeometry(0.35, 0.42, 0.4, 6);
  lampHousing.rotateX(Math.PI / 2);
  lampHousing.translate(0, -0.35, 3.95);
  add(darkMetal(lampHousing));
  const lamp = new THREE.CircleGeometry(0.3, 6);
  lamp.translate(0, -0.35, 4.16);
  add(lamp, lampGlass);

  // --- Ailerons
  const finH = new THREE.BoxGeometry(2.8, 0.08, 0.7);
  finH.translate(0, 0, -4.0);
  add(rusty(finH, 0.5));
  const finV = new THREE.BoxGeometry(0.08, 1.8, 0.7);
  finV.translate(0, 0, -4.0);
  add(rusty(finV, 0.5));
  // Petits ailerons de plongée près du nez
  const finFront = new THREE.BoxGeometry(2.6, 0.06, 0.45);
  finFront.translate(0, 0.1, 2.0);
  add(rusty(finFront, 0.5));

  // --- Hélice (groupe animé)
  const propeller = new THREE.Group();
  propeller.position.set(0, 0, -5.45);
  body.add(propeller);
  const hub = new THREE.ConeGeometry(0.18, 0.4, 5);
  hub.rotateX(-Math.PI / 2);
  add(darkMetal(hub), metal, propeller);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.BoxGeometry(0.16, 0.6, 0.05);
    blade.translate(0, 0.33, 0);
    blade.rotateY(0.5);
    blade.rotateZ((i / 3) * Math.PI * 2);
    add(darkMetal(blade), metal, propeller);
  }
  // Carénage d'hélice
  const shroud = new THREE.TorusGeometry(0.7, 0.07, 3, 10);
  shroud.translate(0, 0, -5.45);
  add(rusty(shroud, 0.6));

  return { root, body, propeller, lampPosition: new THREE.Vector3(0, -0.35, 4.2) };
}
