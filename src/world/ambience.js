import * as THREE from 'three';
import ambienceData from '../config/depthAmbience.json';
import { clamp } from '../core/utils.js';
import { WATER_GLSL } from '../core/waterFog.js';

/**
 * Ambiance en fonction de la profondeur :
 * couleur et densité du brouillard, lumière ambiante, « soleil » filtré par l'eau,
 * et la surface vue d'en dessous.
 */
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

export function createAmbience(scene) {
  scene.fog = new THREE.FogExp2(0x000000, 0.02);
  scene.background = new THREE.Color();
  createWaterDome(scene);

  const hemi = new THREE.HemisphereLight('#a8bdb2', '#1a2a20', 1);
  scene.add(hemi);

  // Lumière froide venant de la surface
  const sun = new THREE.DirectionalLight('#ccd8cc', 1);
  sun.position.set(30, 100, 20);
  scene.add(sun);
  scene.add(sun.target);

  // Surface de l'eau vue par en dessous : plan ondulant
  const surfaceGeo = new THREE.PlaneGeometry(900, 900, 60, 60);
  surfaceGeo.rotateX(Math.PI / 2); // face tournée vers le bas
  const surfaceUniforms = { uTime: { value: 0 } };
  const surfaceMat = new THREE.MeshBasicMaterial({
    color: '#a8bdb2',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  surfaceMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = surfaceUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; // vagues en coordonnées monde
        transformed.y += sin(wp.x * 0.08 + uTime * 0.7) * 0.4 + cos(wp.z * 0.06 + uTime * 0.5) * 0.4;`
      );
  };
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.position.y = 0.3;
  scene.add(surface);

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
      sun.position.set(focus.x + 30, 100, focus.z + 20);
      sun.target.position.copy(focus);
      surface.position.x = focus.x;
      surface.position.z = focus.z;
      surfaceUniforms.uTime.value = time;
    },
  };
}
