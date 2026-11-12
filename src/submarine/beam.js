import * as THREE from 'three';

/**
 * Faux faisceau volumétrique du phare : cône additif très transparent
 * qui s'estompe sur sa longueur. Invisible en surface, de plus en plus marqué en profondeur.
 */
export function createBeam(length = 28, radius = 6) {
  const geo = new THREE.ConeGeometry(radius, length, 12, 1, true);
  geo.rotateX(-Math.PI / 2); // la pointe passe côté -Z
  geo.translate(0, 0, length / 2); // pointe à l'origine, ouverture vers +Z

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#efe3bb') },
      uOpacity: { value: 0 },
      uLength: { value: length },
    },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vT;
      void main() {
        vT = position.z / uLength;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vT;
      void main() {
        float a = uOpacity * pow(1.0 - clamp(vT, 0.0, 1.0), 1.8);
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 10;
  return {
    mesh,
    setOpacity(v) {
      material.uniforms.uOpacity.value = v;
      mesh.visible = v > 0.002;
    },
  };
}
