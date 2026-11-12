import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build fonctionne aussi sur GitHub Pages (phase 8)
  base: './',
  build: {
    // Three.js pèse ~500 ko : on relève le seuil d'avertissement
    chunkSizeWarningLimit: 900,
  },
});
