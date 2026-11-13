import * as THREE from 'three';
import floraData from '../config/flora.json';
import { WORLD, SEABED } from '../config/settings.js';
import { createRandom } from '../core/utils.js';
import { createNoise2D } from './noise.js';
import { getFloorHeight } from './seabed.js';
import { tileKey, registerSmall } from './tiles.js';

/**
 * Flore marine : forêts de laminaires, herbiers, fucus des épaves, gorgones, éponges.
 * Tout est instancié (une poignée d'appels de rendu), découpé en bandes le long du monde
 * pour que ce qui est hors champ ne soit pas dessiné.
 *
 * Interaction : un « champ de déplacement » (grille de ressorts autour du sous-marin, simulée
 * sur le processeur et envoyée au GPU comme texture). Le sous-marin pousse les cellules qu'il
 * traverse ; chaque cellule revient ensuite à zéro en oscillant comme un ressort amorti.
 * Le shader lit ce champ au pied de chaque plante : toute la plante se couche d'un seul tenant
 * (plus de brins étirés), puis se redresse en se balançant.
 */
const GRID = 128; // cellules par côté
const CELL = 1; // taille d'une cellule (m) → la grille couvre 128 m et se répète au-delà

/** Texture du champ de déplacement : (dx, dz) par cellule, répétée sur tout le monde */
const fieldData = new Float32Array(GRID * GRID * 4);
const fieldTexture = new THREE.DataTexture(fieldData, GRID, GRID, THREE.RGBAFormat, THREE.FloatType);
fieldTexture.wrapS = fieldTexture.wrapT = THREE.RepeatWrapping;
fieldTexture.magFilter = fieldTexture.minFilter = THREE.LinearFilter;
fieldTexture.needsUpdate = true;

/** Uniformes partagés par toute la flore */
export const floraUniforms = {
  uTime: { value: 0 },
  uField: { value: fieldTexture },
  uFieldSize: { value: GRID * CELL },
  uSubY: { value: 9999 },
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

/** Laitue de mer : feuille large et froissée */
function sheetGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 3, 4);
  geo.translate(0, 0.5, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x * (0.6 + y * 0.6), y, Math.sin(x * 9 + y * 6) * 0.12 + Math.cos(y * 7) * 0.06);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Spaghetti de mer / algue filamenteuse : bouquet de lanières très fines */
function strandsGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.PlaneGeometry(0.08, 1, 1, 5);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    const a = (i / 5) * Math.PI * 2;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      p.setXYZ(k, p.getX(k) + Math.cos(a) * y * 0.25, y * (0.75 + (i % 3) * 0.12), Math.sin(a) * y * 0.25 + Math.sin(y * 9 + i) * 0.04);
    }
    parts.push(g);
  }
  return merge(parts);
}

/** Algue rouge buissonnante : petites branches qui partent d'un pied */
function bushGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const h = 0.5 + (i % 3) * 0.25;
    const g = new THREE.PlaneGeometry(0.09, h);
    g.translate(0, h / 2, 0);
    g.rotateZ(Math.sin(i * 2.1) * 0.6);
    g.rotateY((i / 6) * Math.PI * 2);
    parts.push(g);
    const tip = new THREE.TetrahedronGeometry(0.08, 0);
    tip.translate(Math.sin(i * 2.1) * -h * 0.55, h * 0.85, 0);
    tip.rotateY((i / 6) * Math.PI * 2);
    parts.push(tip);
  }
  return merge(parts);
}

/** Anémone : pied charnu et couronne de tentacules (qui ondulent avec le courant) */
function anemoneGeometry() {
  const parts = [];
  const foot = new THREE.CylinderGeometry(0.3, 0.38, 0.35, 6);
  foot.translate(0, 0.17, 0);
  parts.push(foot);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const t = new THREE.ConeGeometry(0.045, 0.6, 4, 1, true);
    t.translate(0, 0.3, 0);
    t.rotateZ(0.6);
    t.rotateY(a);
    t.translate(Math.cos(a) * 0.22, 0.35, -Math.sin(a) * 0.22);
    parts.push(t);
  }
  return merge(parts, 1);
}

/** Oursin : boule hérissée */
function urchinGeometry() {
  const parts = [new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.25, 0)];
  const dir = new THREE.Vector3();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const p = ico.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    dir.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    if (dir.y < -0.3) continue;
    const spike = new THREE.ConeGeometry(0.025, 0.45, 3, 1, true);
    spike.translate(0, 0.42, 0);
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    spike.translate(0, 0.25, 0);
    parts.push(spike);
  }
  return merge(parts, 0.6);
}

