import * as THREE from 'three';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function createRandom(seed) {
  let a = seed >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.range = (min, max) => min + rand() * (max - min);
  rand.int = (min, max) => Math.floor(rand.range(min, max + 1));
  rand.pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return rand;
}

/** Hex sRGB → Vector3 brut (sans conversion d'espace colorimétrique), pour le shader de palette. */
export function hexToSRGBVector(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Facteur de lissage indépendant du framerate. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/**
 * Peint chaque triangle d'une géométrie non indexée avec une couleur unie
 * (renforce l'aspect flat shading). `colorFn(center, normal, index)` renvoie une THREE.Color.
 */
export function paintFaces(geometry, colorFn) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const center = new THREE.Vector3(), normal = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    center.copy(a).add(b).add(c).divideScalar(3);
    normal.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    const col = colorFn(center, normal, i / 3);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = col.r;
      colors[(i + k) * 3 + 1] = col.g;
      colors[(i + k) * 3 + 2] = col.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
