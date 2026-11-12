import * as THREE from 'three';
import { WORLD } from '../config/settings.js';

/**
 * Bulles émises par l'hélice quand le moteur tourne.
 * Petit pool de particules recyclées.
 */
export function createBubbles(max = 120) {
  const positions = new Float32Array(max * 3);
  const life = new Float32Array(max); // 0 = morte, 1 = naissance
  const vel = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));

  const material = new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color('#ccd8cc') } }]),
    vertexShader: /* glsl */ `
      attribute float aLife;
      varying float vLife;
      #include <fog_pars_vertex>
      void main() {
        vLife = aLife;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aLife > 0.0 ? clamp(9.0 / max(-mvPosition.z, 0.1), 1.0, 3.0) : 0.0;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vLife;
      #include <fog_pars_fragment>
      void main() {
        if (vLife <= 0.0) discard;
        gl_FragColor = vec4(uColor, min(1.0, vLife * 2.0) * 0.8);
        #include <fog_fragment>
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  let cursor = 0;
  let accumulator = 0;

  return {
    object: points,
    /**
     * @param {number} dt
     * @param {THREE.Vector3} origin position monde de l'hélice
     * @param {number} rate bulles par seconde
     */
    update(dt, origin, rate) {
      accumulator += rate * dt;
      while (accumulator >= 1) {
        accumulator -= 1;
        const i = cursor;
        cursor = (cursor + 1) % max;
        positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.6;
        positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.6;
        positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.6;
        vel[i * 3] = (Math.random() - 0.5) * 0.8;
        vel[i * 3 + 1] = 0.8 + Math.random() * 1.2;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
        life[i] = 1;
      }
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt / 2.5;
        positions[i * 3] += vel[i * 3] * dt + Math.sin(life[i] * 20 + i) * 0.01;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= 0.97;
        vel[i * 3 + 2] *= 0.97;
        if (positions[i * 3 + 1] > WORLD.SURFACE_Y) life[i] = 0;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
    },
  };
}