/** Plume de mer : tige et barbes en épi */
function featherGeometry() {
  const parts = [new THREE.CylinderGeometry(0.03, 0.04, 1, 4, 1, true).translate(0, 0.5, 0)];
  for (let i = 0; i < 10; i++) {
    for (const s of [-1, 1]) {
      const b = new THREE.PlaneGeometry(0.22, 0.05);
      b.translate(s * 0.11, 0, 0);
      b.rotateZ(s * 0.5);
      b.translate(0, 0.3 + i * 0.07, 0);
      parts.push(b);
    }
  }
  return merge(parts);
}

/** Corail froid : buisson de branches fourchues */
function coralGeometry() {
  const parts = [];
  const branch = (x, y, z, len, ry, rz, depth) => {
    const g = new THREE.CylinderGeometry(0.03 * (depth + 1), 0.045 * (depth + 1), len, 4, 1, true);
    g.translate(0, len / 2, 0);
    g.rotateZ(rz);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
    if (depth <= 0) return;
    const ex = x - Math.sin(rz) * Math.cos(ry) * len, ey = y + Math.cos(rz) * len, ez = z + Math.sin(rz) * Math.sin(ry) * len;
    branch(ex, ey, ez, len * 0.7, ry + 1.1, rz + 0.45, depth - 1);
    branch(ex, ey, ez, len * 0.7, ry - 1.3, rz - 0.4, depth - 1);
  };
  for (let i = 0; i < 3; i++) branch(0, 0, 0, 0.4, i * 2.1, 0.25, 2);
  return merge(parts, 1);
}

/** Vers tubicoles : faisceau de tubes blancs */
function tubewormGeometry() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const h = 0.6 + (i % 4) * 0.15;
    const g = new THREE.CylinderGeometry(0.035, 0.04, h, 4, 1, true);
    const a = i * 2.4, r = (i % 3) * 0.06;
    g.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    parts.push(g);
    const plume = new THREE.ConeGeometry(0.07, 0.12, 4, 1, true);
    plume.rotateX(Math.PI);
    plume.translate(Math.cos(a) * r, h + 0.05, Math.sin(a) * r);
    parts.push(plume);
  }
  return merge(parts, 1);
}

/** Éponge de verre : grand vase ajouré */
function vaseGeometry() {
  const pts = [[0.08, 0], [0.18, 0.15], [0.3, 0.5], [0.36, 0.85], [0.34, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 8);
}

/** Fusionne des géométries (positions seulement) ; height = hauteur de référence pour l'ondulation */
function merge(parts, height = 1) {
  const pos = [];
  for (const g of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (height !== 1) geo.scale(1, 1 / height, 1); // hauteur normalisée à 1 (la taille vient de l'instance)
  geo.computeVertexNormals();
  return geo;
}

const SHAPES = {
  kelp: kelpGeometry, grass: grassGeometry, fan: fanGeometry, tube: tubeGeometry,
  sheet: sheetGeometry, strands: strandsGeometry, bush: bushGeometry, anemone: anemoneGeometry,
  urchin: urchinGeometry, feather: featherGeometry, coral: coralGeometry, tubeworm: tubewormGeometry, vase: vaseGeometry,
};

/* ------------------------------------------------------------ Matériau qui ondule et s'écarte */

function floraMaterial(sway, push) {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = floraUniforms.uTime;
    shader.uniforms.uField = floraUniforms.uField;
    shader.uniforms.uFieldSize = floraUniforms.uFieldSize;
    shader.uniforms.uSubY = floraUniforms.uSubY;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform sampler2D uField;
        uniform float uFieldSize;
        uniform float uSubY;`
      )
      .replace(
        '#include <project_vertex>',
        `
        // Pied de la plante et hauteur réelle (lue dans la matrice d'instance : cohérente pour tout le brin)
        vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float plantH = length(instanceMatrix[1].xyz);
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        float h = clamp(position.y, 0.0, 1.0);
        float bend = h * h;
        // Courant : une onde lente qui monte le long de la plante
        float phase = uTime * 0.8 + root.x * 0.13 + root.z * 0.11;
        float amp = ${sway.toFixed(3)} * (0.5 + plantH * 0.1);
        wp.x += sin(phase - h * 1.6) * bend * amp;
        wp.z += cos(phase * 0.8 + 1.3 - h * 1.3) * bend * amp * 0.7;
        // Champ de déplacement (sous-marin) : seulement si la coque passe à hauteur de la plante
        vec2 disp = texture2D(uField, root.xz / uFieldSize).xy;
        float above = uSubY - root.y;
        float reach = (1.0 - smoothstep(plantH + 1.5, plantH + 6.0, above)) * step(-4.0, above);
        vec2 off = disp * reach * ${push.toFixed(3)};
        float offLen = length(off);
        // La plante se couche : le sommet s'écarte et s'abaisse (longueur à peu près conservée)
        wp.xz += off * bend;
        wp.y -= (plantH * 0.5) * (1.0 - cos(min(offLen / max(plantH, 0.5), 1.2))) * bend;
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
    // Regroupe par tuile (une InstancedMesh par tuile → culling hors champ et à distance)
    const bands = new Map();
    for (const pl of plants) {
      const b = tileKey(pl.x, pl.z);
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b).push(pl);
    }
    const isSmall = sp.height[1] < 3;
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
      if (isSmall) registerSmall(mesh, 60);
      group.add(mesh);
    }
  }
  return group;
}

