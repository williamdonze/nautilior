import * as THREE from 'three';
import { createNoise2D } from './noise.js';
import { applyDetail } from './detail.js';
import { createPillar } from '../loot/glow.js';

/**
 * Autour de la déchirure, tout s'emballe : des blocs arrachés au fond montent en spirale,
 * des rais de lumière balaient l'eau, des éclairs verts claquent, et à chaque battement
 * une onde part sur la plaine. Plus on approche, plus c'est fort.
 * Le rythme vient du sonar (beat()), l'intensité du portail (open).
 */
const noise = createNoise2D(4242);
const TAU = Math.PI * 2;
const DEBRIS = 150, SHAFTS = 14, ARCS = 6, ARC_SEG = 16, RINGS = 4;

export class PortalFx {
  constructor(scene, portal) {
    this.portal = portal;
    const C = (this.center = portal.center);
    this.floor = portal.group.position.y - 7;
    const g = (this.group = new THREE.Group());
    scene.add(g);

    // --- Débris : blocs de roche qui montent en tournant autour de la plaie, de plus en plus vite
    const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + noise(x * 2 + y, z * 2) * 0.35; p.setXYZ(i, x * d, y * d * 0.7, z * d); }
    geo.computeVertexNormals();
    this.debris = new THREE.InstancedMesh(geo, applyDetail(new THREE.MeshLambertMaterial({ color: '#6b6e6a' }), 'rock', 1), DEBRIS);
    this.debris.frustumCulled = false;
    g.add(this.debris);
    this.rocks = Array.from({ length: DEBRIS }, (_, i) => ({ r: 6 + Math.pow(Math.random(), 0.7) * 46, a: Math.random() * TAU, h: Math.random(), s: 0.25 + Math.pow(Math.random(), 3) * 2.4, w: 0.25 + Math.random() * 0.6, spin: new THREE.Vector3().randomDirection(), ph: i * 1.7 }));

    // --- Rais de lumière qui sortent de la plaie et balaient l'eau
    this.shafts = [];
    for (let i = 0; i < SHAFTS; i++) {
      const m = createPillar('#7fe89a', 70);
      m.frustumCulled = false;
      m.position.set(C.x, C.y + (Math.random() - 0.5) * 20, C.z);
      g.add(m);
      this.shafts.push({ m, axis: new THREE.Vector3().randomDirection(), dir: new THREE.Vector3().randomDirection(), speed: 0.08 + Math.random() * 0.2, ph: Math.random() * 10 });
    }

