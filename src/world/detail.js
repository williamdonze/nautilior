import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Détail des surfaces (inspiré d'Abyssal Garden) :
 *  1. au chargement, une texture qui se répète sans couture est générée sur la carte graphique :
 *     R,G = pente (relief fin), B = hauteur, A = marbrures. On y trouve des grains, des crêtes,
 *     des fissures et des alvéoles ;
 *  2. elle est projetée sous trois angles (« triplanaire », en coordonnées du monde) sur le fond,
 *     les roches, les épaves et les débris, à plusieurs échelles ;
 *  3. selon le type de surface, elle donne le relief (normales perturbées), la couleur
 *     (strates de roche, incrustations, algues sur le dessus, sable ridé, bois veiné, rouille)
 *     et l'occlusion des creux.
 */
const SIZE = 512;

const GEN_FRAG = /* glsl */ `
  varying vec2 vUv;
  float h31(vec3 p) { vec3 q = fract(p * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec3 h33(vec3 p) { vec3 q = fract(p * vec3(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
  float hp(vec2 p, float per) { return h31(vec3(p - per * floor(p / per), per)); }
  float tn(vec2 p, float per) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
    return mix(mix(hp(i, per), hp(i + vec2(1., 0.), per), u.x), mix(hp(i + vec2(0., 1.), per), hp(i + vec2(1., 1.), per), u.x), u.y);
  }
  float tf(vec2 uv, float per, int n) {
    float a = .5, s = 0., pr = per;
    for (int i = 0; i < 8; i++) { if (i >= n) break; s += a * tn(uv * pr + float(i) * 7.3, pr); pr *= 2.; a *= .5; }
    return s / (1. - 2. * a);
  }
  vec3 tw(vec2 p, float per) {
    vec2 i = floor(p), f = fract(p); vec2 d = vec2(9.); float id = 0.;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
      vec2 o = vec2(float(x), float(y)); vec2 c = i + o; vec2 cw = c - per * floor(c / per);
      vec3 hh = h33(vec3(cw, per)); vec2 r = o + hh.xy - f; float l = dot(r, r);
      if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
    }
    return vec3(sqrt(d), id);
  }
  float H(vec2 uv) {
    vec2 wq = uv + .11 * (vec2(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
    float f = tf(wq, 3., 8);
    float r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
    float cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
    float cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
    vec3 pt = tw(wq * 29., 29.);
    float pit = (1. - smoothstep(.0, .34, pt.x)) * step(.62, pt.z);
    return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
  }
  void main() {
    vec2 uv = vUv; float e = 1. / ${SIZE}.;
    float h = H(uv);
    float gx = H(uv + vec2(e, 0.)) - H(uv - vec2(e, 0.));
    float gy = H(uv + vec2(0., e)) - H(uv - vec2(0., e));
    vec2 s = clamp(vec2(gx, gy) * ${SIZE}. * .5 * .075, vec2(-1.), vec2(1.));
    gl_FragColor = vec4(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
  }
`;

let detailTexture = null;

/** Génère la texture de détail (une seule fois) */
export function createDetailTexture(renderer) {
  if (detailTexture) return detailTexture;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: GEN_FRAG,
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  const data = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, data);
  renderer.setRenderTarget(prev);
  rt.dispose();
  mat.dispose();
  quad.dispose();
  // Texture ordinaire (pas une cible de rendu) : elle peut être partagée par tous les matériaux
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  detailTexture = tex;
  return tex;
}

/**
 * Types de surface :
 *  rock  : roche (strates, incrustations rouille/rouge, algues sur le dessus)
 *  sand  : fond (sable ridé, grains, vase, cailloux)
 *  wood  : bois d'épave (veines, planches, mousses)
 *  metal : métal rouillé (coulures, plaques)
 */
const KINDS = { rock: 0, sand: 1, wood: 2, metal: 3, stone: 4 };

