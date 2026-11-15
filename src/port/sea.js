import * as THREE from 'three';

/**
 * La mer et le ciel du port (d'après Web Ocean, en beaucoup plus simple) :
 *  - mer : vagues de Gerstner (crêtes pointues, creux arrondis) calculées dans le shader,
 *    reflet du ciel selon Fresnel, eau sombre et verte en profondeur, lueur sur les crêtes
 *    à contre-jour, écume qui naît sur les crêtes et ondule, fines rides en détail ;
 *  - ciel : couvert breton, dégradé gris, nuages bas qui défilent lentement,
 *    voile lumineux à l'endroit du soleil, brume à l'horizon (même couleur que le brouillard).
 * La couleur de l'horizon est celle du brouillard de la scène : les fins qui changent
 * la brume changent aussi le ciel.
 */

// Vagues : direction (x, z), longueur d'onde (m), amplitude (m)
const WAVES = [
  [1.0, 0.35, 23, 0.32],
  [0.7, -0.7, 14, 0.2],
  [-0.3, 1.0, 9, 0.12],
  [0.9, 0.1, 5.5, 0.07],
  [-0.6, 0.8, 3.2, 0.04],
];

const GLSL_NOISE = /* glsl */ `
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// Ciel (fonction partagée par le dôme et le reflet dans la mer)
const GLSL_SKY = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  vec3 skyColor(vec3 rd, float t) {
    float up = clamp(rd.y, 0.0, 1.0);
    vec3 zenith = uHorizon * vec3(1.18, 1.24, 1.28) + vec3(0.03);
    vec3 c = mix(uHorizon, zenith, pow(up, 0.6));
    // Nuages bas : projetés sur un plafond, ils défilent avec le vent
    vec2 uv = rd.xz / max(rd.y, 0.04) * 0.6 + vec2(t * 0.004, t * 0.0015);
    float cl = fbm(uv * 1.3);
    float cl2 = fbm(uv * 3.1 + 5.0);
    float dark = smoothstep(0.42, 0.8, cl) * (0.75 + 0.5 * cl2);
    c *= 1.0 - dark * 0.28 * smoothstep(0.0, 0.25, up);
    c += uHorizon * 0.12 * smoothstep(0.55, 0.3, cl) * smoothstep(0.0, 0.3, up);
    // Voile lumineux du soleil derrière les nuages
    float mu = max(dot(rd, uSunDir), 0.0);
    c += vec3(1.0, 0.96, 0.88) * (pow(mu, 12.0) * 0.35 + pow(mu, 80.0) * 0.4) * (1.0 - dark * 0.7);
    // Brume à l'horizon
    return mix(c, uHorizon, smoothstep(0.18, 0.0, up));
  }
`;

export function createSeaAndSky(scene) {
  const horizon = scene.fog.color; // même objet : suit le brouillard
  const sunDir = new THREE.Vector3(-0.5, 0.35, 0.8).normalize();
  const time = { value: 0 };

  /* ------------------------------------------------------------ Ciel */
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uHorizon: { value: horizon }, uSunDir: { value: sunDir } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec3 v = (viewMatrix * vec4(position, 0.0)).xyz;
        gl_Position = projectionMatrix * vec4(v, 1.0);
        gl_Position.z = gl_Position.w; // toujours au fond
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main() { gl_FragColor = vec4(skyColor(normalize(vDir), uTime), 1.0); }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.raycast = () => {};
  scene.add(sky);

  /* ------------------------------------------------------------ Mer */
  const waveDefs = WAVES.map(([dx, dz, len, amp]) => {
    const l = Math.hypot(dx, dz);
    return new THREE.Vector4(dx / l, dz / l, (2 * Math.PI) / len, amp);
  });
  const waterMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uWaves: { value: waveDefs }, uHorizon: { value: horizon }, uSunDir: { value: sunDir } },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uWaves[${WAVES.length}];
      varying vec3 vWorld;
      varying float vCrest;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 p = w.xyz;
        float crest = 0.0;
        // Vagues de Gerstner : les points tournent sur des cercles (crêtes pointues)
        for (int i = 0; i < ${WAVES.length}; i++) {
          vec4 wv = uWaves[i];
          float k = wv.z;
          float c = sqrt(9.81 / k);
          float f = k * (dot(wv.xy, w.xz) - c * uTime);
          float q = 0.55 / (k * wv.w * float(${WAVES.length}));
          p.x += wv.x * wv.w * cos(f) * min(q, 1.0) * k * wv.w * 2.0;
          p.z += wv.y * wv.w * cos(f) * min(q, 1.0) * k * wv.w * 2.0;
          p.y += wv.w * sin(f);
          crest += max(sin(f), 0.0) * wv.w;
        }
        vWorld = p;
        vCrest = crest;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uWaves[${WAVES.length}];
      varying vec3 vWorld;
      varying float vCrest;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main() {
        // Normale analytique des vagues + fines rides en détail
        vec2 g = vec2(0.0);
        for (int i = 0; i < ${WAVES.length}; i++) {
          vec4 wv = uWaves[i];
          float k = wv.z;
          float f = k * (dot(wv.xy, vWorld.xz) - sqrt(9.81 / k) * uTime);
          g += wv.xy * k * wv.w * cos(f);
        }
        vec2 r = vWorld.xz * 1.7 + vec2(uTime * 0.6, uTime * 0.4);
        g += (vec2(vn(r), vn(r + 13.1)) - 0.5) * 0.22;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y);
        vec3 refl = skyColor(R, uTime);
        // Eau en profondeur : vert sombre, plus clair là où la crête est fine (lumière qui la traverse)
        vec3 deep = vec3(0.035, 0.075, 0.075);
        vec3 sss = vec3(0.10, 0.22, 0.19) * smoothstep(0.1, 0.5, vCrest) * pow(max(dot(-V, uSunDir), 0.0), 2.0);
        vec3 c = mix(deep + sss, refl, fres);
        // Reflet voilé du soleil
        vec3 H = normalize(V + uSunDir);
        c += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, H), 0.0), 120.0) * 0.6;
        // Écume : naît sur les crêtes, se déchire en filaments
        float foamN = fbm(vWorld.xz * 0.5 + vec2(uTime * 0.05, 0.0));
        float streaks = smoothstep(0.5, 0.72, fbm(vWorld.xz * vec2(2.6, 1.2) - uTime * 0.12));
        float foam = smoothstep(0.42, 0.56, vCrest + (foamN - 0.5) * 0.25) * streaks;
        foam *= smoothstep(140.0, 30.0, length(vWorld - cameraPosition)); // au loin, l'écume se fond
        c = mix(c, vec3(0.6, 0.64, 0.62), foam * 0.55);
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
  });
  time.ref = waterMat.uniforms.uTime;

  return {
    sky,
    waterMaterial: waterMat,
    update(t) {
      time.value = t;
      waterMat.uniforms.uTime.value = t;
    },
  };
}
