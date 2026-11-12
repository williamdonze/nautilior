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

  net(main) {
    // Boule de filet emmêlé : sphère déformée affichée en fil de fer
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.45, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + Math.abs(Math.sin(i * 12.9898) * 0.4);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.5, pos.getZ(i) * k);
    }
    const wire = main.clone();
    wire.wireframe = true;
    g.add(new THREE.Mesh(geo, wire));
    g.userData.extraMaterials = [wire];
    return g;
  },

  bowl(main, dark) {
    const g = new THREE.Group();
    const cup = new THREE.SphereGeometry(0.24, 7, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    g.add(mesh(cup, Object.assign(main, { side: THREE.DoubleSide })));
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.BoxGeometry(0.1, 0.04, 0.08), dark);
      ear.position.set(s * 0.27, -0.03, 0);
      g.add(ear);
    }
    const foot = mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 7), dark);
    foot.position.y = -0.24;
    g.add(foot);
    g.rotation.x = 0.4;
    return g;
  },

  lantern(main, dark) {
    const g = new THREE.Group();
    const glass = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6), new THREE.MeshLambertMaterial({ color: '#cdb57c', flatShading: true }));
    g.add(glass);
    for (const y of [-0.2, 0.2]) {
      const plate = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6), main);
      plate.position.y = y;
      g.add(plate);
    }
    const roof = mesh(new THREE.ConeGeometry(0.2, 0.16, 6), main);
    roof.position.y = 0.3;
    g.add(roof);
    const handle = mesh(new THREE.TorusGeometry(0.1, 0.02, 3, 6, Math.PI), dark);
    handle.position.y = 0.38;
    g.add(handle);
    g.userData.extraMaterials = [glass.material];
    g.rotation.z = 1.3;
    return g;
  },

  medal(main, dark) {
    const g = new THREE.Group();
    const disk = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), main);
    disk.rotation.x = Math.PI / 2;
    g.add(disk);
    const ribbon = mesh(new THREE.BoxGeometry(0.14, 0.22, 0.02), dark);
    ribbon.position.y = 0.24;
    g.add(ribbon);
    g.rotation.x = -Math.PI / 2 + 0.1; // à plat
    return g;
  },

  watch(main, dark) {
    const g = new THREE.Group();
    const face = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8), main);
    g.add(face);
    const crown = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 4), main);
    crown.rotation.z = Math.PI / 2;
    crown.position.x = 0.18;
    g.add(crown);
    const chain = mesh(new THREE.TorusGeometry(0.12, 0.012, 3, 8), dark);
    chain.rotation.x = Math.PI / 2 - 0.3;
    chain.position.x = 0.32;
    g.add(chain);
    return g;
  },

  bell(main, dark) {
    const g = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.55, 8, 1, true), Object.assign(main, { side: THREE.DoubleSide }));
    g.add(body);
    const dome = mesh(new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), main);
    dome.position.y = 0.27;
    g.add(dome);
    const lip = mesh(new THREE.TorusGeometry(0.42, 0.04, 3, 8), main);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -0.27;
    g.add(lip);
    const clapper = mesh(new THREE.IcosahedronGeometry(0.08, 0), dark);
    clapper.position.y = -0.2;
    g.add(clapper);
    const yoke = mesh(new THREE.TorusGeometry(0.08, 0.03, 3, 6, Math.PI), dark);
    yoke.position.y = 0.45;
    g.add(yoke);
    g.rotation.z = 1.2; // renversée sur le flanc
    return g;
  },

  chalice(main, dark) {
    const g = new THREE.Group();
    const cup = mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.25, 7, 1, true), Object.assign(main, { side: THREE.DoubleSide }));
    cup.position.y = 0.2;
    g.add(cup);
    const lid = mesh(new THREE.SphereGeometry(0.2, 7, 2, 0, Math.PI * 2, 0, Math.PI / 2), main);
    lid.position.y = 0.32;
    g.add(lid);
    const cross = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), dark);
    cross.position.y = 0.56;
    g.add(cross);
    const stem = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 5), main);
    g.add(stem);
    const base = mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.06, 7), main);
    base.position.y = -0.12;
    g.add(base);
    g.rotation.z = 1.4;
    return g;
  },

  sextant(main, dark) {
    const g = new THREE.Group();
    const arc = mesh(new THREE.TorusGeometry(0.4, 0.035, 3, 8, Math.PI / 3), main);
    arc.rotation.z = -Math.PI / 2 - Math.PI / 6;
    g.add(arc);
    for (const a of [-Math.PI / 6, Math.PI / 6]) {
      const bar = mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), main);
      bar.position.set(Math.sin(a) * 0.2, -Math.cos(a) * 0.2, 0);
      bar.rotation.z = a;
      g.add(bar);
    }
    const scope = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5), dark);
    scope.rotation.z = Math.PI / 2;
    scope.position.y = -0.12;
    g.add(scope);
    g.rotation.x = -Math.PI / 2; // à plat
    return g;
  },

  key(main, dark) {
    const g = new THREE.Group();
    const shaft = mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), main);
    g.add(shaft);
    const bow = mesh(new THREE.TorusGeometry(0.11, 0.035, 3, 7), main);
    bow.position.x = -0.4;
    g.add(bow);
    for (const [x, h] of [[0.22, 0.14], [0.27, 0.1]]) {
      const bit = mesh(new THREE.BoxGeometry(0.04, h, 0.05), dark);
      bit.position.set(x, -h / 2, 0);
      g.add(bit);
    }
    g.rotation.x = -Math.PI / 2;
    return g;
  },

  crown(main, dark) {
    const g = new THREE.Group();
    const band = mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.14, 8, 1, true), Object.assign(main, { side: THREE.DoubleSide }));
    g.add(band);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), main);
      spike.position.set(Math.cos(a) * 0.27, 0.15, Math.sin(a) * 0.27);
      g.add(spike);
    }
    // Algues accrochées
    const weedMat = new THREE.MeshLambertMaterial({ color: '#2f4a33', flatShading: true });
    g.userData.extraMaterials = [weedMat];
    for (let i = 0; i < 3; i++) {
      const weed = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.02), weedMat);
      const a = i * 2.1;
      weed.position.set(Math.cos(a) * 0.29, -0.08, Math.sin(a) * 0.29);
      weed.rotation.z = 0.4;
      g.add(weed);
    }
    g.rotation.z = 0.35;
    return g;
  },

  porthole(main, dark) {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.3, 0.08, 4, 10), main);
    g.add(ring);
    const glass = mesh(new THREE.CircleGeometry(0.26, 10), new THREE.MeshLambertMaterial({ color: '#17323b', side: THREE.DoubleSide }));
    g.add(glass);
    for (let i = 0; i < 4; i++) {
      const bolt = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), dark);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      bolt.position.set(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0);
      g.add(bolt);
    }
    g.userData.extraMaterials = [glass.material];
    g.rotation.x = -Math.PI / 2 + 0.2;
    return g;
  },

  tile(main) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), main));
    return g;
  },

  wheel(main, dark) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.45, 0.05, 4, 10), main));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6).rotateX(Math.PI / 2), dark));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), main);
      spoke.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
      spoke.rotation.z = a - Math.PI / 2;
      g.add(spoke);
    }
    g.rotation.x = -Math.PI / 2 + 0.3;
    return g;
  },

  statue(main, dark) {
    const g = new THREE.Group();
    const base = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), dark);
    g.add(base);
    const body = mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.55, 6), main);
    body.position.y = 0.32;
    g.add(body);
    const head = mesh(new THREE.IcosahedronGeometry(0.09, 0), main);
    head.position.y = 0.67;
    g.add(head);
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.BoxGeometry(0.05, 0.25, 0.06), main);
      arm.position.set(s * 0.1, 0.62, 0.02);
      arm.rotation.z = s * 0.5;
      g.add(arm);
    }
    g.rotation.z = 1.3;
    return g;
  },

  tear(main) {
    const g = new THREE.Group();
    const drop = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), main);
    drop.position.y = 0.15;
    g.add(drop);
    const bottom = mesh(new THREE.SphereGeometry(0.12, 6, 4), main);
    g.add(bottom);
    g.rotation.z = 1.2;
    return g;
  },

  /* --- Objets-souvenirs (fragments de mémoire) --- */
  keepsake_photo(main) {
    const g = new THREE.Group();
    const card = mesh(new THREE.BoxGeometry(0.42, 0.02, 0.3), main);
    g.add(card);
    const picture = mesh(new THREE.BoxGeometry(0.34, 0.025, 0.22), new THREE.MeshLambertMaterial({ color: '#7d6f48', flatShading: true }));
    g.add(picture);
    g.userData.extraMaterials = [picture.material];
    g.rotation.x = 0.15;
    return g;
  },
  keepsake_ring(main) {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.12, 0.035, 4, 10), new THREE.MeshLambertMaterial({ color: '#e0b050', flatShading: true }));
    ring.rotation.x = Math.PI / 2 - 0.3;
    g.add(ring);
    g.userData.extraMaterials = [ring.material];
    return g;
  },
  keepsake_tag(main, dark) {
    return SHAPES.medal(main, dark);
  },
  keepsake_logbook(main, dark) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 0.3), dark));
    const pages = mesh(new THREE.BoxGeometry(0.37, 0.08, 0.27), main);
    pages.position.set(0.01, 0.01, 0);
    g.add(pages);
    return g;
  },
  keepsake_newspaper(main) {
    const g = new THREE.Group();
    const paper = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), main);
    paper.rotation.y = 0.3;
    g.add(paper);
    return g;
  },
  keepsake_watch(main, dark) {
    return SHAPES.watch(main, dark);
  },
  keepsake_memorial(main, dark) {
    const g = new THREE.Group();
    const slab = mesh(new THREE.BoxGeometry(0.8, 0.12, 0.55), new THREE.MeshLambertMaterial({ color: '#6b6e6c', flatShading: true }));
    g.add(slab);
    g.userData.extraMaterials = [slab.material];
    g.rotation.z = 0.15;
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
  // Certains modèles ont leurs propres matériaux (verre, fil de fer…) : on les inclut pour la surbrillance
  const materials = [main, dark, ...(inner.userData.extraMaterials ?? [])];
  return { object, materials };
}