const PARS = /* glsl */ `
  uniform sampler2D tDetail;
  uniform float uDetailScale;
  struct TP { float h; float c; vec3 n; };
  // Lecture triplanaire : trois projections mélangées selon l'orientation de la surface
  TP tri(vec3 p, vec3 n, float s) {
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    vec4 x = texture2D(tDetail, p.zy * s), y = texture2D(tDetail, p.xz * s), z = texture2D(tDetail, p.xy * s);
    TP o;
    o.h = x.b * w.x + y.b * w.y + z.b * w.z;
    o.c = x.a * w.x + y.a * w.y + z.a * w.z;
    vec2 a = x.rg * 2. - 1., b = y.rg * 2. - 1., c = z.rg * 2. - 1.;
    o.n = vec3(0., a.y, a.x) * w.x + vec3(b.x, 0., b.y) * w.y + vec3(c.x, c.y, 0.) * w.z;
    return o;
  }
  float dhash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
`;

/**
 * Ajoute le détail à un matériau Lambert (onBeforeCompile).
 * Le matériau doit être éclairé et utiliser le brouillard (position monde : vFogWorld).
 */
export function applyDetail(material, kind = 'rock', scale = 1) {
  const k = KINDS[kind] ?? 0;
  material.flatShading = false;
  material.userData.detail = kind; // lu par le moteur WebGPU (src/gpu/bridge.js)
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.tDetail = { value: detailTexture };
    shader.uniforms.uDetailScale = { value: scale };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `#include <normal_fragment_begin>
        float dAO = 1.0;
        #ifdef USE_FOG
        {
          vec3 P = vFogWorld;
          vec3 wn = normalize(inverseTransformDirection(normal, viewMatrix));
          float dist = length(P - cameraPosition);
          float ts = uDetailScale;
          TP A = tri(P, wn, 0.10 * ts);
          TP B = tri(P, wn, 0.43 * ts);
          TP C = tri(P, wn, 1.9 * ts);
          float hgt = A.h * 0.5 + B.h * 0.35 + C.h * 0.15;
          float nearK = smoothstep(70.0, 8.0, dist);
          float bump = ${k === 1 ? '1.1' : k === 2 ? '0.8' : k === 3 ? '0.6' : '1.7'};
          vec3 pn = wn + (A.n * 0.85 + B.n * 0.65 + C.n * 0.45 * nearK) * bump;
          vec3 alb = diffuseColor.rgb;
          float up = smoothstep(0.55, 0.95, wn.y);
          ${
            k === 0
              ? /* glsl */ `
          // Roche : strates, teinte par couche, incrustations, algues sur les parties qui regardent en haut
          float st = P.y * 0.55 + A.h * 1.6 + B.c * 3.0;
          float bed = dhash(floor(st)); float sf = fract(st);
          alb *= mix(0.72, 1.18, bed) * (1.0 - 0.4 * smoothstep(0.12, 0.0, sf) * (1.0 - abs(wn.y)));
          alb *= 0.55 + 0.9 * hgt;
          float enc = smoothstep(0.48, 0.62, A.c * 0.6 + B.c * 0.5) * smoothstep(0.3, 0.6, hgt);
          alb = mix(alb, mix(vec3(0.30, 0.07, 0.07), vec3(0.36, 0.24, 0.08), smoothstep(0.45, 0.6, C.c)) * (0.5 + 0.8 * B.h), enc * 0.55);
          float alg = smoothstep(-0.1, 0.7, wn.y) * smoothstep(0.32, 0.52, B.c * 0.55 + A.c * 0.5) * smoothstep(-300.0, -20.0, P.y);
          alb = mix(alb, vec3(0.05, 0.14, 0.07) * (0.6 + 0.6 * C.h), alg * 0.75);
          pn += vec3(0.0, -smoothstep(0.14, 0.0, sf) * (1.0 - abs(wn.y)) * 1.2, 0.0);`
              : k === 1
              ? /* glsl */ `
          // Fond : rides de sable alignées sur le courant, grains, taches de vase
          float rip = cos((P.x * 0.8 + P.z * 0.35) * 5.0 + A.c * 9.0);
          pn += vec3(0.8, 0.0, 0.35) * rip * 0.55 * up * nearK;
          alb *= 0.7 + 0.55 * hgt;
          alb *= 1.0 - 0.25 * smoothstep(0.55, 0.75, A.c);
          alb = mix(alb, alb * vec3(1.15, 1.08, 0.9), smoothstep(0.6, 0.8, C.c) * 0.5);
          // Les pentes raides deviennent rocheuses
          float steep = 1.0 - up;
          alb = mix(alb, alb * (0.6 + 0.6 * B.h) * vec3(0.9, 0.95, 1.0), steep * 0.7);`
              : k === 2
              ? /* glsl */ `
          // Bois d'épave : veines, joints entre planches, mousses
          vec4 Wd = texture2D(tDetail, vec2(P.x * 0.06, (P.y + P.z) * 0.7));
          alb *= mix(0.55, 1.15, Wd.b);
          float plank = fract((P.y + P.z * 0.3) * 1.6);
          alb *= 0.45 + 0.55 * smoothstep(0.0, 0.08, min(plank, 1.0 - plank));
          alb = mix(alb, vec3(0.08, 0.2, 0.14), smoothstep(0.5, 0.72, A.c) * up * 0.7);`
              : k === 4
              ? /* glsl */ `
          // Pierre de taille, ardoise, crépi (village) : grain et joints, un peu de lichen, pas d'algues
          alb *= 0.72 + 0.5 * hgt;
          alb = mix(alb, alb * vec3(0.8, 0.9, 0.72), smoothstep(0.62, 0.8, A.c) * 0.35);`
              : /* glsl */ `
          // Métal : coulures de rouille verticales, plaques
          float drip = texture2D(tDetail, vec2((P.x + P.z) * 0.33, P.y * 0.035)).a;
          alb = mix(alb, vec3(0.35, 0.14, 0.06) * (0.6 + 0.6 * B.h), smoothstep(0.5, 0.68, drip * 0.7 + A.c * 0.4) * 0.65);
          alb *= 0.75 + 0.4 * hgt;`
          }
          diffuseColor.rgb = alb;
          // Occlusion des creux (hauteur basse) et des dessous
          dAO = mix(0.45, 1.0, smoothstep(0.12, 0.6, hgt)) * mix(0.7, 1.0, wn.y * 0.5 + 0.5);
          normal = normalize((viewMatrix * vec4(normalize(pn), 0.0)).xyz);
        }
        #endif`
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= dAO;
        reflectedLight.directDiffuse *= mix(1.0, dAO, 0.5);`
      );
  };
  material.customProgramCacheKey = () => `detail-${k}-${prev ? 'p' : ''}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Peau de créature (d'après Abyssal Garden) :
 *  - bord lumineux (lumière ambiante de l'eau qui frôle les contours, effet de Fresnel) ;
 *  - translucidité : la lumière qui vient de derrière traverse les parties fines ;
 *  - irisation légère selon l'angle de vue (écailles, ombrelles).
 * Ajouté dans le calcul de lumière, avant le brouillard d'eau.
 */
export function applySkin(material, { rim = 0.5, translucent = 0.4, iridescent = 0.25, rimColor = '#5fa8a0' } = {}) {
  const prev = material.onBeforeCompile;
  const col = new THREE.Color(rimColor);
  material.userData.skin = iridescent; // lu par le moteur WebGPU
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.uSkinRim = { value: col };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSkinRim;')
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
        {
          vec3 Vv = normalize(vViewPosition);
          float ndv = clamp(abs(dot(normal, Vv)), 0.0, 1.0);
          float fres = pow(1.0 - ndv, 3.0);
          // Lumière ambiante de l'eau (la diffusion qui arrive par les bords)
          vec3 envL = uSkinRim * (0.35 + ambientLightColor);
          reflectedLight.indirectDiffuse += envL * fres * ${rim.toFixed(2)} * diffuseColor.rgb * 2.0;
          // Translucidité : lumière directe vue « à travers » la surface
          reflectedLight.directDiffuse += reflectedLight.directDiffuse * ${translucent.toFixed(2)} * (1.0 - ndv);
          // Irisation : teinte qui tourne avec l'angle de vue
          vec3 ir = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + ndv * 1.1 + 0.55));
          reflectedLight.indirectDiffuse += ir * fres * ${iridescent.toFixed(2)} * 0.25;
        }`
      );
  };
  material.customProgramCacheKey = () => `skin-${rim}-${translucent}-${iridescent}-${prev ? 'p' : ''}`;
  material.needsUpdate = true;
  return material;
}
