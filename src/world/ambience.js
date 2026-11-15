import * as THREE from 'three';
import ambienceData from '../config/depthAmbience.json';
import { clamp } from '../core/utils.js';
import { WATER_GLSL, waterUniform } from '../core/waterFog.js';

/**
 * Ambiance en fonction de la profondeur :
 * couleur et densité du brouillard, lumière ambiante, « soleil » filtré par l'eau,
 * et la surface vue d'en dessous.
 */
const SUN_DEEP = new THREE.Color('#3f8f8a');
const KEYS = ambienceData.keyframes.map((k) => ({ ...k, fogColor: new THREE.Color(k.fog) }));

/** Interpole les paliers de profondeur */
export function sampleAmbience(depth, out = {}) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (depth >= KEYS[i].depth && depth <= KEYS[i + 1].depth) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const t = a === b ? 0 : clamp((depth - a.depth) / (b.depth - a.depth), 0, 1);
  if (depth >= KEYS[KEYS.length - 1].depth) {
    a = b = KEYS[KEYS.length - 1];
  }
  out.fogColor = (out.fogColor || new THREE.Color()).copy(a.fogColor).lerp(b.fogColor, t);
  out.density = a.density + (b.density - a.density) * t;
  out.ambient = a.ambient + (b.ambient - a.ambient) * t;
  out.sun = a.sun + (b.sun - a.sun) * t;
  out.beam = a.beam + (b.beam - a.beam) * t;
  out.exposure = (a.exposure ?? 1) + ((b.exposure ?? 1) - (a.exposure ?? 1)) * t;
  return out;
}

/**
 * Fond d'eau : un dôme centré sur la caméra, dessiné derrière tout le décor.
 * Il montre l'eau telle qu'on la voit au loin, avec le même calcul que le brouillard
 * (plus claire vers la surface et le soleil, noire vers le fond) : plus de « mur » de brouillard.
 */
