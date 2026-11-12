import * as THREE from 'three';
import floraData from '../config/flora.json';
import { WORLD, SEABED } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';

/**
 * Flore marine : forêts de laminaires, herbiers, fucus des épaves, gorgones, éponges.
 * Tout est instancié (une poignée d'appels de rendu), découpé en bandes le long du monde
 * pour que ce qui est hors champ ne soit pas dessiné.
 *
 * Interaction : le sous-marin laisse un « sillage » (ses dernières positions).
 * Dans le vertex shader, chaque brin est repoussé loin de ce sillage puis revient
 * en ondulant quand le sous-marin s'éloigne.
 */
const WAKE_POINTS = 8;
const BAND = 60; // découpage en bandes le long de Z (m) : plus fin = meilleur culling

/** Uniformes partagés par toute la flore (temps, sillage du sous-marin) */
export const floraUniforms = {
  uTime: { value: 0 },
  uWake: { value: Array.from({ length: WAKE_POINTS }, () => new THREE.Vector4(0, 9999, 0, 0)) },
};

/* ------------------------------------------------------------ Géométries (pied en y = 0, hauteur 1) */

function kelpGeometry() {
  // Lanière : un ruban qui se vrille, s'élargit un peu puis s'effile, bords ondulés
  const geo = new THREE.PlaneGeometry(1, 1, 1, 10);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const width = (0.35 + Math.sin(Math.min(1, y * 1.3) * Math.PI) * 0.65) * (1 - y * 0.5);
    const ruffle = Math.sin(y * 28) * 0.1 * Math.abs(x) * 2;
    const twist = y * 2.2;
    const px = x * width;
    pos.setXYZ(i, px * Math.cos(twist), y, px * Math.sin(twist) + ruffle);
  }
  geo.computeVertexNormals();
  return geo;
}

function grassGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.1, 1, 0.15], 3));
  geo.computeVertexNormals();
  return geo;
}

function fanGeometry() {
  // Gorgone : éventail ajouré sur un petit pied
  const geo = new THREE.CircleGeometry(0.5, 9, 0, Math.PI);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setXYZ(i, x, y * 1.6 + 0.2, Math.sin(x * 6) * 0.06);
  }
  geo.computeVertexNormals();
  return geo;
}

function tubeGeometry() {
  const geo = new THREE.CylinderGeometry(0.5, 0.38, 1, 7, 2, true);
  geo.translate(0, 0.5, 0);
  return geo;
}

const SHAPES = { kelp: kelpGeometry, grass: grassGeometry, fan: fanGeometry, tube: tubeGeometry };

/* ------------------------------------------------------------ Matériau qui ondule et s'écarte */

