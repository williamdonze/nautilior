import * as THREE from 'three';

/**
 * Modèles low-poly des objets ramassables, construits à partir de primitives.
 * Chaque fonction reçoit deux matériaux (principal + sombre) propres à l'objet,
 * pour pouvoir le mettre en surbrillance individuellement.
 */
const MODEL_SCALE = 1.6;

function mesh(geo, mat) {
  return new THREE.Mesh(geo, mat);
}

const SHAPES = {
  pebble(main) {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.38, 0);
    geo.scale(1, 0.55, 0.8);
    g.add(mesh(geo, main));
    return g;
  },

  bottle(main, dark) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 6), main);
    const shoulder = mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.12, 6), main);
    shoulder.position.y = 0.31;
    const neck = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), main);
    neck.position.y = 0.45;
    const cork = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 5), dark);
    cork.position.y = 0.55;
    g.add(body, shoulder, neck, cork);
    g.rotation.z = Math.PI / 2; // couchée sur le flanc
    return g;
  },

  float(main, dark) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.26, 6, 4), main));
    const rope = mesh(new THREE.TorusGeometry(0.27, 0.025, 3, 8), dark);
    rope.rotation.x = Math.PI / 2;
    g.add(rope);
    return g;
  },

  plate(main, dark) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.05, 8), main));
    const rim = mesh(new THREE.TorusGeometry(0.28, 0.02, 3, 8), dark);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    g.add(rim);
    g.rotation.x = 0.25;
    return g;
  },

  trap(main, dark) {
    const g = new THREE.Group();
    const base = mesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), main);
    g.add(base);
    // Arceaux en demi-cercle
    for (const x of [-0.45, 0, 0.45]) {
      const hoop = mesh(new THREE.TorusGeometry(0.34, 0.035, 3, 6, Math.PI), main);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.set(x, 0.04, 0);
      g.add(hoop);
    }
    // Lattes longitudinales
    for (const a of [0.5, 1.57, 2.64]) {
      const slat = mesh(new THREE.BoxGeometry(1.0, 0.04, 0.05), dark);
      slat.position.set(0, 0.04 + Math.sin(a) * 0.34, Math.cos(a) * 0.34);
      g.add(slat);
    }
    return g;
  },

  anchor(main, dark) {
    const g = new THREE.Group();
    const shank = mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), main);
    g.add(shank);
    const stock = mesh(new THREE.BoxGeometry(0.9, 0.09, 0.09), main);
    stock.position.y = 0.5;
    stock.rotation.y = Math.PI / 2;
    g.add(stock);
    const arms = mesh(new THREE.TorusGeometry(0.45, 0.07, 3, 8, Math.PI), main);
    arms.rotation.z = Math.PI; // arc tourné vers le bas
    arms.position.y = -0.2;
    g.add(arms);
    for (const s of [-1, 1]) {
      const fluke = mesh(new THREE.ConeGeometry(0.12, 0.28, 4), dark);
      fluke.position.set(s * 0.45, -0.12, 0);
      g.add(fluke);
    }
    const ring = mesh(new THREE.TorusGeometry(0.12, 0.03, 3, 6), dark);
    ring.position.y = 0.75;
    g.add(ring);
    g.rotation.z = Math.PI / 2 - 0.15; // couchée
    return g;
  },
};

/**
 * Construit le modèle d'un objet.
 * @returns {{ object: THREE.Group, materials: THREE.Material[] }}
 */
export function createItemModel(item) {
  const main = new THREE.MeshLambertMaterial({ color: item.color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({
    color: new THREE.Color(item.color).multiplyScalar(0.55),
    flatShading: true,
  });
  const build = SHAPES[item.shape] || SHAPES.pebble;
  const inner = build(main, dark);
  // Objets légèrement surdimensionnés : ils restent lisibles malgré la basse résolution
  inner.scale.multiplyScalar(MODEL_SCALE);
  // Groupe extérieur neutre : on peut le tourner / déplacer sans perdre l'orientation du modèle
  const object = new THREE.Group();
  object.add(inner);
  return { object, materials: [main, dark] };
}