function createWaterDome(scene) {
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: scene.fog.color }, // même objet que la couleur du brouillard
      uDensity: { get value() { return scene.fog.density; } },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        // Seulement la rotation de la caméra : le dôme la suit partout
        vec3 v = (viewMatrix * vec4(position, 0.0)).xyz;
        gl_Position = projectionMatrix * vec4(v, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uDensity;
      varying vec3 vDir;
      ${WATER_GLSL}
      void main() {
        vec3 rd = normalize(vDir);
        float far = 130.0;
        vec3 T = waterTransmittance(far, uDensity);
        vec3 c = waterInscatter(rd, uColor, cameraPosition.y, cameraPosition.y + rd.y * far) * (1.0 - T);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.raycast = () => {};
  scene.add(dome);
  return dome;
}

/**
 * La surface vue par en dessous (d'après Abyssal Garden) :
 *  - des vagues (somme de sinusoïdes) donnent une normale qui ondule ;
 *  - « fenêtre de Snell » : dans un cône d'environ 48° au-dessus de soi, on voit le ciel
 *    à travers la surface (avec le soleil qui scintille) ;
 *  - au-delà, la réflexion totale renvoie l'image de l'eau elle-même (sombre) ;
 *  - transmission de Fresnel au bord de la fenêtre ; brouillard d'eau par-dessus.
 */
function createUnderSurface(scene, uniforms) {
  const geo = new THREE.PlaneGeometry(1800, 1800, 1, 1);
  geo.rotateX(Math.PI / 2); // face tournée vers le bas
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uWaterCol: { value: scene.fog.color },
      uDensity: { get value() { return scene.fog.density; } },
      uSunDir: { value: new THREE.Vector3(0.3, 1, 0.2).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWaterCol;
      uniform float uDensity;
      uniform vec3 uSunDir;
      varying vec3 vWorld;
      ${WATER_GLSL}
      // Pente de la surface : vagues de directions et longueurs variées
      vec2 slope(vec2 p) {
        vec2 s = vec2(0.0);
        vec3 W[8];
        W[0] = vec3(1.0, 2.0, 1.0); W[1] = vec3(-2.0, 1.0, 0.9); W[2] = vec3(3.0, 1.0, 0.6); W[3] = vec3(1.0, -4.0, 0.5);
        W[4] = vec3(4.0, 3.0, 0.4); W[5] = vec3(-3.0, 5.0, 0.32); W[6] = vec3(6.0, -2.0, 0.28); W[7] = vec3(5.0, 7.0, 0.2);
        for (int i = 0; i < 8; i++) {
          vec3 k = W[i];
          float ph = dot(k.xy, p) * 0.5 + uTime * (0.6 + 0.3 * sqrt(length(k.xy))) * (mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0) + float(i) * 1.7;
          s += k.xy * k.z * cos(ph);
        }
        return s * 0.05;
      }
      void main() {
        vec3 v = vWorld - cameraPosition;
        float d = length(v);
        vec3 V = v / d;
        // Les vagues s'estompent au loin (sinon, scintillement)
        float fl = smoothstep(260.0, 40.0, d);
        vec2 s = (slope(vWorld.xz / 6.0) + slope(vWorld.zx / 2.3 + 0.2) * 0.6) * fl;
        vec3 n = normalize(vec3(-s.x, -1.0, -s.y));
        float ci = clamp(dot(V, -n), 0.0, 1.0);
        float k = 1.0 - 1.769 * (1.0 - ci * ci); // 1.33² : seuil de la réflexion totale
        float win = smoothstep(0.0, 0.22, k);
        vec3 rr = refract(V, n, 1.33);
        float sd = max(dot(rr, uSunDir), 0.0);
        float fr = pow(1.0 - sqrt(max(k, 0.0)), 5.0);
        // Ciel gris breton vu à travers l'eau, et le soleil voilé qui scintille
        vec3 sky = (vec3(0.42, 0.62, 0.66) * 1.4 * clamp(1.0 + 3.0 * (s.x * 0.6 - s.y * 0.8), 0.3, 2.6)
                 + vec3(1.0, 0.97, 0.9) * (pow(sd, 40.0) * 1.2 + pow(sd, 400.0) * 9.0)) * (1.0 - fr);
        // Réflexion totale : on voit l'eau elle-même, en dessous
        vec3 R = reflect(V, n);
        vec3 refl = waterInscatter(R, uWaterCol, cameraPosition.y, cameraPosition.y - 60.0) * 0.9;
        vec3 c = mix(refl, sky, win);
        // L'eau entre la caméra et la surface
        vec3 T = waterTransmittance(d, uDensity);
        c = c * T + waterInscatter(V, uWaterCol, cameraPosition.y, vWorld.y) * (1.0 - T);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.raycast = () => {};
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function createAmbience(scene) {
  scene.fog = new THREE.FogExp2(0x000000, 0.02);
  scene.background = new THREE.Color();
  createWaterDome(scene);

  const hemi = new THREE.HemisphereLight('#a8bdb2', '#1a2a20', 1);
  scene.add(hemi);

  // Lumière froide venant de la surface
  const sun = new THREE.DirectionalLight('#ccd8cc', 1);
  sun.position.set(30, 100, 20);
  // Ombres portées du soleil, sur une zone de 140 m autour du sous-marin
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -70;
  sc.right = sc.top = 70;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  // Surface de l'eau vue par en dessous (voir createUnderSurface)
  const surfaceUniforms = { uTime: { value: 0 } };
  const surface = createUnderSurface(scene, surfaceUniforms);

  const state = {};

  return {
    state,
    /**
     * @param {number} depth profondeur de la caméra en mètres
     * @param {THREE.Vector3} focus point suivi (pour garder le soleil centré)
     */
    update(depth, focus, time) {
      sampleAmbience(Math.max(0, depth), state);
      scene.fog.color.copy(state.fogColor);
      scene.fog.density = state.density;
      scene.background.copy(state.fogColor);
      hemi.intensity = state.ambient;
      sun.intensity = state.sun;
      // Le soleil se teinte de bleu-vert en profondeur (l'eau a mangé le rouge)
      sun.color.setRGB(0.8, 0.85, 0.8).lerp(SUN_DEEP, clamp(depth / 120, 0, 1));
      // Caustiques : fortes près de la surface, absentes quand il n'y a plus de soleil
      waterUniform.x = time;
      waterUniform.y = clamp(state.sun / 1.3, 0, 1) * 0.55;
      // L'ombre suit le sous-marin ; on la cale sur une grille pour éviter qu'elle ne « nage »
      const snap = 140 / 2048;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.position.set(fx + 90, focus.y + 300, fz + 60);
      sun.target.position.set(fx, focus.y, fz);
      // Plus de soleil en profondeur : on ne recalcule plus l'ombre
      sun.shadow.autoUpdate = state.sun > 0.03;
      surface.position.set(focus.x, 0.3, focus.z);
      surfaceUniforms.uTime.value = time;
    },
  };
}
