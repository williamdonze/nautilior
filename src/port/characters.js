import * as THREE from 'three';

/**
 * Personnages du village, aux volumes lisses.
 * Pivot au sol, face vers +Z. Les membres sont des groupes animables (marche, respiration).
 */
const SKIN = '#b9917a';

const mat = (color) => new THREE.MeshLambertMaterial({ color });

/**
 * Personnage aux volumes lisses : manteau tourné (profil de révolution), membres en capsules,
 * visage modelé (nez, oreilles, arcades, yeux), cheveux, barbe, couvre-chef.
 * @param {object} look couleurs et accessoires :
 *   coat, legs, skin, hair, hat ('cap' | 'scarf' | 'sowester' | null), hatColor, long (manteau long), beard, glasses
 */
export function createCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tout sauf les jambes (respire, se penche)
  root.add(body);
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };

  const coat = mat(look.coat);
  const legsMat = mat(look.legs ?? '#26292b');
  const skin = mat(look.skin ?? SKIN);
  const hair = mat(look.hair ?? '#3e2114');
  const dark = mat('#17191a');

  // Jambes (pivot à la hanche) : cuisse et mollet d'un seul tenant, botte arrondie
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.88, 0);
    add(hip, new THREE.CapsuleGeometry(0.085, 0.6, 6, 14), legsMat, 0, -0.4, 0);
    add(hip, new THREE.SphereGeometry(0.1, 14, 10).scale(1, 0.75, 1.65), dark, 0, -0.8, 0.05);
    add(hip, new THREE.CylinderGeometry(0.1, 0.105, 0.16, 14), dark, 0, -0.7, 0);
    root.add(hip);
    legs.push(hip);
  }

  // Manteau : profil de révolution, épaules tombantes, taille marquée, pan qui s'évase
  const hem = look.long ? 0.62 : 0.92;
  const prof = [[0.02, 1.62], [0.13, 1.6], [0.24, 1.52], [0.285, 1.4], [0.265, 1.18], [0.25, 1.02], [look.long ? 0.31 : 0.27, 0.9], [look.long ? 0.37 : 0.28, hem], [look.long ? 0.35 : 0.26, hem - 0.01]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = add(body, new THREE.LatheGeometry(prof, 24), coat);
  torso.scale.z = 0.72; // un corps est plus large qu'épais
  // col relevé, boutons
  add(body, new THREE.TorusGeometry(0.115, 0.035, 8, 20).rotateX(Math.PI / 2), coat, 0, 1.6, 0);
  for (let i = 0; i < 4; i++) add(body, new THREE.SphereGeometry(0.016, 8, 6), dark, 0.02, 1.42 - i * 0.13, 0.2 - i * 0.004);

  // Bras (pivot à l'épaule) : manche, poignet, main
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.285, 1.5, 0);
    add(shoulder, new THREE.SphereGeometry(0.074, 14, 10), coat, -side * 0.015, -0.01, 0);
    add(shoulder, new THREE.CapsuleGeometry(0.068, 0.46, 6, 12), coat, 0, -0.3, 0);
    add(shoulder, new THREE.SphereGeometry(0.058, 12, 10).scale(0.85, 1.15, 1), skin, 0, -0.64, 0.01);
    shoulder.rotation.z = side * 0.09;
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Tête : crâne, mâchoire, nez, oreilles, yeux enfoncés sous l'arcade
  const head = new THREE.Group();
  head.position.y = 1.81;
  head.scale.setScalar(1.1);
  body.add(head);
  add(body, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 12), skin, 0, 1.66, 0);
  add(head, new THREE.SphereGeometry(0.165, 24, 18).scale(0.92, 1.08, 1), skin, 0, 0.02, 0);
  add(head, new THREE.SphereGeometry(0.12, 18, 12).scale(0.95, 0.8, 0.95), skin, 0, -0.09, 0.035); // mâchoire
  add(head, new THREE.SphereGeometry(0.03, 10, 8).scale(0.8, 1.2, 1.3), skin, 0, -0.01, 0.165); // nez
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.032, 10, 8).scale(0.45, 1, 0.75), skin, side * 0.155, 0, 0);
    add(head, new THREE.SphereGeometry(0.017, 10, 8), dark, side * 0.06, 0.035, 0.143);
    add(head, new THREE.SphereGeometry(0.035, 10, 6).scale(1.2, 0.35, 0.6), hair, side * 0.06, 0.075, 0.14); // sourcil
  }
  add(head, new THREE.SphereGeometry(0.03, 10, 6).scale(1.5, 0.3, 0.5), mat('#6a4038'), 0, -0.085, 0.14); // bouche
  // Cheveux : calotte et nuque
  add(head, new THREE.SphereGeometry(0.176, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.94, 1.08, 1.03), hair, 0, 0.035, -0.012);
  add(head, new THREE.SphereGeometry(0.15, 16, 10).scale(1, 0.9, 0.7), hair, 0, -0.03, -0.075);
  if (look.beard) {
    const b = mat(look.beard);
    add(head, new THREE.SphereGeometry(0.125, 18, 12).scale(1, 0.95, 0.9), b, 0, -0.12, 0.045);
    add(head, new THREE.SphereGeometry(0.04, 10, 6).scale(1.6, 0.45, 0.6), b, 0, -0.055, 0.15);
  }
  if (look.glasses) {
    for (const side of [-1, 1]) add(head, new THREE.TorusGeometry(0.034, 0.005, 6, 18), dark, side * 0.06, 0.035, 0.156);
    add(head, new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6).rotateZ(Math.PI / 2), dark, 0, 0.04, 0.158);
  }

  // Couvre-chef
  if (look.hat === 'cap') {
    const c = mat(look.hatColor ?? '#2a5056');
    add(head, new THREE.SphereGeometry(0.185, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(1, 0.85, 1.05), c, 0, 0.07, -0.01);
    add(head, new THREE.CylinderGeometry(0.182, 0.186, 0.05, 22), c, 0, 0.115, -0.01);
    add(head, new THREE.SphereGeometry(0.12, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.12, 1.1), dark, 0, 0.1, 0.15); // visière
  } else if (look.hat === 'sowester') {
    // Suroît : calotte ronde, bord qui descend loin sur la nuque
    add(head, new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.02), coat, 0, 0.08, -0.01);
    const brim = [[0.19, 0.02], [0.27, -0.005], [0.34, -0.05], [0.335, -0.06], [0.19, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
    const b = add(head, new THREE.LatheGeometry(brim, 28), coat, 0, 0.09, -0.05);
    b.scale.z = 1.25;
    b.rotation.x = -0.2;
  } else if (look.hat === 'scarf') {
    // Fichu noué sous le menton
    const c = mat(look.hatColor ?? '#3e2114');
    // (ouvert sur le visage : la sphère s'arrête de part et d'autre de l'avant)
    add(head, new THREE.SphereGeometry(0.19, 22, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.72).scale(0.98, 1.1, 1.06), new THREE.MeshLambertMaterial({ color: look.hatColor ?? '#3e2114', side: THREE.DoubleSide }), 0, 0.03, -0.02);
    add(head, new THREE.SphereGeometry(0.19, 22, 8, 0, Math.PI * 2, 0, Math.PI * 0.3).scale(0.98, 1.1, 1.06), c, 0, 0.03, -0.02);
    add(head, new THREE.SphereGeometry(0.035, 10, 8), c, 0, -0.17, 0.1);
    add(head, new THREE.ConeGeometry(0.03, 0.11, 8), c, 0.03, -0.23, 0.1).rotation.z = 0.4;
  }

  root.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });

  let walkPhase = 0;
  return {
    object: root,
    head,
    body,
    arms,
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
