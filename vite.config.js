import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build fonctionne tel quel sur GitHub Pages (sous-dossier du dépôt)
  base: './',
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three.js dans un fichier à part : il reste en cache entre deux mises à jour du jeu
        manualChunks: { three: ['three'] },
      },
    },
  },
});