/**
 * Champ de déplacement autour du sous-marin : une grille de ressorts amortis.
 * Le sous-marin (segment de la queue au nez) pousse les cellules proches vers l'extérieur ;
 * chaque cellule revient ensuite au repos en oscillant.
 */
const STIFFNESS = 10;
const DAMPING = 2.6;
const RADIUS = 6.5;
const vel = new Float32Array(GRID * GRID * 2);

export class Wake {
  constructor() {
    this.active = new Set(); // cellules en mouvement (on ne simule qu'elles)
  }

  /**
   * @param {THREE.Vector3} position centre du sous-marin
   * @param {THREE.Vector3} nose point à l'avant
   */
  update(dt, time, position, speed, nose) {
    floraUniforms.uTime.value = time;
    floraUniforms.uSubY.value = position.y;
    dt = Math.min(dt, 1 / 30);

    // Segment de la coque (arrière → avant) et cellules couvertes
    const ax = position.x * 2 - nose.x, az = position.z * 2 - nose.z; // arrière ≈ symétrique du nez
    const bx = nose.x, bz = nose.z;
    const minX = Math.floor((Math.min(ax, bx) - RADIUS) / CELL), maxX = Math.ceil((Math.max(ax, bx) + RADIUS) / CELL);
    const minZ = Math.floor((Math.min(az, bz) - RADIUS) / CELL), maxZ = Math.ceil((Math.max(az, bz) + RADIUS) / CELL);
    const sx = bx - ax, sz = bz - az;
    const segLen2 = sx * sx + sz * sz || 1;
    // Plus le sous-marin va vite, plus il bouscule
    const strength = 26 + Math.min(speed, 8) * 6;
    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const px = (cx + 0.5) * CELL, pz = (cz + 0.5) * CELL;
        const t = Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / segLen2));
        const qx = ax + sx * t, qz = az + sz * t;
        const dx = px - qx, dz = pz - qz;
        const d = Math.hypot(dx, dz);
        if (d > RADIUS) continue;
        const f = (1 - d / RADIUS) * strength * dt;
        const i = (((cz % GRID) + GRID) % GRID) * GRID + (((cx % GRID) + GRID) % GRID);
        vel[i * 2] += (dx / (d || 1)) * f;
        vel[i * 2 + 1] += (dz / (d || 1)) * f;
        this.active.add(i);
      }
    }

    // Ressorts amortis : retour au repos avec un léger balancement
    for (const i of this.active) {
      const o = i * 4;
      let x = fieldData[o], z = fieldData[o + 1];
      vel[i * 2] += (-STIFFNESS * x - DAMPING * vel[i * 2]) * dt;
      vel[i * 2 + 1] += (-STIFFNESS * z - DAMPING * vel[i * 2 + 1]) * dt;
      x += vel[i * 2] * dt;
      z += vel[i * 2 + 1] * dt;
      // Limite : une plante ne se couche pas à plus de ~4 m
      const len = Math.hypot(x, z);
      if (len > 4) {
        x *= 4 / len;
        z *= 4 / len;
      }
      fieldData[o] = x;
      fieldData[o + 1] = z;
      if (Math.abs(x) + Math.abs(z) < 0.002 && Math.abs(vel[i * 2]) + Math.abs(vel[i * 2 + 1]) < 0.002) {
        fieldData[o] = fieldData[o + 1] = vel[i * 2] = vel[i * 2 + 1] = 0;
        this.active.delete(i);
      }
    }
    fieldTexture.needsUpdate = true;
  }
}