function floraMaterial(sway, push) {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = floraUniforms.uTime;
    shader.uniforms.uWake = floraUniforms.uWake;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec4 uWake[${WAKE_POINTS}];`
      )
      .replace(
        '#include <project_vertex>',
        `
        // Position monde du sommet et du pied de la plante
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float h = clamp(position.y, 0.0, 1.0);
        float bend = h * h;
        float plantH = max(wp.y - root.y, 0.0);
        float phase = uTime * 0.9 + root.x * 0.13 + root.z * 0.11;
        // Courant : balancement lent
        wp.x += sin(phase) * bend * ${sway.toFixed(3)} * (0.6 + plantH * 0.12);
        wp.z += cos(phase * 0.8 + 1.3) * bend * ${(sway * 0.7).toFixed(3)} * (0.6 + plantH * 0.12);
        // Sillage du sous-marin : on écarte la plante, avec un frémissement
        vec3 push = vec3(0.0);
        for (int i = 0; i < ${WAKE_POINTS}; i++) {
          vec4 w = uWake[i];
          if (w.w <= 0.0) continue;
          vec3 d = wp.xyz - w.xyz;
          float dist = length(d.xz);
          float infl = (1.0 - smoothstep(0.0, 7.0, dist)) * (1.0 - smoothstep(3.5, 9.0, abs(d.y))) * w.w;
          push += vec3(d.x, 0.0, d.z) / max(dist, 0.3) * infl;
        }
        float pushLen = length(push);
        float shiver = 1.0 + 0.35 * sin(uTime * 7.0 + phase * 3.0);
        wp.xyz += push * bend * ${push.toFixed(3)} * shiver;
        wp.y -= pushLen * bend * ${(push * 0.45).toFixed(3)};
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        `
      );
  };
  return mat;
}

/* ------------------------------------------------------------ Placement */

function placeSpecies(sp, rand, noise) {
  const out = [];
  const zTop = SEABED.Z_START - 10, zBottom = SEABED.Z_END + 10;
  const halfW = SEABED.WIDTH / 2 - 15;
  let tries = 0;
  while (out.length < sp.count && tries < sp.count * 40) {
    tries++;
    // Un massif : un centre, puis quelques plants autour
    const cx = rand.range(-halfW, halfW);
    const cz = rand.range(zBottom, zTop);
    const depth = -getFloorHeight(cx, cz);
    if (depth < sp.minDepth || depth > sp.maxDepth) continue;
    if (noise(cx * sp.patch.scale, cz * sp.patch.scale) < sp.patch.threshold) continue;
    const n = Math.ceil(rand.range(sp.clump * 0.5, sp.clump * 1.5));
    for (let k = 0; k < n && out.length < sp.count; k++) {
      const x = cx + rand.range(-1, 1) * sp.clump * 0.8;
      const z = cz + rand.range(-1, 1) * sp.clump * 0.8;
      const y = getFloorHeight(x, z);
      // Pas sur les parois trop raides
      const slope = Math.abs(getFloorHeight(x + 1, z) - y) + Math.abs(getFloorHeight(x, z + 1) - y);
      if (slope > 1.6) continue;
      out.push({ x, y: y - 0.15, z });
    }
  }
  return out;
}

export function createFlora() {
  const group = new THREE.Group();
  const rand = createRandom(WORLD.SEED + 2024);
  const noise = createNoise2D(WORLD.SEED + 77);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const e = new THREE.Euler();
  const color = new THREE.Color();

  for (const sp of floraData.species) {
    const geo = SHAPES[sp.shape]();
    const mat = floraMaterial(sp.sway, sp.push);
    const plants = placeSpecies(sp, rand, noise);
    // Regroupe par bande le long de Z (une InstancedMesh par bande → culling hors champ)
    const bands = new Map();
    for (const pl of plants) {
      const b = Math.floor(pl.z / BAND);
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b).push(pl);
    }
    for (const list of bands.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((pl, i) => {
        const h = rand.range(sp.height[0], sp.height[1]);
        const w = rand.range(sp.width[0], sp.width[1]);
        s.set(sp.shape === 'tube' ? w : w, h, sp.shape === 'tube' ? w : w);
        e.set(rand.range(-0.12, 0.12), rand() * Math.PI * 2, rand.range(-0.12, 0.12));
        q.setFromEuler(e);
        p.set(pl.x, pl.y, pl.z);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, color.set(rand.pick(sp.colors)).multiplyScalar(rand.range(0.8, 1.15)));
      });
      mesh.computeBoundingSphere();
      // Le balancement et le sillage débordent un peu de la boîte d'origine
      mesh.boundingSphere.radius += 12;
      group.add(mesh);
    }
  }
  return group;
}

/**
 * Sillage du sous-marin : le point 0 suit la coque, les suivants gardent ses positions passées
 * et s'affaiblissent, pour que les algues mettent un moment à se redresser.
 */
export class Wake {
  constructor() {
    this.timer = 0;
  }

  /**
   * @param {THREE.Vector3} position centre du sous-marin
   * @param {THREE.Vector3} nose point à l'avant (dégage la vue du poste de pilotage)
   */
  update(dt, time, position, speed, nose) {
    floraUniforms.uTime.value = time;
    const w = floraUniforms.uWake.value;
    // 0 : l'avant, 1 : le centre, 2..7 : positions passées qui s'estompent
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.18;
      for (let i = WAKE_POINTS - 1; i > 2; i--) w[i].copy(w[i - 1]);
      w[2].copy(w[1]);
    }
    w[0].set(nose.x, nose.y, nose.z, 1);
    w[1].set(position.x, position.y, position.z, 1);
    for (let i = 2; i < WAKE_POINTS; i++) w[i].w *= Math.exp(-dt * (0.9 + 0.3 * i - Math.min(speed, 4) * 0.1));
  }
}
