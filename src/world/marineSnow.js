import * as THREE from 'three';
import { DECOR } from '../config/settings.js';

/**
 * Neige marine : particules qui flottent et tombent lentement.
 * Les points sont répartis dans un cube qui « s'enroule » autour de la caméra :
 * on en voit partout sans en créer à l'infini.
 * Ils s'illuminent quand ils traversent le faisceau du phare.
 */
export function createMarineSnow() {
  const count = DECOR.MARINE_SNOW;
  const box = DECOR.MARINE_SNOW_BOX;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * box;
    positions[i * 3 + 1] = (Math.random() - 0.5) * box;
    positions[i * 3 + 2] = (Math.random() - 0.5) * box;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: box },
        uLightPos: { value: new THREE.Vector3() },
        uLightDir: { value: new THREE.Vector3(0, 0, 1) },
        uColor: { value: new THREE.Color('#83a39a') },
        uLitColor: { value: new THREE.Color('#efe3bb') },
        uAmbient: { value: 1 },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uBox;
      uniform vec3 uLightPos;
      uniform vec3 uLightDir;
      attribute float aSeed;
      varying float vLit;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        // Chute lente + petite dérive
        p.y -= uTime * (0.08 + aSeed * 0.15);
        p.x += sin(uTime * 0.25 + aSeed * 40.0) * 0.6;
        p.z += cos(uTime * 0.2 + aSeed * 25.0) * 0.6;
        // Enroulement dans le cube centré sur la caméra
        vec3 halfBox = vec3(uBox * 0.5);
        p = uCenter + mod(p - uCenter + halfBox, vec3(uBox)) - halfBox;

        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float dist = max(-mvPosition.z, 0.1);
        gl_PointSize = clamp(5.0 / dist, 1.0, 2.0);

        // Éclairage par le phare (cône simplifié)
        vec3 toP = p - uLightPos;
        float d = length(toP);
        float cone = smoothstep(0.88, 0.97, dot(toP / d, uLightDir));
        vLit = cone * (1.0 - smoothstep(6.0, 40.0, d));
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uLitColor;
      uniform float uAmbient;
      varying float vLit;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = uColor * uAmbient + uLitColor * vLit;
        gl_FragColor = vec4(c, 1.0);
        #include <fog_fragment>
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false; // les positions sont calculées dans le shader

  return {
    object: points,
    /**
     * @param {number} time
     * @param {THREE.Vector3} center position de la caméra
     * @param {THREE.Vector3} lightPos position du phare
     * @param {THREE.Vector3} lightDir direction du phare (normalisée)
     * @param {number} ambient luminosité ambiante (0..1)
     */
    update(time, center, lightPos, lightDir, ambient) {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uCenter.value.copy(center);
      u.uLightPos.value.copy(lightPos);
      u.uLightDir.value.copy(lightDir);
      u.uAmbient.value = 0.25 + ambient * 0.6;
    },
  };
}
