import * as THREE from 'three';
import { RADIATION } from '../config/settings.js';
import { getFloorHeight } from './seabed.js';
import { createHalo } from '../loot/glow.js';

/**
 * Le portail : une déchirure verticale de lumière verte, sans cadre ni structure,
 * qui flotte au-dessus de la plaine noire des Abysses. Ses bords ondulent comme une plaie
 * dans l'eau. De près, la lumière dessine un tracé d'électrocardiogramme qui pulse
 * (c'est le cœur de Loïc, vu de l'autre côté).
 *
 * Elle reste visible de très loin : au-delà de la portée de la caméra, une lueur
 * est replacée sur la ligne de visée, à taille apparente constante.
 *
 * setOpen(0..1) : 1 = grande ouverte, 0 = refermée.
 * setBeat(phase) : phase du battement (0..1), pour synchroniser le tracé avec le son.
 */
const RIFT_HEIGHT = 30;
const RIFT_WIDTH = 10;
const HOVER = 7; // hauteur du bas de la déchirure au-dessus du fond
const FAR_GLOW_DIST = 110; // au-delà, la lueur lointaine prend le relais (portée caméra : 130 m)

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
  uniform float uBeat;   // phase du battement 0..1
  uniform float uNear;   // 0 loin, 1 tout près : le tracé ECG apparaît
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  // Forme d'un battement d'électrocardiogramme : onde P, complexe QRS, onde T
  float ecg(float p) {
    float v = 0.0;
    v += 0.12 * exp(-pow((p - 0.12) / 0.03, 2.0));
    v -= 0.15 * exp(-pow((p - 0.28) / 0.008, 2.0));
    v += 1.00 * exp(-pow((p - 0.30) / 0.010, 2.0));
    v -= 0.30 * exp(-pow((p - 0.32) / 0.010, 2.0));
    v += 0.22 * exp(-pow((p - 0.52) / 0.05, 2.0));
    return v;
  }

  void main() {
    float y = vUv.y;
    // Silhouette de la plaie : effilée aux extrémités, bords qui ondulent lentement
    float profile = pow(sin(3.14159 * y), 0.6);
    float wave = sin(y * 9.0 + uTime * 1.1) * 0.05 + (noise(vec2(y * 7.0, uTime * 0.6)) - 0.5) * 0.12;
    float jag = noise(vec2(y * 30.0, uTime * 2.0)) * 0.05;
    float halfW = (0.12 + jag) * profile * uOpen;
    float x = vUv.x - 0.5 - wave * profile;
    float ax = abs(x);
    float inside = 1.0 - smoothstep(halfW * 0.55, halfW, ax);
    float lip = smoothstep(halfW * 0.35, halfW * 0.9, ax) * inside;

    // Intérieur : remous verts sombres et lumière blanche lointaine
    float swirl = noise(vec2(vUv.x * 5.0 + uTime * 0.25, y * 8.0 - uTime * 0.7));
    vec3 deep = mix(vec3(0.03, 0.16, 0.07), vec3(0.75, 0.95, 0.78), pow(swirl, 3.0) * 0.7);

    // Tracé ECG : une ligne qui court verticalement dans la plaie.
    // Le battement part du bas et monte ; sa forme suit la phase du cœur.
    float s = fract(y * 1.3 - uBeat);
    float trace = ecg(s) * mix(0.06, 0.13, uNear) * profile;
    float d = abs(x - trace);
    float line = exp(-d * 260.0) * 1.4 + exp(-d * 60.0) * 0.35;
    float beatGlow = 0.6 + 0.4 * exp(-pow((fract(uBeat) - 0.3) / 0.06, 2.0));

    vec3 col = deep * inside + vec3(0.45, 1.0, 0.55) * lip * 1.2;
    col += vec3(0.8, 1.0, 0.85) * line * mix(0.3, 2.2, uNear) * beatGlow * step(0.001, inside + uNear * 0.5);
    // Halo autour de la plaie
    float glow = exp(-ax * 7.0 / max(uOpen, 0.05)) * profile * 0.4 * uOpen * beatGlow;
    col += vec3(0.25, 0.8, 0.35) * glow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createPortal(scene) {
  const S = RADIATION.SOURCE;
  const floor = getFloorHeight(S.x, S.z);
  const group = new THREE.Group();
  group.position.set(S.x, floor + HOVER, S.z);
  group.rotation.y = Math.PI; // fait face au chemin d'arrivée (vers +Z)

  // La déchirure : deux plans croisés (volume apparent), additifs, sans brouillard
  const riftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uBeat: { value: 0 }, uNear: { value: 0 } },
    vertexShader: riftVertex,
    fragmentShader: riftFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const riftGeo = new THREE.PlaneGeometry(RIFT_WIDTH, RIFT_HEIGHT);
  const rift = new THREE.Group();
  rift.position.y = RIFT_HEIGHT / 2;
  for (const ry of [0, Math.PI / 2.6]) {
    const plane = new THREE.Mesh(riftGeo, riftMat);
    plane.rotation.y = ry;
    plane.raycast = () => {};
    rift.add(plane);
  }
  group.add(rift);

  // Halo qui baigne la plaine
  const halo = createHalo('#7fbf7a', 46);
  halo.position.y = RIFT_HEIGHT / 2;
  group.add(halo);
  // Reflet sur le fond, sous la plaie
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(14, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#3c7048', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pool.position.y = -HOVER + 0.2;
  group.add(pool);

  // Particules lumineuses qui remontent le long de la plaie
  const MOTES = 240;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 22;
    motePos[i * 3 + 1] = Math.random() * 40 - HOVER;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 22;
    moteSeed[i] = Math.random();
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uPointScale: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPointScale;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + ${HOVER.toFixed(1)} + uTime * (0.8 + aSeed * 1.6), 42.0) - ${HOVER.toFixed(1)};
        p.xz *= 1.0 - clamp((p.y + ${HOVER.toFixed(1)}) / 50.0, 0.0, 0.8); // aspirées vers la plaie
        vA = 1.0 - (p.y + ${HOVER.toFixed(1)}) / 42.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(30.0 / -mv.z, 1.0, 3.0) * uPointScale * 0.7;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpen;
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(vec3(0.5, 1.0, 0.55) * vA * uOpen * (1.0 - r), 1.0);
      }
    `,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);
  scene.add(group);

  // Lueur lointaine : visible depuis le Canyon, bien au-delà de la portée de la caméra
  // (dessinée après le décor : le relief qui se trouve devant la masque naturellement)
  const farGlow = createHalo('#7fbf7a', 1);
  farGlow.renderOrder = 5;
  scene.add(farGlow);
  const farCore = createHalo('#c8f0c0', 1);
  farCore.renderOrder = 5;
  scene.add(farCore);

  let open = 1;
  let beat = 0;
  const center = new THREE.Vector3(S.x, floor + HOVER + RIFT_HEIGHT / 2, S.z);
  const _dir = new THREE.Vector3();
  const _target = new THREE.Vector3();

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
      pool.material.opacity = 0.25 * v;
    },
    /** Phase du battement de cœur (0..1), fournie par le son du sonar (étape 4) */
    setBeat(phase) {
      beat = phase;
    },
    /**
     * @param {number} time
     * @param {THREE.Vector3} viewer position de la caméra
     * @param {number} pointScale échelle des particules (résolution)
     */
    update(time, viewer, pointScale = 1) {
      // En attendant la synchronisation avec le son : un battement à ~56 bpm
      if (!this.externalBeat) beat = (time * 0.93) % 1;
      riftMat.uniforms.uTime.value = time;
      riftMat.uniforms.uBeat.value = beat;
      moteMat.uniforms.uTime.value = time;
      moteMat.uniforms.uPointScale.value = pointScale;
      const pulse = 0.85 + 0.15 * Math.exp(-Math.pow((beat - 0.3) / 0.08, 2));
      halo.material.opacity = 0.5 * open * pulse;
      halo.scale.setScalar(46 * (0.9 + Math.sin(time * 0.5) * 0.06) * (0.3 + open * 0.7));

      const dist = viewer ? viewer.distanceTo(center) : 0;
      riftMat.uniforms.uNear.value = THREE.MathUtils.clamp(1 - (dist - 15) / 45, 0, 1);

      // Lueur lointaine : placée sur la ligne de visée, à taille apparente constante
      const far = viewer && dist > FAR_GLOW_DIST * 0.8 && open > 0.01;
      farGlow.visible = farCore.visible = !!far;
      if (far) {
        // La lumière diffuse remonte dans l'eau : on vise un point au-dessus de la plaie,
        // pour que la lueur reste près de l'horizon quand on la voit depuis le Canyon
        const horiz = Math.hypot(center.x - viewer.x, center.z - viewer.z);
        _target.set(center.x, Math.max(center.y, viewer.y - horiz * 0.22), center.z);
        _dir.subVectors(_target, viewer).normalize();
        const d = Math.min(dist, FAR_GLOW_DIST);
        const k = d / dist;
        farGlow.position.copy(viewer).addScaledVector(_dir, d);
        farCore.position.copy(farGlow.position);
        farGlow.scale.set(80 * k, 260 * k, 1);
        farCore.scale.set(9 * k, 120 * k, 1);
        // Visible dès le Canyon (≈ 400 m), de plus en plus nette en approchant
        const fade = THREE.MathUtils.clamp(1 - (dist - 200) / 400, 0.15, 1);
        const fadeIn = THREE.MathUtils.clamp((dist - FAR_GLOW_DIST * 0.8) / 30, 0, 1); // relais en douceur
        farGlow.material.opacity = 0.5 * fade * fadeIn * open * pulse;
        farCore.material.opacity = 0.8 * fade * fadeIn * open * pulse;
      }
    },
  };
}
