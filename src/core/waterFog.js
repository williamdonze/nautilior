import * as THREE from 'three';

/**
 * Eau physiquement crédible (inspirée d'Abyssal Garden), injectée dans TOUS les matériaux
 * en remplaçant les morceaux de shader « fog » de Three.js.
 *
 * Sous l'eau, au lieu d'un simple mélange vers une couleur de brouillard :
 *  - transmission par canal : l'eau absorbe d'abord le rouge, puis le vert ; le bleu porte loin ;
 *  - diffusion (« in-scattering ») : la lumière diffusée par l'eau entre la caméra et l'objet,
 *    plus claire en regardant vers la surface, plus sombre en regardant vers le fond,
 *    avec une diffusion vers l'avant autour de la direction du soleil.
 * Les paramètres viennent du brouillard de la scène (couleur et densité, qui suivent la profondeur).
 *
 * Hors de l'eau (caméra au-dessus de la surface : le port), on garde le brouillard classique.
 */

// Rapport d'extinction entre canaux (rouge, vert, bleu), relatif au vert
export const WATER_EXTINCTION = new THREE.Vector3(1.55, 1.0, 0.78);

const pars = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  // Épaisseur optique : un peu plus que linéaire, pour garder les objets proches nets
  vec3 waterTransmittance(float d, float density) {
    float od = density * d * (0.65 + 0.35 * min(density * d, 3.0));
    return exp(-vec3(${WATER_EXTINCTION.x.toFixed(3)}, ${WATER_EXTINCTION.y.toFixed(3)}, ${WATER_EXTINCTION.z.toFixed(3)}) * od);
  }
  // Lumière diffusée par l'eau, selon la direction du regard
  vec3 waterInscatter(vec3 rd, vec3 base, float camY, float pY) {
    float up = 0.62 + 0.55 * rd.y + 0.15 * rd.y * rd.y;
    vec3 sunDir = normalize(vec3(0.25, 1.0, 0.18));
    float mu = max(dot(rd, sunDir), 0.0);
    float fwd = 1.0 + 0.9 * pow(mu, 6.0) + 0.35 * mu * mu;
    // Plus le point regardé est profond, plus l'eau autour de lui est sombre
    float grad = exp(clamp((pY - camY) * 0.012, -2.5, 1.2));
    return base * up * fwd * mix(1.0, grad, 0.6);
  }
#endif
`;

const fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    if (cameraPosition.y < 0.0) {
      vec3 fv = vFogWorld - cameraPosition;
      float fd = length(fv);
      vec3 frd = fv / max(fd, 1e-4);
      vec3 T = waterTransmittance(fd, fogDensity);
      gl_FragColor.rgb = gl_FragColor.rgb * T + waterInscatter(frd, fogColor, cameraPosition.y, vFogWorld.y) * (1.0 - T);
    } else {
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
    }
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif
`;

const parsVertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;

// Position monde retrouvée depuis la position caméra : world = Rᵀ · view + caméra
const vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = -mvPosition.z;
  vFogWorld = transpose(mat3(viewMatrix)) * mvPosition.xyz + cameraPosition;
#endif
`;

/** À appeler une fois, avant la compilation du premier matériau */
export function installWaterFog() {
  THREE.ShaderChunk.fog_pars_fragment = pars;
  THREE.ShaderChunk.fog_fragment = fragment;
  THREE.ShaderChunk.fog_pars_vertex = parsVertex;
  THREE.ShaderChunk.fog_vertex = vertex;
}

/** Même calcul, en GLSL, pour le fond d'eau (voir ambience.js) */
export const WATER_GLSL = pars.replace('#ifdef USE_FOG', '').replace(/#endif\s*$/, '').replace(/uniform[^;]*;|varying[^;]*;|#ifdef FOG_EXP2|#else|#endif/g, '');
