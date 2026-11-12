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

const pixel = new PixelRenderer(document.getElementById('game'));
const input = new Input();
const pointer = new Pointer();
const sound = new Sound();
const hud = new Hud();

// Le son ne peut démarrer qu'après une interaction
window.addEventListener('keydown', () => sound.unlock());
window.addEventListener('pointerdown', () => sound.unlock());

const game = new Game({ pixel, input, pointer, sound, hud });
game.start();
startLoop(
  (dt, time) => game.update(dt, time),
  () => game.render()
);

// Accès console pour le débogage (ex. : nautiliar.pixel.setPixelHeight(180), nautiliar.game.newGame())
window.nautiliar = { game, pixel, get dive() { return game.dive; }, get port() { return game.port; } };
