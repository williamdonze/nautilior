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
import { CaptureFx } from './loot/captureFx.js';
import { ITEMS } from './loot/loot.js';
import { renderThumbnails } from './ui/thumbnails.js';
import { Inventory } from './ui/inventory.js';
import { Survival } from './submarine/survival.js';
import { createRadiationSource } from './world/radiation.js';
import { WakeUp } from './story/wakeup.js';
import { SURVIVAL, SUBMARINE, RADIATION } from './config/settings.js';

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
const radiationSource = createRadiationSource(scene);

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
hud.updateCargo(hold);
const captureFx = new CaptureFx(scene);
const claw = new Claw({
  scene,
  sub,
  sound,
  bubbles,
  pickups,
  hold,
  onShake: (amount) => follow.shake(amount),
  onCapture: (pickup, position) => {
    const { item, rarity } = pickup;
    hud.toast(item, rarity);
    captureFx.play(position, rarity);
    if (rarity.level >= 2) follow.shake(0.1 + rarity.level * 0.06);
    if (rarity.level >= 3) hud.flash(rarity.color);
  },
});
const aim = new Aim(follow.camera, pickups, seabed);

// --- Inventaire (vignettes générées une fois, avant la première frame)
const thumbnails = renderThumbnails(pixel.renderer, ITEMS);
const inventory = new Inventory({
  hold,
  thumbnails,
  onDrop: (index) => {
    const item = hold.removeAt(index);
    pickups.drop(item, sub.position);
    bubbles.burst(sub.position, 16, 2);
    sound.release();
  },
});
// --- Survie : oxygène, coque, pression, radiation
const survival = new Survival();
const wakeUp = new WakeUp({
  sound,
  onRespawn: () => {
    // Dans le noir : on remet tout en place et on retire une partie de la soute
    claw.reset();
    const lost = hold.loseFraction(SURVIVAL.LOSS_FRACTION);
    const S = SUBMARINE.SPAWN;
    sub.teleport(S.x, -1.2, S.z, S.yaw);
    survival.reset();
    follow.snap(sub);
    return lost;
  },
});
survival.onDeath = (cause) => {
  inventory.close();
  wakeUp.play(cause);
};

// Chocs : dégâts, son, secousse, voile rouge
sub.onImpact = (speed) => {
  if (speed < SURVIVAL.IMPACT_THRESHOLD || survival.dead) return;
  const strength = Math.min(1.5, (speed - SURVIVAL.IMPACT_THRESHOLD) / 3);
  survival.impact(speed);
  sound.impact(strength);
  follow.shake(0.15 + strength * 0.35);
  hud.damageFlash(strength);
  bubbles.burst(sub.position, 20, 3);
};

// Dégâts continus (pression, radiation) : on les accumule pour doser les effets
let continuousDamage = 0;
survival.onDamage = (amount, kind) => {
  if (kind !== 'impact') continuousDamage += amount;
};

input.onPress((code) => {
  if (survival.dead) return;
  if (code === 'KeyI' || code === 'Tab') inventory.toggle();
  else if (code === 'Escape') inventory.close();
});

// Le son ne peut démarrer qu'après une interaction
window.addEventListener('keydown', () => sound.unlock());
pointer.onClick(() => {
  sound.unlock();
  if (inventory.isOpen || claw.busy || survival.dead) return;
  if (claw.fire(aim.resolvePoint(claw.root)) === 'full') hud.denyCargo();
});

// Vecteurs réutilisés chaque frame
const lightPos = new THREE.Vector3();
const lightDir = new THREE.Vector3();
const propPos = new THREE.Vector3();
const RAD_GREEN = new THREE.Color(RADIATION.COLOR).multiplyScalar(0.35);
// Pendant le réveil, plus aucune commande
const noInput = { axis: () => 0, is: () => false, anyMovement: false };

// Minuteurs des effets sonores
const timers = { alarm: 0, heart: 0, creak: 1, flash: 0 };

/** Sons et effets liés à la survie */
function survivalEffects(dt) {
  const S = survival;
  if (S.dead) return;
  const o2 = S.oxygenRatio;

  // Alerte d'oxygène, puis battements de cœur
  timers.alarm -= dt;
  if (o2 < SURVIVAL.OXYGEN_WARNING && !S.atSurface && timers.alarm <= 0) {
    const critical = o2 < SURVIVAL.OXYGEN_CRITICAL;
    sound.alarm(critical);
    timers.alarm = critical ? 0.9 : 1.8;
  }
  timers.heart -= dt;
  if (o2 < SURVIVAL.OXYGEN_CRITICAL && timers.heart <= 0) {
    sound.heartbeat(0.8);
    timers.heart = 0.7 + o2 * 4;
  }

  // Grincements : la coque souffre au-delà de sa profondeur max (ou quand elle est très abîmée)
  timers.creak -= dt;
  const stress = Math.min(1, S.overDepth / 40) + (S.hullRatio < 0.3 ? 0.3 : 0);
  if (stress > 0 && timers.creak <= 0) {
    sound.creak(0.6 + stress * 0.6);
    follow.shake(0.05 + stress * 0.15);
    timers.creak = 0.5 + Math.random() * (3 - stress * 2);
  }

  // Compteur Geiger
  if (S.radiation > 0.01 && Math.random() < (S.radiation * 35 + 1) * dt) sound.geiger();

  // Voile rouge proportionnel aux dégâts continus
  timers.flash -= dt;
  if (timers.flash <= 0) {
    if (continuousDamage > 0.4) hud.damageFlash(Math.min(1, continuousDamage / 4));
    continuousDamage = 0;
    timers.flash = 0.8;
  }
}

function update(dt, time) {
  survival.update(dt, sub);
  sub.update(dt, time, survival.dead ? noInput : input);
  claw.update(dt, time);
  follow.update(dt, sub);

  aim.update(pointer, claw.root);
  pickups.setHighlighted(!claw.busy && aim.inRange ? aim.pickup : null);
  pickups.update(time);
  hud.updateReticle(pointer, aim, claw.busy, hold.full);
  captureFx.update(dt, follow.camera);

  ambience.update(follow.depth, sub.position, time);
  // Plus on approche de la source, plus l'eau verdit et l'image ondule
  const rad = survival.radiation;
  if (rad > 0) {
    scene.fog.color.lerp(RAD_GREEN, rad * 0.6);
    scene.background.copy(scene.fog.color);
  }
  pixel.setDistortion(rad * 1.2, time);
  radiationSource.update(time, follow.camera.position);
  survivalEffects(dt);
  hud.updateSurvival(survival, sub.depth);
  sub.setBeamVisibility(ambience.state.beam);

  decor.update(time);
  sub.getLightRay(lightPos, lightDir);
  snow.update(time, follow.camera.position, lightPos, lightDir, ambience.state.ambient, rad);

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
window.nautiliar = { scene, sub, pixel, follow, claw, pickups, hold, aim, inventory, survival };
