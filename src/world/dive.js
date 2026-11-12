import * as THREE from 'three';
import { createSeabed } from './seabed.js';
import { createDecor } from './decor.js';
import { createMarineSnow } from './marineSnow.js';
import { createAmbience } from './ambience.js';
import { createRadiationSource } from './radiation.js';
import { Pickups } from './pickups.js';
import { Submarine } from '../submarine/submarine.js';
import { FollowCamera } from '../submarine/followCamera.js';
import { createBubbles } from '../submarine/bubbles.js';
import { Survival } from '../submarine/survival.js';
import { stats } from '../submarine/stats.js';
import { Claw } from '../claw/claw.js';
import { Aim } from '../claw/aim.js';
import { CaptureFx } from '../loot/captureFx.js';
import { Inventory } from '../ui/inventory.js';
import { SURVIVAL, SUBMARINE, RADIATION } from '../config/settings.js';
import { Creatures } from './creatures.js';
import { zoneAtDepth } from './zones.js';
import { createPortal } from './portal.js';

/**
 * La plongée : monde sous-marin, sous-marin, pince, survie et leurs effets.
 * Événements vers le jeu : onCapture(pickup) → true si nouvel objet, onDeath(cause), onReturn().
 */
export class Dive {
  constructor({ pixel, input, pointer, sound, hud, hold, thumbnails, onCapture, onDeath, onReturn, onPortal, canFacePortal }) {
    Object.assign(this, { pixel, input, pointer, sound, hud, hold, onCapture, onDeath, onReturn, onPortal, canFacePortal });

    const scene = (this.scene = new THREE.Scene());
    this.ambience = createAmbience(scene);

    // --- Monde
    this.seabed = createSeabed();
    scene.add(this.seabed);
    this.decor = createDecor();
    scene.add(this.decor.group);
    this.snow = createMarineSnow();
    scene.add(this.snow.object);
    this.radiationSource = createRadiationSource(scene);
    this.portal = createPortal(scene);
    this.nearPortal = false;
    this.autopilot = null; // cinématique : le sous-marin est piloté par le script

    // --- Sous-marin et caméra
    this.sub = new Submarine(scene, this.decor.colliders);
    this.bubbles = createBubbles();
    scene.add(this.bubbles.object);
    this.follow = new FollowCamera(pixel.aspect);
    this.follow.snap(this.sub);

    // --- Objets et pince
    this.pickups = new Pickups(scene);
    this.captureFx = new CaptureFx(scene);
    this.claw = new Claw({
      scene,
      sub: this.sub,
      sound,
      bubbles: this.bubbles,
      pickups: this.pickups,
      hold,
      onShake: (a) => this.follow.shake(a),
      onCapture: (pickup, position) => this.captured(pickup, position),
    });
    this.aim = new Aim(this.follow.camera, this.pickups, this.seabed);

    this.inventory = new Inventory({
      hold,
      thumbnails,
      onDrop: (index) => {
        const item = hold.removeAt(index);
        this.pickups.drop(item, this.sub.position);
        this.bubbles.burst(this.sub.position, 16, 2);
        sound.release();
      },
    });

    // --- Faune
    this.creatures = new Creatures(scene, {
      growl: () => sound.growl(),
      bite: (mutant, dir) => {
        sound.bite();
        this.follow.shake(0.6);
        hud.damageFlash(1);
        this.bubbles.burst(this.sub.position, 30, 4);
        this.sub.velocity.addScaledVector(dir, 6); // le choc repousse le sous-marin
      },
    });
    this.zoneId = null;
    this.whisperTimer = 0;

    // --- Survie
    this.survival = new Survival();
    this.survival.onDeath = (cause) => {
      this.inventory.close();
      this.hud.setPrompt('');
      this.onDeath(cause);
    };
    this.continuousDamage = 0;
    this.survival.onDamage = (amount, kind) => {
      if (kind !== 'impact') this.continuousDamage += amount;
    };
    this.sub.onImpact = (speed) => this.impact(speed);

    // Vecteurs et minuteurs réutilisés
    this._lightPos = new THREE.Vector3();
    this._lightDir = new THREE.Vector3();
    this._propPos = new THREE.Vector3();
    this.radGreen = new THREE.Color(RADIATION.COLOR).multiplyScalar(0.35);
    this.timers = { alarm: 0, heart: 0, creak: 1, flash: 0 };
    this.noInput = { axis: () => 0, is: () => false, anyMovement: false };
  }

  get camera() {
    return this.follow.camera;
  }

  setAspect(aspect) {
    this.follow.setAspect(aspect);
  }

  /** Début d'une plongée : on part du quai, juste sous la surface */
  enter(seed, foundFragments = []) {
    this.pickups.reset(seed, foundFragments);
    this.creatures.clear();
    this.zoneId = null;
    this.claw.reset();
    this.sub.applyLight(stats);
    this.survival.reset(); // la coque a été réparée au port
    const S = SUBMARINE.SPAWN;
    this.sub.teleport(S.x, -2.5, S.z, S.yaw);
    this.follow.snap(this.sub);
    this.hud.updateCargo(this.hold);
  }

  leave() {
    this.sound.setDrone(0);
    this.inventory.close();
    this.claw.reset();
    this.sound.motorStop();
    this.hud.setPrompt('');
    this.pixel.setDistortion(0, 0);
  }

  /** Capture : effets, et mise à jour de la collection par le jeu */
  captured(pickup, position) {
    const { item, rarity } = pickup;
    const isNew = this.onCapture(pickup);
    this.hud.toast(item, rarity, isNew);
    this.captureFx.play(position, rarity);
    if (rarity.level >= 2) this.follow.shake(0.1 + rarity.level * 0.06);
    if (rarity.level >= 3) this.hud.flash(rarity.color);
  }

