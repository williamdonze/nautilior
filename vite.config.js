import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build fonctionne tel quel sur GitHub Pages (sous-dossier du dépôt)
  base: './',
  build: {
    target: 'es2022', // await au premier niveau (initialisation WebGPU)
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      // le jeu, et la carte 3D du monde (outil de travail : carte.html)
      input: { main: 'index.html', carte: 'carte.html' },
      output: {
        // Three.js dans un fichier à part : il reste en cache entre deux mises à jour du jeu
        manualChunks: { three: ['three'] },
      },
    },
  },
});
