import * as THREE from 'three';
import { LAYOUT } from '../config/settings.js';
import { getFloorHeight } from './seabed.js';

/**
 * Le lac de la Salle : au fond de la caverne, une nappe plus lourde que l'eau, noire et lisse,
 * avec sa propre surface et sa propre rive. Elle luit à peine ; des rides la parcourent lentement.
 * (Les lacs de saumure existent vraiment au fond des mers. Ici, c'est ce qui reste d'immobile en lui.)
 */
export function createBrineLake(scene) {
  const S = LAYOUT.SALLE, R = 26;
  const g = new THREE.Group();
  // la cuvette fait 6,5 m de creux (voir seabed.js) : la nappe la remplit aux deux tiers, le bord dessine la rive
  const level = getFloorHeight(S.x, S.z) + 4.2;
  g.position.set(S.x, level, S.z);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#06140f', transparent: true, opacity: 0.86, depthWrite: false }));
  surface.raycast = () => {};
  g.add(surface);
  // la rive luit ; des rides partent du centre
  const shore = new THREE.Mesh(new THREE.RingGeometry(R - 0.6, R + 0.5, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fe8c0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  shore.position.y = 0.05;
  shore.raycast = () => {};
  g.add(shore);
  const rings = [0, 1, 2, 3].map((i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9ff2d2', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.y = 0.06;
    m.userData.phase = i / 4;
    m.raycast = () => {};
    g.add(m);
    return m;
  });
  const light = new THREE.PointLight('#7fe8c0', 16, 70, 1.2);
  light.position.y = 3;
  g.add(light);
  scene.add(g);
  return {
    group: g,
    center: g.position,
    radius: R,
    update(time, viewer) {
      g.visible = Math.hypot(viewer.x - S.x, viewer.z - S.z) < 260;
      if (!g.visible) return;
      for (const r of rings) {
        const t = (time * 0.05 + r.userData.phase) % 1;
        r.scale.setScalar(1 + t * (R - 1.5));
        r.material.opacity = 0.22 * Math.sin(t * Math.PI);
      }
      shore.material.opacity = 0.28 + 0.1 * Math.sin(time * 0.7);
      light.intensity = 14 + Math.sin(time * 0.5) * 3;
    },
  };
}