  impact(speed) {
    if (speed < SURVIVAL.IMPACT_THRESHOLD || this.survival.dead) return;
    const strength = Math.min(1.5, (speed - SURVIVAL.IMPACT_THRESHOLD) / 3);
    this.survival.impact(speed);
    this.sound.impact(strength);
    this.follow.shake(0.15 + strength * 0.35);
    this.hud.damageFlash(strength);
    this.bubbles.burst(this.sub.position, 20, 3);
  }

  /** Clic gauche : la pince */
  click() {
    if (this.inventory.isOpen || this.claw.busy || this.survival.dead) return;
    if (this.claw.fire(this.aim.resolvePoint(this.claw.root)) === 'full') this.hud.denyCargo();
  }

  key(code) {
    if (this.survival.dead) return;
    if (code === 'KeyI' || code === 'Tab') this.inventory.toggle();
    else if (code === 'Escape') this.inventory.close();
    else if (code === 'KeyE' && this.survival.atSurface && !this.claw.busy) this.onReturn();
    else if (code === 'KeyE' && this.nearPortal && !this.claw.busy) this.onPortal();
  }

  /** Sons et effets liés à la survie */
  survivalEffects(dt) {
    const S = this.survival;
    const { sound, timers } = this;
    if (S.dead) return;
    const o2 = S.oxygenRatio;

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

    timers.creak -= dt;
    const stress = Math.min(1, S.overDepth / 40) + (S.hullRatio < 0.3 ? 0.3 : 0);
    if (stress > 0 && timers.creak <= 0) {
      sound.creak(0.6 + stress * 0.6);
      this.follow.shake(0.05 + stress * 0.15);
      timers.creak = 0.5 + Math.random() * (3 - stress * 2);
    }

    if (S.radiation > 0.01 && Math.random() < (S.radiation * 35 + 1) * dt) sound.geiger();

    timers.flash -= dt;
    if (timers.flash <= 0) {
      if (this.continuousDamage > 0.4) this.hud.damageFlash(Math.min(1, this.continuousDamage / 4));
      this.continuousDamage = 0;
      timers.flash = 0.8;
    }
  }

  update(dt, time) {
    const { sub, survival, follow, hud, scene, sound } = this;
    // Pendant une cinématique, ni l'air ni la coque ne s'épuisent
    if (!this.autopilot) survival.update(dt, sub);
    sub.update(dt, time, survival.dead || this.autopilot ? this.noInput : this.input);
    if (this.autopilot) this.autopilot(dt);
    this.claw.update(dt, time);
    follow.update(dt, sub);

    this.aim.update(this.pointer, this.claw.root);
    this.pickups.setHighlighted(!this.claw.busy && this.aim.inRange ? this.aim.pickup : null);
    this.pickups.update(time, follow.camera.position);
    hud.updateReticle(this.pointer, this.aim, this.claw.busy, this.hold.full);
    this.captureFx.update(dt, follow.camera);

    this.ambience.update(follow.depth, sub.position, time);
    // Plus on approche de la source, plus l'eau verdit et l'image ondule
    const rad = survival.radiation;
    if (rad > 0) {
      scene.fog.color.lerp(this.radGreen, rad * 0.6);
      scene.background.copy(scene.fog.color);
    }
    this.pixel.setDistortion(rad * 1.2, time);
    this.radiationSource.update(time, follow.camera.position);
    this.survivalEffects(dt);
    hud.updateSurvival(survival, sub.depth);
    sub.setBeamVisibility(this.ambience.state.beam);

    this.decor.update(time);
    sub.getLightRay(this._lightPos, this._lightDir);
    this.snow.update(time, follow.camera.position, this._lightPos, this._lightDir, this.ambience.state.ambient, rad);

    sub.getPropellerPosition(this._propPos);
    this.bubbles.update(dt, this._propPos, Math.abs(sub.throttle) * 22 + 0.5);

    hud.update(sub.depth, this.input);
    // Le portail : bourdonnement qui monte à l'approche, et invite quand on est devant
    const portalDist = sub.position.distanceTo(this.portal.center);
    this.portal.update(time);
    sound.setDrone(Math.max(0, 1 - portalDist / 160) * this.portal.open);
    this.nearPortal = portalDist < 32 && this.portal.open > 0.5 && !survival.dead && !this.autopilot && this.canFacePortal();
    hud.setPrompt(
      survival.dead || this.autopilot ? '' : survival.atSurface ? 'Rentrer au port' : this.nearPortal ? 'Faire face au portail' : ''
    );

    // --- Zones et faune
    const zone = zoneAtDepth(sub.depth);
    if (zone.id !== this.zoneId) {
      this.zoneId = zone.id;
      hud.showZone(zone);
    }
    if (!survival.dead) {
      const damage = this.creatures.update(dt, time, sub, zone);
      if (damage > 0 && !this.autopilot) survival.damage(damage, 'creature');
    }

    // --- Un fragment de mémoire tout proche « appelle »
    this.whisperTimer -= dt;
    if (this.whisperTimer <= 0) {
      let nearest = Infinity;
      for (const f of this.pickups.fragments) nearest = Math.min(nearest, f.object.position.distanceTo(sub.position));
      if (nearest < 45) {
        sound.whisper(1 - nearest / 45);
        this.whisperTimer = 2 + nearest / 8;
      } else this.whisperTimer = 1;
    }
  }
}
