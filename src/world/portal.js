import * as THREE from 'three';
import { RADIATION, WORLD } from '../config/settings.js';
import { createRandom, paintFaces } from '../core/utils.js';
import { getFloorHeight } from './seabed.js';
import { createHalo } from '../loot/glow.js';

/**
 * Le portail : une déchirure verticale vers le monde des vivants, au fond des abysses,
 * encadrée par les restes d'une porte de la ville d'Ys et un cercle de menhirs.
 * setOpen(0..1) : 1 = grand ouvert, 0 = refermé (fin « Fermer »).
 */
const rand = createRandom(WORLD.SEED + 666);
const RIFT_HEIGHT = 24;
const RIFT_WIDTH = 9;

const riftVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const riftFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    // Forme d'une déchirure : fine aux extrémités, bords irréguliers qui frémissent
    float y = vUv.y;
    float profile = pow(sin(3.14159 * y), 0.7);
    float jag = noise(vec2(y * 14.0, uTime * 1.3)) * 0.35 + noise(vec2(y * 40.0, uTime * 3.0)) * 0.12;
    float halfW = (0.18 + jag * 0.5) * profile * uOpen;
    float x = abs(vUv.x - 0.5 + (noise(vec2(y * 3.0, uTime * 0.4)) - 0.5) * 0.12);
    float inside = 1.0 - smoothstep(halfW * 0.6, halfW, x);
    float edge = smoothstep(halfW * 0.4, halfW * 0.95, x) * inside;
    // Remous à l'intérieur : vert sombre et lumière blanche lointaine
    float swirl = noise(vec2(vUv.x * 6.0 + uTime * 0.3, y * 10.0 - uTime * 0.8));
    vec3 deep = mix(vec3(0.02, 0.12, 0.05), vec3(0.85, 0.95, 0.85), pow(swirl, 3.0) * 0.8);
    vec3 col = mix(deep, vec3(0.5, 1.0, 0.55), edge);
    // Lueur autour
    float glow = exp(-x * 9.0 / max(uOpen, 0.05)) * profile * 0.35 * uOpen;
    gl_FragColor = vec4(col * inside + vec3(0.3, 0.75, 0.35) * glow, 1.0);
  }
`;

function stone(geo, base = '#3a3e40') {
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const b = new THREE.Color(base), c = new THREE.Color();
  paintFaces(geo, () => c.copy(b).multiplyScalar(0.75 + rand() * 0.4));
  return geo;
}

export function createPortal(scene) {
  const S = RADIATION.SOURCE;
  const floor = getFloorHeight(S.x, S.z);
  const group = new THREE.Group();
  group.position.set(S.x, floor, S.z);
  group.rotation.y = Math.PI; // la déchirure fait face au chemin d'arrivée (vers +Z)
  const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const runeMat = new THREE.MeshBasicMaterial({ color: '#7fbf7a' });

  // Cercle de menhirs penchés, gravés de signes lumineux
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand() * 0.2;
    const h = rand.range(6, 14);
    const m = new THREE.Mesh(stone(new THREE.BoxGeometry(rand.range(1.6, 2.6), h, rand.range(1.2, 2))), vmat);
    m.position.set(Math.cos(a) * 22, h / 2 - 1, Math.sin(a) * 22);
    m.rotation.set(rand.range(-0.25, 0.25), -a, rand.range(-0.25, 0.25));
    group.add(m);
    for (let k = 0; k < 3; k++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.15, rand.range(0.6, 1.6), 0.1), runeMat);
      rune.position.set(rand.range(-0.5, 0.5), rand.range(-h / 3, h / 3), 1.05);
      m.add(rune);
    }
  }

  // Porte d'Ys brisée : deux piliers et un linteau effondré
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(stone(new THREE.BoxGeometry(3, 26, 3), '#45484a'), vmat);
    pillar.position.set(side * 8.5, 12, 0);
    pillar.rotation.z = side * 0.04;
    group.add(pillar);
  }
  const lintel = new THREE.Mesh(stone(new THREE.BoxGeometry(22, 2.6, 3.2), '#45484a'), vmat);
  lintel.position.set(-2, 25.5, 0);
  lintel.rotation.z = 0.12;
  group.add(lintel);
  const fallen = new THREE.Mesh(stone(new THREE.BoxGeometry(9, 2.4, 3)), vmat);
  fallen.position.set(6, 1, 6);
  fallen.rotation.set(0.1, 0.7, 0.2);
  group.add(fallen);

  // La déchirure : deux plans croisés (volume apparent), additifs, sans brouillard
  const riftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 } },
    vertexShader: riftVertex,
    fragmentShader: riftFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const riftGeo = new THREE.PlaneGeometry(RIFT_WIDTH, RIFT_HEIGHT);
  const rift = new THREE.Group();
  rift.position.y = RIFT_HEIGHT / 2 + 0.5;
  for (const ry of [0, Math.PI / 2.4]) {
    const plane = new THREE.Mesh(riftGeo, riftMat);
    plane.rotation.y = ry;
    rift.add(plane);
  }
  group.add(rift);

  const halo = createHalo('#7fbf7a', 40);
  halo.position.y = RIFT_HEIGHT / 2;
  group.add(halo);

  // Particules lumineuses qui montent de la déchirure
  const MOTES = 220;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = (rand() - 0.5) * 30;
    motePos[i * 3 + 1] = rand() * 40;
    motePos[i * 3 + 2] = (rand() - 0.5) * 30;
    moteSeed[i] = rand();
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (1.0 + aSeed * 2.0), 40.0);
        p.xz *= 1.0 - p.y / 60.0; // aspirées vers le haut et le centre
        vA = 1.0 - p.y / 40.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(30.0 / -mv.z, 1.0, 3.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpen;
      varying float vA;
      void main() { gl_FragColor = vec4(vec3(0.5, 1.0, 0.55) * vA * uOpen, 1.0); }
    `,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  scene.add(group);

  let open = 1;
  const center = new THREE.Vector3(S.x, floor + RIFT_HEIGHT / 2, S.z);

  return {
    group,
    /** Centre de la déchirure (monde) */
    center,
    get open() {
      return open;
    },
    setOpen(v) {
      open = v;
      riftMat.uniforms.uOpen.value = v;
      moteMat.uniforms.uOpen.value = v;
      halo.material.opacity = 0.55 * v;
      runeMat.color.set('#7fbf7a').multiplyScalar(0.2 + v * 0.8);
      group.visible = true;
    },
    update(time) {
      riftMat.uniforms.uTime.value = time;
      moteMat.uniforms.uTime.value = time;
      halo.scale.setScalar(40 * (0.9 + Math.sin(time * 0.7) * 0.08) * (0.3 + open * 0.7));
    },
  };
}