    // --- Éclairs : rubans à trois faces, redessinés plusieurs fois par seconde
    this.arcs = [];
    for (let i = 0; i < ARCS; i++) {
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_SEG + 1) * 3 * 3), 3));
      const idx = [];
      for (let s = 0; s < ARC_SEG; s++) for (let k = 0; k < 3; k++) { const a = s * 3 + k, b = s * 3 + ((k + 1) % 3); idx.push(a, b, a + 3, b, b + 3, a + 3); }
      ag.setIndex(idx);
      ag.userData.dynamic = true;
      ag.boundingSphere = new THREE.Sphere(C.clone(), 200);
      const m = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: '#c8ffd0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      g.add(m);
      this.arcs.push({ m, timer: Math.random(), life: 0 });
    }

    // --- Ondes : à chaque battement, un anneau s'élargit sur la plaine
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8fffb0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(C.x, this.floor + 1.2, C.z);
      m.frustumCulled = false;
      g.add(m);
      this.rings.push({ m, t: 9 });
    }
    this.nextRing = 0;
    this.pulse = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** Battement de cœur : une onde part, tout s'illumine un instant */
  beat() {
    this.pulse = 1;
    const r = this.rings[this.nextRing++ % RINGS];
    r.t = 0;
  }

  /** Redessine un éclair : de la plaie vers un point au hasard, en ligne brisée */
  strike(arc) {
    const C = this.center, pos = arc.m.geometry.attributes.position.array;
    const from = this._v.set(C.x, C.y + (Math.random() - 0.5) * 24, C.z);
    const dir = new THREE.Vector3().randomDirection(), len = 12 + Math.random() * 38;
    dir.y = dir.y * 0.6 - 0.15;
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0.3, 1, 0.2)).normalize(), up = new THREE.Vector3().crossVectors(dir, side);
    let ox = 0, oy = 0;
    for (let s = 0; s <= ARC_SEG; s++) {
      const t = s / ARC_SEG, w = 0.22 * (1 - t * 0.8);
      ox += (Math.random() - 0.5) * 2.6 * (s ? 1 : 0); oy += (Math.random() - 0.5) * 2.6 * (s ? 1 : 0);
      const x = from.x + dir.x * len * t + side.x * ox + up.x * oy, y = from.y + dir.y * len * t + side.y * ox + up.y * oy, z = from.z + dir.z * len * t + side.z * ox + up.z * oy;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU, o = (s * 3 + k) * 3;
        pos[o] = x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * w; pos[o + 1] = y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * w; pos[o + 2] = z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * w;
      }
    }
    arc.m.geometry.attributes.position.needsUpdate = true;
    arc.life = 0.12 + Math.random() * 0.18;
  }

  /**
   * @param {number} near proximité du sous-marin (0 loin … 1 tout près)
   * @returns {boolean} true si un éclair vient de claquer (pour le son)
   */
  update(dt, time, near) {
    const open = this.portal.open, k = open * (0.35 + 0.65 * near);
    this.group.visible = near > 0.001 && open > 0.01;
    if (!this.group.visible) return false;
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    const C = this.center;

    // Débris en spirale ascendante
    this.rocks.forEach((r, i) => {
      r.a += dt * r.w * (0.4 + 26 / (r.r + 8)) * (0.5 + open);
      r.h = (r.h + dt * (0.012 + 0.03 * r.w) * open) % 1;
      const rad = r.r * (1 - r.h * 0.55), y = this.floor + 1 + r.h * 62 + Math.sin(time * 0.7 + r.ph) * 1.2;
      // ils sortent du sol et s'effacent en haut (échelle)
      const sc = r.s * Math.min(1, r.h * 9) * Math.min(1, (1 - r.h) * 5);
      this._q.setFromAxisAngle(r.spin, time * r.w + r.ph);
      this.debris.setMatrixAt(i, this._m.compose(this._v.set(C.x + Math.cos(r.a) * rad, y, C.z + Math.sin(r.a) * rad), this._q, this._s.setScalar(sc * open + 0.001)));
    });
    this.debris.instanceMatrix.needsUpdate = true;

    // Rais de lumière
    for (const s of this.shafts) {
      this._q.setFromAxisAngle(s.axis, time * s.speed + s.ph);
      this._v.copy(s.dir).applyQuaternion(this._q);
      s.m.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this._v);
      const flick = 0.5 + 0.5 * Math.sin(time * 1.7 + s.ph * 3);
      s.m.material.uniforms.uOpacity.value = (0.1 + 0.5 * flick * flick + this.pulse * 0.5) * k;
      s.m.scale.set(3 + this.pulse * 3, 1, 3 + this.pulse * 3);
    }

    // Éclairs
    let cracked = false;
    for (const a of this.arcs) {
      a.timer -= dt * (0.6 + 2.2 * near);
      a.life -= dt;
      if (a.timer <= 0) { this.strike(a); a.timer = 0.15 + Math.random() * 1.1; cracked = true; }
      a.m.visible = a.life > 0;
      a.m.material.opacity = Math.min(1, a.life * 9) * k * 1.6;
    }

    // Ondes au sol
    for (const r of this.rings) {
      r.t += dt;
      const t = r.t / 2.6;
      r.m.visible = t < 1;
      r.m.scale.setScalar(3 + t * 110);
      r.m.material.opacity = (1 - t) * (1 - t) * 0.9 * k;
    }
    return cracked;
  }
}
