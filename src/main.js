/**
 * Nautiliar — point d'entrée.
 * Crée le renderer pixelisé, les entrées, le son et le HUD, puis lance le jeu.
 */
import './ui/style.css';
import { PixelRenderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { Pointer } from './core/pointer.js';
import { Sound } from './core/audio.js';
import { startLoop } from './core/loop.js';
import { Hud } from './ui/hud.js';
import { Game } from './core/game.js';
import { getFloorHeight } from './world/seabed.js';
import { loadPreferences, preferences, PIXEL_LEVELS } from './save/preferences.js';

const pixel = new PixelRenderer(document.getElementById('game'));
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
  const h = PIXEL_LEVELS[preferences.pixelLevel]?.height ?? 240;
  if (pixel.pixelHeight !== h) pixel.setPixelHeight(h);
  pixel.setDither(preferences.dither);
  fpsEl.style.display = preferences.showFps ? 'block' : 'none';
}
loadPreferences();
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
    frames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      if (preferences.showFps) fpsEl.textContent = `${Math.round(frames / fpsTime)} i/s`;
      frames = 0;
      fpsTime = 0;
    }
  },
  () => game.render()
);

// Accès console pour le débogage (ex. : nautiliar.pixel.setPixelHeight(180), nautiliar.game.newGame())
window.nautiliar = { game, pixel, getFloorHeight, get dive() { return game.dive; }, get port() { return game.port; } };
