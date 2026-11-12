import * as THREE from 'three';

/**
 * Personnages low-poly construits à partir de primitives.
 * Pivot au sol, face vers +Z. Les membres sont des groupes animables (marche, respiration).
 */
const SKIN = '#b9917a';

const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/**
 * @param {object} look couleurs et accessoires :
 *   coat, legs, skin, hair, hat ('cap' | 'scarf' | 'sou\'wester' | null), long (manteau long), beard
 */
export function createCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tout sauf les jambes (respire, se penche)
  root.add(body);

  const coat = mat(look.coat);
  const legsMat = mat(look.legs ?? '#26292b');
  const skin = mat(look.skin ?? SKIN);
  const hair = mat(look.hair ?? '#3e2114');

  // Jambes (pivot à la hanche)
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.85, 0);
    const legGeo = new THREE.BoxGeometry(0.18, 0.85, 0.2);
    legGeo.translate(0, -0.42, 0);
    hip.add(new THREE.Mesh(legGeo, legsMat));
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), mat('#17191a'));
    boot.position.set(0, -0.8, 0.04);
    hip.add(boot);
    root.add(hip);
    legs.push(hip);
  }

  // Torse (manteau) : cylindre à 6 pans, plus évasé si manteau long
  const torsoGeo = new THREE.CylinderGeometry(0.27, look.long ? 0.42 : 0.32, look.long ? 1.05 : 0.75, 6);
  const torso = new THREE.Mesh(torsoGeo, coat);
  torso.position.y = look.long ? 1.12 : 1.22;
  body.add(torso);

  // Bras (pivot à l'épaule)
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.33, 1.52, 0);
    const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.16);
    armGeo.translate(0, -0.3, 0);
    shoulder.add(new THREE.Mesh(armGeo, coat));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skin);
    hand.position.y = -0.66;
    shoulder.add(hand);
    shoulder.rotation.z = side * 0.08;
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Tête
  const head = new THREE.Group();
  head.position.y = 1.82;
  body.add(head);
  const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), skin);
  face.scale.set(1, 1.15, 1);
  head.add(face);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairCap.position.set(0, 0.04, -0.02);
  head.add(hairCap);
  if (look.beard) {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.12), mat(look.beard));
    beard.position.set(0, -0.14, 0.1);
    head.add(beard);
  }
  if (look.glasses) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.04), mat('#17191a'));
    g.position.set(0, 0.03, 0.18);
    head.add(g);
  }

  // Couvre-chef
  if (look.hat === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.12, 7), mat(look.hatColor ?? '#2a5056'));
    cap.position.y = 0.17;
    head.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16), mat(look.hatColor ?? '#2a5056'));
    visor.position.set(0, 0.12, 0.2);
    head.add(visor);
  } else if (look.hat === 'sowester') {
    // Suroît de marin breton
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 8), coat);
    brim.position.set(0, 0.12, -0.04);
    brim.rotation.x = -0.15;
    head.add(brim);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.23, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), coat);
    crown.position.y = 0.12;
    head.add(crown);
  } else if (look.hat === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(look.hatColor ?? '#3e2114'));
    scarf.position.y = 0.02;
    head.add(scarf);
  }

  root.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });

  let walkPhase = 0;
  return {
    object: root,
    head,
    /**
     * @param {number} dt
     * @param {number} speed vitesse de marche (m/s)
     * @param {number} time
     */
    animate(dt, speed, time) {
      const moving = speed > 0.2;
      walkPhase += dt * (moving ? 2.2 + speed * 1.3 : 0);
      const swing = moving ? Math.sin(walkPhase) * Math.min(0.7, speed * 0.18) : 0;
      legs[0].rotation.x += (swing - legs[0].rotation.x) * 0.3;
      legs[1].rotation.x += (-swing - legs[1].rotation.x) * 0.3;
      arms[0].rotation.x += (-swing * 0.8 - arms[0].rotation.x) * 0.3;
      arms[1].rotation.x += (swing * 0.8 - arms[1].rotation.x) * 0.3;
      // Petit rebond de marche et respiration au repos
      body.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : Math.sin(time * 1.6) * 0.012;
    },
    /** Pas : true une fois par pas (pour le son) */
    stepped() {
      const s = Math.floor(walkPhase / Math.PI);
      if (s !== this._lastStep) {
        this._lastStep = s;
        return true;
      }
      return false;
    },
  };
}

/** Apparence des personnages */
export const LOOKS = {
  player: { coat: '#cdb57c', legs: '#2a2c2e', hat: 'sowester', hair: '#3e2114' }, // ciré jaune
  doctor: { coat: '#a8bdb2', legs: '#26292b', long: true, hair: '#878a85', glasses: true },
  mechanic: { coat: '#2a5056', legs: '#2a5056', hat: 'cap', hatColor: '#3e2114', beard: '#878a85', hair: '#878a85' },
  merchant: { coat: '#63321b', legs: '#26292b', long: true, hat: 'scarf', hatColor: '#26292b' },
};
