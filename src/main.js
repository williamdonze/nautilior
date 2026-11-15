/**
 * Nautiliar — point d'entrée.
 * Crée le renderer pixelisé, les entrées, le son et le HUD, puis lance le jeu.
 */
import './ui/style.css';
import { installWaterFog } from './core/waterFog.js';

// Eau physique : doit être installée avant la compilation du premier matériau
installWaterFog();
import { GameRenderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { Pointer } from './core/pointer.js';
import { Sound } from './core/audio.js';
import { startLoop } from './core/loop.js';
import { Hud } from './ui/hud.js';
import { Game } from './core/game.js';
import { getFloorHeight } from './world/seabed.js';
import { preferences, quality } from './save/preferences.js';

const pixel = new GameRenderer(document.getElementById('game'));
const input = new Input();
const pointer = new Pointer();
const sound = new Sound();
const hud = new Hud();

// Le son ne peut démarrer qu'après une interaction (phase de capture : avant les menus)
window.addEventListener('keydown', () => sound.unlock(), true);
window.addEventListener('pointerdown', () => sound.unlock(), true);

const game = new Game({ pixel, input, pointer, sound, hud });

// --- Réglages du joueur
const fpsEl = document.getElementById('fps');
function applySettings() {
  sound.setVolumes(preferences);
  pixel.setAutoRes(preferences.autoRes);
  fpsEl.style.display = preferences.showFps ? 'block' : 'none';
}
applySettings();
game.applySettings = applySettings;

// --- Écran titre (sauf juste après « Nouvelle partie »)
let autostart = false;
try {
  autostart = sessionStorage.getItem('nautiliar-autostart') === '1';
  sessionStorage.removeItem('nautiliar-autostart');
} catch {
  /* rien */
}
if (autostart) game.start();
else game.showTitle();

// --- Boucle, avec compteur d'images par seconde
let frames = 0, fpsTime = 0;
startLoop(
  (dt, time) => {
    game.update(dt, time);
    pixel.adapt(dt);
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      if (preferences.showFps) {
        // Images/s, temps de calcul de la carte graphique (si mesurable), niveau et résolution
        const gpu = pixel.gpuMs != null ? ` · GPU ${pixel.gpuMs.toFixed(1)} ms` : '';
        fpsEl.textContent = `${Math.round(frames / fpsTime)} i/s${gpu} · ${quality().label} ${Math.round(pixel.quality * 100)} %`;
      }
      frames = 0;
      fpsTime = 0;
    }
  },
  () => game.render()
);

// Accès console pour le débogage (ex. : nautiliar.game.newGame())
window.nautiliar = { game, pixel, getFloorHeight, get dive() { return game.dive; }, get port() { return game.port; } };
