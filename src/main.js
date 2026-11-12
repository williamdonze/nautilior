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
import { Pointer } from './core/pointer.js';
import { Sound } from './core/audio.js';
import { Pickups } from './world/pickups.js';
import { Hold } from './loot/hold.js';
import { Claw } from './claw/claw.js';
import { Aim } from './claw/aim.js';

const container = document.getElementById('game');
const pixel = new PixelRenderer(container);
const input = new Input();
const pointer = new Pointer();
const sound = new Sound();
const hud = new Hud();

const scene = new THREE.Scene();
const ambience = createAmbience(scene);

// --- Monde
const seabed = createSeabed();
scene.add(seabed);
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

// --- Objets, soute et pince
const pickups = new Pickups(scene);
const hold = new Hold();
hold.onChange(() => hud.updateCargo(hold));
const claw = new Claw({
  scene,
  sub,
  sound,
  bubbles,
  pickups,
  hold,
  onShake: (amount) => follow.shake(amount),
  onCapture: (item) => hud.toast(item),
});
const aim = new Aim(follow.camera, pickups, seabed);

// Le son ne peut démarrer qu'après une interaction
window.addEventListener('keydown', () => sound.unlock());
pointer.onClick(() => {
  sound.unlock();
  if (!claw.busy) claw.fire(aim.resolvePoint(claw.root));
});

// Vecteurs réutilisés chaque frame
const lightPos = new THREE.Vector3();
const lightDir = new THREE.Vector3();
const propPos = new THREE.Vector3();

function update(dt, time) {
  sub.update(dt, time, input);
  claw.update(dt, time);
  follow.update(dt, sub);

  aim.update(pointer, claw.root);
  pickups.setHighlighted(!claw.busy && aim.inRange ? aim.pickup : null);
  pickups.update(time);
  hud.updateReticle(pointer, aim, claw.busy);

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
window.nautiliar = { scene, sub, pixel, follow, claw, pickups, hold, aim };
