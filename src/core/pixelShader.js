/**
 * Shader de post-processing « rétro » :
 *  1. conversion linéaire → sRGB
 *  2. légère désaturation
 *  3. dithering ordonné (matrice de Bayer 4x4) calé sur les pixels basse résolution
 *  4. quantification vers la palette limitée
 */
export const PixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: null }, // résolution basse (en pixels)
    uPalette: { value: [] },
    uDither: { value: 0.05 },
    uPaletteMix: { value: 1.0 },
    uSaturation: { value: 0.85 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec3 uPalette[PALETTE_SIZE];
    uniform float uDither;
    uniform float uPaletteMix;
    uniform float uSaturation;
    varying vec2 vUv;

    // Matrice de Bayer calculée (évite les tableaux constants)
    float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

    vec3 linearToSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
    }

    void main() {
      vec3 col = linearToSRGB(clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0));

      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSaturation);

      // Dithering : un seuil différent pour chaque pixel basse résolution
      vec2 px = floor(vUv * uResolution);
      col += (bayer4(px) - 0.5) * uDither;

      // Couleur de palette la plus proche (distance pondérée façon luminance)
      vec3 best = uPalette[0];
      float bestDist = 1e9;
      for (int i = 0; i < PALETTE_SIZE; i++) {
        vec3 d = (col - uPalette[i]) * vec3(0.55, 0.8, 0.45);
        float dist = dot(d, d);
        if (dist < bestDist) { bestDist = dist; best = uPalette[i]; }
      }

      gl_FragColor = vec4(mix(col, best, uPaletteMix), 1.0);
    }
  `,
};
