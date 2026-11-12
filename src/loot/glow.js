import * as THREE from 'three';

/**
 * Effets lumineux des objets rares : halo (sprite additif) et colonne de lumière
 * visible de loin pour les objets épiques et légendaires.
 */

let haloTexture = null;

/** Texture de halo : dégradé radial blanc, en escalier pour rester « pixel » */
function getHaloTexture() {
  if (haloTexture) return haloTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const v = Math.max(0, 1 - d);
      const stepped = Math.round(v * v * 5) / 5; // paliers
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = stepped * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.magFilter = THREE.NearestFilter;
  haloTexture.minFilter = THREE.NearestFilter;
  return haloTexture;
}

export function createHalo(color, size) {
  const mat = new THREE.SpriteMaterial({
    map: getHaloTexture(),
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Pas de brouillard : en mode additif, le brouillard ajouterait sa couleur (halo grisâtre).
    // Le halo sert justement de balise visible de loin.
    fog: false,
    opacity: 0.75,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  sprite.userData.baseSize = size;
  return sprite;
}

/** Colonne de lumière verticale qui s'estompe vers le haut */
export function createPillar(color, height) {
  const geo = new THREE.CylinderGeometry(0.25, 0.6, height, 6, 1, true);
  geo.translate(0, height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHeight: { value: height },
      uOpacity: { value: 0.4 },
    },
    vertexShader: /* glsl */ `
      uniform float uHeight;
      varying float vT;
      void main() {
        vT = position.y / uHeight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vT;
      void main() {
        float a = uOpacity * pow(1.0 - vT, 2.0);
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}
