import * as THREE from 'three';
import { CLAW } from '../config/settings.js';

/**
 * Modèle du bras articulé : épaule, deux segments télescopiques, coude,
 * poignet et tête à trois doigts. Les pièces vivent dans l'espace monde
 * et sont replacées chaque frame par le contrôleur de la pince.
 */
const UP_Z = new THREE.Vector3(0, 0, 1);

export function createClawModel() {
  const metal = new THREE.MeshLambertMaterial({ color: '#3f4446', flatShading: true });
  const rust = new THREE.MeshLambertMaterial({ color: '#63321b', flatShading: true });
  const rod = new THREE.MeshLambertMaterial({ color: '#878a85', flatShading: true });
  const jaw = new THREE.MeshLambertMaterial({ color: '#5f6564', flatShading: true });

  const group = new THREE.Group();

  /** Segment : gaine fixe + tige télescopique, orienté le long de +Z */
  function makeSegment(thick) {
    const seg = new THREE.Group();
    const sleeveGeo = new THREE.BoxGeometry(thick, thick, 1);
    sleeveGeo.translate(0, 0, 0.5);
    const sleeve = new THREE.Mesh(sleeveGeo, rust);
    const rodGeo = new THREE.BoxGeometry(thick * 0.55, thick * 0.55, 1);
    rodGeo.translate(0, 0, 0.5);
    const inner = new THREE.Mesh(rodGeo, rod);
    seg.add(sleeve, inner);
    seg.userData = { sleeve, inner };
    group.add(seg);
    return seg;
  }

  function makeJoint(r) {
    const j = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), metal);
    group.add(j);
    return j;
  }

  const upper = makeSegment(0.34);
  const lower = makeSegment(0.3);
  const shoulder = makeJoint(0.3);
  const elbow = makeJoint(0.27);

  // --- Tête de pince
  const head = new THREE.Group();
  group.add(head);
  const headScale = new THREE.Group(); // tête agrandie pour la lisibilité
  headScale.scale.setScalar(1.35);
  head.add(headScale);
  const palmGeo = new THREE.CylinderGeometry(0.26, 0.2, 0.3, 6);
  palmGeo.rotateX(Math.PI / 2);
  palmGeo.translate(0, 0, 0.1);
  headScale.add(new THREE.Mesh(palmGeo, metal));

  const fingers = [];
  for (let i = 0; i < 3; i++) {
    const around = new THREE.Group(); // répartit les doigts à 120°
    around.rotation.z = (i / 3) * Math.PI * 2;
    headScale.add(around);
    const hinge = new THREE.Group(); // charnière : s'ouvre autour de X
    hinge.position.set(0, 0.17, 0.25);
    around.add(hinge);
    const proxGeo = new THREE.BoxGeometry(0.09, 0.07, 0.42);
    proxGeo.translate(0, 0, 0.21);
    hinge.add(new THREE.Mesh(proxGeo, jaw));
    const tip = new THREE.Group(); // phalange recourbée vers l'intérieur
    tip.position.z = 0.42;
    tip.rotation.x = 0.75;
    hinge.add(tip);
    const distGeo = new THREE.BoxGeometry(0.08, 0.06, 0.3);
    distGeo.translate(0, 0, 0.15);
    tip.add(new THREE.Mesh(distGeo, jaw));
    fingers.push(hinge);
  }

  const _dir = new THREE.Vector3();

  /** Place un segment entre deux points */
  function placeSegment(seg, from, to) {
    _dir.subVectors(to, from);
    const len = Math.max(_dir.length(), 0.001);
    seg.position.copy(from);
    seg.quaternion.setFromUnitVectors(UP_Z, _dir.divideScalar(len));
    seg.userData.sleeve.scale.z = Math.min(len, CLAW.SLEEVE_LENGTH);
    seg.userData.inner.scale.z = len;
  }

  return {
    group,
    /**
     * @param root épaule, @param elbowPos coude, @param wrist poignet (monde)
     * @param headDir direction de la tête (normalisée)
     * @param open ouverture des doigts 0..1
     */
    pose(root, elbowPos, wrist, headDir, open) {
      placeSegment(upper, root, elbowPos);
      placeSegment(lower, elbowPos, wrist);
      shoulder.position.copy(root);
      elbow.position.copy(elbowPos);
      head.position.copy(wrist);
      head.quaternion.setFromUnitVectors(UP_Z, headDir);
      const angle = 0.08 + open * 0.75;
      for (const f of fingers) f.rotation.x = -angle;
    },
  };
}
