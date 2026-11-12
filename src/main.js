/**
 * Nautiliar — point d'entrée.
 * Assemble le renderer pixelisé, le monde sous-marin, le sous-marin, la caméra et le HUD.
 */
import * as THREE from 'three';
import './ui/style.css';
import { PixelRenderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { startLoop } from './core/loop.js';
import { createSeabed } from './world/seabed.js';
import { createDecor } from './world/decor.js';
import { createMarineSnow } from './world/marineSnow.js';
import { createAmbience } from './world/ambience.js';
import { Submarine } from './submarine/submarine.js';
import { FollowCamera } from './submarine/followCamera.js';
import { createBubbles } from './submarine/bubbles.js';
import { Hud } from './ui/hud.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);
const input = new Input();
const hud = new Hud();

const scene = new THREE.Scene();
const ambience = createAmbience(scene);

// --- Monde
scene.add(createSeabed());
const decor = createDecor();
scene.add(decor.group);
const snow = createMarineSnow();
scene.add(snow.object);

// --- Sous-marin
const sub = new Submarine(scene, decor.colliders);
const bubbles = createBubbles();
scene.add(bubbles.object);

// --- Caméra
const follow = new FollowCamera(pixel.aspect);
follow.snap(sub);
pixel.onResize = (aspect) => follow.setAspect(aspect);

// Vecteurs réutilisés chaque frame
const lightPos = new THREE.Vector3();
const lightDir = new THREE.Vector3();
const propPos = new THREE.Vector3();

function update(dt, time) {
  sub.update(dt, time, input);
  follow.update(dt, sub);

  ambience.update(follow.depth, sub.position, time);
  sub.setBeamVisibility(ambience.state.beam);

  decor.update(time);
  sub.getLightRay(lightPos, lightDir);
  snow.update(time, follow.camera.position, lightPos, lightDir, ambience.state.ambient);

  sub.getPropellerPosition(propPos);
  bubbles.update(dt, propPos, Math.abs(sub.throttle) * 22 + 0.5);

  hud.update(sub.depth, input);
}

function render() {
  pixel.render(scene, follow.camera);
}

hud.intro();
startLoop(update, render);

// Accès console pour le débogage (ex. : nautiliar.pixel.setPixelHeight(180))
window.nautiliar = { scene, sub, pixel, follow };
