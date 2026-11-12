import * as THREE from 'three';
import { pointScale } from '../core/renderer.js';

/**
 * Effets spéciaux à la capture d'un objet rare :
 * anneaux de lumière qui s'étendent et gerbe d'étincelles de la couleur de la rareté.
 * L'ampleur dépend du niveau de rareté (2 = rare, 3 = épique, 4 = légendaire).
 */
const MAX_SPARKS = 200;

export class CaptureFx {
  constructor(scene) {
    this.scene = scene;
    this.rings = [];
    this.pending = []; // anneaux différés (cascade)

    // --- Étincelles : un seul nuage de points recyclé
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    this.sparkColor = new Float32Array(MAX_SPARKS * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.sparkLife, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.sparkColor, 3));
    this.sparkGeo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPointScale: pointScale },
      vertexShader: /* glsl */ `
        uniform float uPointScale;
      attribute float aLife;
        attribute vec3 aColor;
        varying float vLife;
        varying vec3 vColor;
        void main() {
          vLife = aLife;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife > 0.0 ? clamp(12.0 / max(-mv.z, 0.1), 1.0, 3.0) * uPointScale * 0.7 : 0.0;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying vec3 vColor;
        void main() {
          if (vLife <= 0.0) discard;
          gl_FragColor = vec4(vColor * min(1.0, vLife * 1.5), 1.0);
        }
      `,
    });
    this.sparks = new THREE.Points(geo, mat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  /**
   * @param {THREE.Vector3} position point de capture
   * @param {{level:number,color:string}} rarity
   */
  play(position, rarity) {
    if (rarity.level < 2) return;
    const color = new THREE.Color(rarity.color);
    const rings = rarity.level - 1; // 1, 2 ou 3 anneaux
    for (let i = 0; i < rings; i++) {
      this.pending.push({ delay: i * 0.18, position: position.clone(), color, size: 3 + rarity.level * 1.5 });
    }
    const count = [0, 0, 24, 48, 90][rarity.level];
    for (let i = 0; i < count; i++) this.emitSpark(position, color, 2 + rarity.level);
  }

  emitSpark(origin, color, speed) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_SPARKS;
    this.sparkPos[i * 3] = origin.x;
    this.sparkPos[i * 3 + 1] = origin.y;
    this.sparkPos[i * 3 + 2] = origin.z;
    // Direction aléatoire sur une sphère, biaisée vers le haut
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const s = speed * (0.4 + Math.random() * 0.6);
    this.sparkVel[i * 3] = r * Math.cos(a) * s;
    this.sparkVel[i * 3 + 1] = Math.abs(u) * s * 0.8 + 0.5;
    this.sparkVel[i * 3 + 2] = r * Math.sin(a) * s;
    this.sparkLife[i] = 1;
    this.sparkColor[i * 3] = color.r;
    this.sparkColor[i * 3 + 1] = color.g;
    this.sparkColor[i * 3 + 2] = color.b;
  }

  spawnRing({ position, color, size }) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 20),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, size });
  }

  update(dt, camera) {
    // Anneaux en attente
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay <= 0) {
        this.spawnRing(p);
        this.pending.splice(i, 1);
      }
    }
    // Anneaux : grossissent face à la caméra et s'effacent
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / 0.8;
      if (r.t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - r.t, 3);
      r.mesh.scale.setScalar(0.3 + e * r.size);
      r.mesh.material.opacity = 1 - r.t;
      r.mesh.quaternion.copy(camera.quaternion);
    }
    // Étincelles
    let alive = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      alive = true;
      this.sparkLife[i] -= dt / 1.4;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      // Freinage de l'eau + lente remontée
      this.sparkVel[i * 3] *= 0.95;
      this.sparkVel[i * 3 + 1] = this.sparkVel[i * 3 + 1] * 0.95 + 0.6 * dt;
      this.sparkVel[i * 3 + 2] *= 0.95;
    }
    if (alive || this.wasAlive) {
      this.sparkGeo.attributes.position.needsUpdate = true;
      this.sparkGeo.attributes.aLife.needsUpdate = true;
      this.sparkGeo.attributes.aColor.needsUpdate = true;
    }
    this.wasAlive = alive;
  }
}
