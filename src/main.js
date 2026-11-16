/**
 * Nautiliar — point d'entrée.
 * Crée le renderer pixelisé, les entrées, le son et le HUD, puis lance le jeu.
 */
import './ui/style.css';
import './ui/theme.css';
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
import { gpuMode } from './gpu/mode.js';
import { GpuDiveRenderer, requestGpu } from './gpu/diveRenderer.js';

const pixel = new GameRenderer(document.getElementById('game'));
const input = new Input();
const pointer = new Pointer();
const sound = new Sound();
const hud = new Hud();

// Le son ne peut démarrer qu'après une interaction (phase de capture : avant les menus)
window.addEventListener('keydown', () => sound.unlock(), true);
window.addEventListener('pointerdown', () => sound.unlock(), true);

// --- Plongée en WebGPU (rendu façon Abyssal Garden) si le navigateur le permet ; sinon Three.js
let gpuDive = null;
let noGpu = new URLSearchParams(location.search).has('webgl');
try { noGpu ||= sessionStorage.getItem('nautiliar-nogpu') === '1'; } catch { /* rien */ }
const device = noGpu ? null : await requestGpu();
if (device) {
  try {
    gpuMode.active = true;
    gpuDive = new GpuDiveRenderer(device, document.getElementById('game'), preferences.qualityLevel);
    // Carte graphique perdue : on relance le jeu avec le rendu Three.js
    gpuDive.onLost = () => {
      try { sessionStorage.setItem('nautiliar-nogpu', '1'); sessionStorage.setItem('nautiliar-autostart', '1'); } catch { /* rien */ }
      location.reload();
    };
  } catch (err) {
    console.warn('WebGPU indisponible, rendu Three.js :', err);
    gpuMode.active = false;
    gpuDive = null;
  }
}

const game = new Game({ pixel, input, pointer, sound, hud, gpuDive });
game.dive.organs = gpuDive?.organs ?? null; // buissons d'orgues plantés par le moteur (ils sonnent au passage)

// --- Réglages du joueur
const fpsEl = document.getElementById('fps');
function applySettings() {
  sound.setVolumes(preferences);
  pixel.setAutoRes(preferences.autoRes);
  if (gpuDive) gpuDive.autoRes = preferences.autoRes;
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
if (autostart) {
  document.body.classList.remove('in-menu');
  game.start();
} else game.showTitle();

// Fin du démarrage : on attend que la première image soit dessinée, puis l'écran de chargement s'efface
// (sans cela, on apercevait le HUD de plongée et le sonar le temps que tout se mette en place)
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.body.classList.remove('booting');
  setTimeout(() => document.getElementById('boot')?.remove(), 1600);
}));

// --- Boucle, avec compteur d'images par seconde
let frames = 0, fpsTime = 0;
startLoop(
  (dt, time) => {
    game.update(dt, time);
    if (gpuDive && game.mode === 'dive') gpuDive.adapt(dt);
    else pixel.adapt(dt);
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
import('./dev/commands.js').then((m) => m.installDevCommands(window.nautiliar));
window.nautiliar = { game, pixel, gpuDive, getFloorHeight, get dive() { return game.dive; }, get port() { return game.port; } };
