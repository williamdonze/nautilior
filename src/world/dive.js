import * as THREE from 'three';
import { createSeabed } from './seabed.js';
import { createDecor } from './decor.js';
import { createMarineSnow } from './marineSnow.js';
import { createAmbience } from './ambience.js';
import { createRadiationSource } from './radiation.js';
import { Pickups } from './pickups.js';
import { Submarine } from '../submarine/submarine.js';
import { FollowCamera } from '../submarine/followCamera.js';
import { CockpitCamera } from '../submarine/cockpitCamera.js';
import { createBubbles } from '../submarine/bubbles.js';
import { Survival } from '../submarine/survival.js';
import { stats } from '../submarine/stats.js';
import { Claw } from '../claw/claw.js';
import { Aim } from '../claw/aim.js';
import { CaptureFx } from '../loot/captureFx.js';
import { Inventory } from '../ui/inventory.js';
import { SURVIVAL, SUBMARINE, RADIATION, DEFENSE, ECHO } from '../config/settings.js';
import { Creatures } from './creatures.js';
import { Wildlife } from './wildlife.js';
import { gpuMode } from '../gpu/mode.js';
import { Guardian } from './guardian.js';
import { PortalFx } from './portalFx.js';
import { PaleDiver } from './paleDiver.js';
import voicesData from '../story/voices.json';
import { zoneAtDepth } from './zones.js';
import { createPortal } from './portal.js';
import { pointScale } from '../core/renderer.js';
import { Radar } from '../ui/radar.js';
import { CENTER_POINTER } from '../core/pointer.js';
import { WRECK_SPOTS } from './landmarks.js';
import { getFloorHeight } from './seabed.js';
import { Wake } from './flora.js';
import { updateTileCulling } from './tiles.js';

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
    this.portalFx = new PortalFx(scene, this.portal);
    this.radar = new Radar(sound);
    this.radar.setWorld(this.decor.group); // nuage de points du sonar 3D
    this.wake = new Wake();
    this._contacts = [];
    this.pulseCooldown = 0;
    this.pulseFx = 0;
    // Repères fixes visibles au sonar : épaves et portail
    this.landmarkContacts = [
      ...WRECK_SPOTS.map(([x, z], i) => ({ id: `wreck${i}`, kind: 'wreck', x, y: getFloorHeight(x, z), z })),
      { id: 'portal', kind: 'wreck', x: this.portal.center.x, y: this.portal.center.y, z: this.portal.center.z },
    ];
    this.nearPortal = false;
    this.autopilot = null; // cinématique : le sous-marin est piloté par le script

    // --- Sous-marin et caméra
    this.sub = new Submarine(scene, this.decor.colliders);
    this.bubbles = createBubbles();
    scene.add(this.bubbles.object);
    this.follow = new FollowCamera(pixel.aspect);
    this.follow.snap(this.sub);
    this.cockpitCam = new CockpitCamera(pixel.aspect);
    this.view = 'first'; // 'first' (poste de pilotage) ou 'third' (vue extérieure, touche V)


    // --- Objets et pince
    this.pickups = new Pickups(scene, this.decor.colliders);
    this.captureFx = new CaptureFx(scene);
    this.claw = new Claw({
      scene,
      sub: this.sub,
      sound,
      bubbles: this.bubbles,
      pickups: this.pickups,
      hold,
      onShake: (a) => this.shake(a),
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
        this.shake(1.1);
        hud.damageFlash(1);
        this.bubbles.burst(this.sub.position, 40, 5);
        this.sub.velocity.addScaledVector(dir, 11); // le choc projette le sous-marin…
        this.sub.yawVelocity += (Math.random() - 0.5) * 2.4; // …et le fait embarder
      },
    });
    // Grande faune : raies, tortues, requins… et leurs cousins décharnés des profondeurs
    this.wildlife = new Wildlife(scene, {
      charge: () => sound.growl(1.2),
      // le Linceul se plaque sur la bulle : on n'y voit presque plus rien
      veil: (on) => hud.setShroud(on),
      hit: (animal, dir) => {
        sound.bite();
        sound.impact(1.2);
        this.shake(0.9 + animal.size * 0.06);
        hud.damageFlash(1);
        this.bubbles.burst(this.sub.position, 36, 5);
        this.sub.velocity.addScaledVector(dir, 7 + animal.size);
        this.sub.yawVelocity += (Math.random() - 0.5) * 2;
      },
    });
    // Le gardien du portail
    this.guardian = new Guardian(scene, {
      roar: () => {
        sound.growl(2.2);
        sound.rumble?.(1);
        this.shake(0.5);
      },
      bite: (dir) => {
        sound.bite();
        sound.impact(1.5);
        this.shake(1.6);
        hud.damageFlash(1);
        this.bubbles.burst(this.sub.position, 60, 7);
        this.sub.velocity.addScaledVector(dir, 22);
        this.sub.yawVelocity += (Math.random() - 0.5) * 4;
      },
      bump: (dir) => {
        sound.impact(1);
        this.shake(0.6);
        hud.damageFlash(0.7);
      },
    });
    // Le plongeur pâle, qui montre où chercher
    this.paleDiver = new PaleDiver(scene);
    this.voiceTimer = 12;
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
    this._nose = new THREE.Vector3();
    this.raysParams = { time: 0, sun: 0, sunColor: new THREE.Color(), density: 0.03, spotPos: new THREE.Vector3(), spotDir: new THREE.Vector3(), spotCos: 0.88, spot: 0 };
    this.radGreen = new THREE.Color(RADIATION.COLOR).multiplyScalar(0.35);
    this.timers = { alarm: 0, heart: 0, creak: 1, flash: 0 };
    this.noInput = { axis: () => 0, is: () => false, anyMovement: false };
  }

  get camera() {
    return this.view === 'first' ? this.cockpitCam.camera : this.follow.camera;
  }

  get cameraDepth() {
    return this.view === 'first' ? this.cockpitCam.depth : this.follow.depth;
  }

  setAspect(aspect) {
    this.follow.setAspect(aspect);
    this.cockpitCam.setAspect(aspect);
  }

  /** Secousse de caméra (quelle que soit la vue) */
  shake(amount) {
    this.follow.shake(amount);
    this.cockpitCam.shake(amount);
  }

  /** Vue à la 1re personne (poste de pilotage) ou vue extérieure */
  setView(view) {
    this.view = view;
    document.body.classList.toggle('view-first', view === 'first'); // l'interface s'efface en vue cockpit
    if (view === 'third') this.pointer.unlock();
    this.sub.setHullVisible(view === 'third');
    this.aim.camera = this.camera;

    if (view === 'third') {
      this.follow.snap(this.sub);
      this.sub.aimLight(0, 0);
    } else this.cockpitCam.reset();
  }

  /** Modèle de sous-marin selon le niveau de coque */
  setHullLevel(level) {
    this.sub.setModel(level);
    this.setView(this.view);
  }

  /** Début d'une plongée : on part du quai, juste sous la surface */
  enter(seed, foundFragments = [], taken = []) {
    this.pickups.reset(seed, foundFragments, this.hold.toIds(), taken);
    this.creatures.clear();
    this.wildlife.clear();
    this.guardian.reset();
    this.paleDiver.reset();
    this.foundCount = foundFragments.length;
    this.zoneId = null;
    this.claw.reset();
    this.sub.applyLight(stats);
    this.survival.reset(); // la coque a été réparée au port
    const S = SUBMARINE.SPAWN;
    this.sub.teleport(S.x, -2.5, S.z, S.yaw);
    this.follow.snap(this.sub);
    this.setView(this.view);
    this.hud.updateCargo(this.hold);
  }

  leave() {
    this.pixel.setRays(null);
    this.sound.setDrone(0);
    this.sound.setRift?.(0, 56);
    this.sound.setSonar(false);
    this.sound.stopEngine();
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
    if (rarity.level >= 2) this.shake(0.1 + rarity.level * 0.06);
    if (rarity.level >= 3) this.hud.flash(rarity.color);
  }

  impact(speed) {
    if (speed < SURVIVAL.IMPACT_THRESHOLD || this.survival.dead) return;
    const strength = Math.min(1.5, (speed - SURVIVAL.IMPACT_THRESHOLD) / 3);
    this.survival.impact(speed);
    this.sound.impact(strength);
    this.shake(0.15 + strength * 0.35);
    this.hud.damageFlash(strength);
    this.bubbles.burst(this.sub.position, 20, 3);
  }

  /** Tout ce que le sonar peut détecter (seulement ce qui est à portée, pour rester léger) */
  gatherContacts() {
    const C = this._contacts;
    C.length = 0;
    const p = this.sub.position;
    const r2 = (stats.radarRange + 5) ** 2;
    const near = (x, z) => (x - p.x) ** 2 + (z - p.z) ** 2 < r2;
    for (const k of this.pickups.list) {
      const o = k.object.position;
      // Seuls les objets qui comptent : souvenirs, pièces rares et au-delà, objets uniques
      const important = k.item.fragment || k.item.spawn || k.rarity.level >= 2;
      if (important && near(o.x, o.z)) C.push({ id: k.object.id, kind: k.item.fragment ? 'fragment' : 'item', x: o.x, y: o.y, z: o.z });
    }
    for (const m of this.creatures.mutants) {
      if (near(m.pos.x, m.pos.z)) C.push({ id: m.object.id, kind: 'creature', x: m.pos.x, y: m.pos.y, z: m.pos.z });
    }
    for (const a of this.wildlife.animals) {
      if (near(a.pos.x, a.pos.z)) C.push({ id: a.object.id, kind: a.spec.damage > 0 ? 'creature' : 'fish', x: a.pos.x, y: a.pos.y, z: a.pos.z, size: a.size });
    }
    this.guardian.contacts(C);
    for (const l of this.landmarkContacts) if (near(l.x, l.z)) C.push(l);
    return C;
  }

  /** Tout ce qui bouge, pour le sonar 3D (dessiné avec les points de son propre corps) */
  movers() {
    const M = (this._movers ??= []);
    M.length = 0;
    for (const a of this.wildlife.animals) M.push({ object: a.object, hostile: a.spec.damage > 0 });
    for (const m of this.creatures.mutants) M.push({ object: m.object, hostile: true });
    if (this.guardian.group.visible) M.push({ object: this.guardian.head, hostile: true, chain: this.guardian.segs, radius: this.guardian.spacing * 0.8 });
    return M;
  }

  /** Clic gauche : la pince (en vue cockpit, le premier clic capture la souris) */
  click() {
    if (this.inventory.isOpen || this.survival.dead) return;
    // La pince se commande aux manettes : uniquement depuis le poste de pilotage
    if (this.view === 'third') {
      this.hud.needCockpit();
      return;
    }
    if (this.view === 'first' && !this.pointer.locked) {
      this.pointer.lock();
      return;
    }
    if (this.claw.busy) return;
    if (this.claw.fire(this.aim.resolvePoint(this.claw.root)) === 'full') this.hud.denyCargo();
  }

  key(code) {
    if (this.survival.dead) return;
    if (code === 'KeyI' || code === 'Tab') this.inventory.toggle();
    else if (code === 'Escape') this.inventory.close();
    else if (code === 'KeyF') this.pulse();
    else if (code === 'KeyR') this.echo();
    else if (code === 'KeyV') this.setView(this.view === 'first' ? 'third' : 'first');
    else if (code === 'KeyE' && this.survival.atSurface && !this.claw.busy) this.onReturn();
    else if (code === 'KeyE' && this.nearPortal && !this.claw.busy) this.onPortal();
  }

  /**
   * Impulsion : le sonar crache une onde assourdissante. Tout ce qui rôde à portée prend la fuite
   * quelques secondes. Elle se recharge lentement (voir DEFENSE dans config/settings.js).
   */
  pulse() {
    if (this.pulseCooldown > 0 || this.autopilot) return;
    this.pulseCooldown = DEFENSE.COOLDOWN;
    this.sound.pulse?.();
    this.creatures.scare(this.sub.position, DEFENSE.RADIUS, DEFENSE.FEAR_TIME);
    this.wildlife.scare(this.sub.position, DEFENSE.RADIUS, DEFENSE.FEAR_TIME);
    this.guardian?.scare(DEFENSE.FEAR_TIME * 0.5);
    this.radar.pulse?.();
    this.pulseFx = 1;
    this.shake(0.25);
    this.hud.flash('#7fd0c0');
  }

  /**
   * Le bip du sonar. Régulier comme un pouls : calme en temps normal (≈ 56 par minute), il s'emballe
   * quand l'air manque, que la coque cède ou qu'une bête charge. La déchirure du portail bat au même
   * rythme. Et quand tout s'arrête, il ne retombe plus.
   */
  heart(dt) {
    const S = this.survival;
    if (S.dead) {
      if (!this.flat) { this.flat = true; this.sound.sonarFlat(); }
      return;
    }
    this.flat = false;
    const threat = this.creatures.threat + this.wildlife.threat + this.guardian.threat > 0 ? 0.6 : 0;
    const stress = Math.min(1, Math.max(threat, 1 - S.oxygenRatio / 0.3, (0.5 - S.hullRatio) * 1.4, 0));
    this.bpm = (this.bpm ?? 56) + (56 + 64 * stress - (this.bpm ?? 56)) * Math.min(1, dt * 0.8);
    this.beatPhase = (this.beatPhase ?? 0) + (dt * this.bpm) / 60;
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      if (!this.autopilot) this.sound.sonarBeep(0.8 + stress * 0.6);
      // Près de la déchirure, le battement devient physique : coup sourd, onde sur la plaine, secousse
      if (this.riftNear > 0.02 && this.portal.open > 0.05) {
        this.portalFx.beat();
        this.sound.heartbeat(0.5 + this.riftNear * 1.6);
        this.shake(0.03 + this.riftNear * 0.14);
      }
    }
    // le tracé de la déchirure a son pic à la phase 0,3 : on le cale sur le bip
    this.portal.externalBeat = true;
    this.portal.setBeat((this.beatPhase + 0.3) % 1);
  }

  /**
   * Écho (sonar volumétrique seulement) : une onde part du sous-marin et dessine en points, à travers
   * l'obscurité, la vraie forme de ce qu'elle touche — rochers, épaves, bêtes. L'image tient quelques secondes.
   */
  echo() {
    if (!stats.sonar3d) return this.hud.notice('Écho : il faut le sonar volumétrique');
    if (!gpuMode.active) return this.hud.notice('Écho indisponible avec ce rendu');
    if (this.echoAge != null && this.echoAge < ECHO.COOLDOWN) return;
    this.echoAge = 0;
    this.sound.sonarBeep(2.2);
    this.sound.sonarEcho?.();
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
      this.shake(0.05 + stress * 0.15);
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
    this.pulseCooldown = Math.max(0, this.pulseCooldown - dt);
    this.pulseFx = Math.max(0, this.pulseFx - dt * 0.9);
    if (this.echoAge != null && (this.echoAge += dt) > ECHO.DURATION) this.echoAge = null;
    hud.setPulse?.(1 - this.pulseCooldown / DEFENSE.COOLDOWN);
    // Pendant une cinématique, ni l'air ni la coque ne s'épuisent
    if (!this.autopilot) survival.update(dt, sub);
    sub.update(dt, time, survival.dead || this.autopilot ? this.noInput : this.input);
    if (this.autopilot) this.autopilot(dt);
    this.claw.update(dt, time);
    if (this.view === 'first') {
      this.cockpitCam.update(dt, sub, this.pointer);
      // Instruments du poste de pilotage
      sub.cockpit3d.update(dt, {
        depth: sub.depth,
        crushDepth: survival.stats.crushDepth,
        oxygen: survival.oxygenRatio,
        hull: survival.hullRatio,
        heading: ((((-sub.yaw * 180) / Math.PI) % 360) + 360) % 360,
        throttle: sub.throttle,
        time,
      });
    } else follow.update(dt, sub);
    const camera = this.camera;
    updateTileCulling(camera.position);

    // Vue cockpit : on vise au centre de l'écran ; vue extérieure : sous le curseur
    const aimPointer = this.view === 'first' ? CENTER_POINTER : this.pointer;
    this.aim.update(aimPointer, this.claw.root);
    const canGrab = this.view === 'first';
    this.pickups.setHighlighted(canGrab && !this.claw.busy && this.aim.inRange ? this.aim.pickup : null);
    this.pickups.update(time, camera.position);
    hud.updateReticle(aimPointer, this.aim, this.claw.busy, this.hold.full, canGrab);
    this.captureFx.update(dt, camera);

    this.ambience.update(this.cameraDepth, sub.position, time);
    // Plus on approche de la source, plus l'eau verdit et l'image ondule
    const rad = survival.radiation;
    if (rad > 0) {
      scene.fog.color.lerp(this.radGreen, rad * 0.6);
      scene.background.copy(scene.fog.color);
    }
    this.pixel.setDistortion(rad * 1.2, time);
    this.radiationSource.update(time, camera.position);
    this.survivalEffects(dt);
    hud.updateSurvival(survival, sub.depth);
    sub.setBeamVisibility(this.ambience.state.beam);

    this.decor.update(time);
    this._nose.copy(sub.forward).multiplyScalar(5).add(sub.position);
    this.wake.update(dt, time, sub.position, sub.speed, this._nose);
    sub.getLightRay(this._lightPos, this._lightDir);
    // Lumière volumétrique (rayons du soleil, faisceau du phare) : calculée par le renderer
    const rp = this.raysParams;
    rp.time = time;
    rp.sun = this.ambience.state.sun * (survival.dead ? 0 : 1);
    rp.sunColor.copy(this.ambience.state.fogColor).multiplyScalar(2.2).addScalar(0.08);
    rp.density = scene.fog.density;
    rp.spotPos.copy(this._lightPos);
    rp.spotDir.copy(this._lightDir);
    rp.spotCos = Math.cos(sub.spot.angle);
    // Près de la surface, il fait jour : le phare compte peu ; dans le noir, il devient essentiel
    const beamK = 0.3 + 0.7 * this.ambience.state.beam;
    // Coque abîmée : le phare grésille, puis a de vraies coupures quand elle est en ruine
    let lamp = 1;
    const hr = survival.hullRatio;
    if (hr < 0.5 && !survival.dead) {
      const n = Math.sin(time * 31) * Math.sin(time * 7.3) + Math.sin(time * 2.1 + Math.sin(time * 0.37) * 4);
      lamp = n > (hr < 0.25 ? -0.35 : -1.25) ? 0.8 + 0.2 * Math.sin(time * 53) : 0.04;
    }
    sub.spot.intensity = stats.lightIntensity * 1.8 * beamK * lamp;
    sub.spot.distance = stats.lightRange * 1.3;
    rp.spot = beamK * (stats.lightIntensity / 85) * lamp;
    this.pixel.setRays(rp);
    this.snow.update(time, camera.position, this._lightPos, this._lightDir, this.ambience.state.ambient, rad);

    // Turbines : un léger ronronnement qui suit la poussée
    if (survival.dead || this.autopilot) sound.stopEngine();
    else sound.setEngine(sub.throttle, sub.lift);

    sub.getPropellerPosition(this._propPos);
    this.bubbles.update(dt, this._propPos, Math.abs(sub.throttle) * 22 + 0.5);

    this.heart(dt);
    hud.update(sub.depth, this.input);
    // Le portail : bourdonnement qui monte à l'approche, et invite quand on est devant
    const portalDist = sub.position.distanceTo(this.portal.center);
    // Effets de la déchirure : de plus en plus forts à l'approche (0 à 300 m … 1 à 25 m)
    this.riftNear = Math.max(0, Math.min(1, (300 - portalDist) / 275));
    if (this.portalFx.update(dt, time, this.riftNear) && this.riftNear > 0.15) sound.crackle?.(this.riftNear);
    sound.setRift?.(this.riftNear * this.portal.open, this.bpm ?? 56);
    this.portal.update(time, this.camera.position, pointScale.value);
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
      this.wildlife.calm = this.creatures.calm;
      const hit = this.wildlife.update(dt, time, sub, zone.id);
      if (hit > 0 && !this.autopilot) survival.damage(hit, 'creature');
      this.guardian.calm = this.creatures.calm;
      const gd = this.guardian.update(dt, time, sub, !!this.autopilot);
      if (gd > 0 && !this.autopilot) survival.damage(gd, 'creature');
    }

    // --- Radar : objets, fragments, créatures, bancs, épaves dans le rayon du sonar
    if (!survival.dead) this.radar.update(dt, sub, this.gatherContacts(), this.decor.colliders, this.movers());
    sound.setSonar(!survival.dead);

    // --- Le plongeur pâle, et les voix de la chambre près de la faille
    if (!survival.dead && !this.autopilot) {
      const frags = this.pickups.fragments;
      this.paleDiver.update(dt, time, sub, frags.map((f) => f.object.position), 8 - frags.length);
      this.voiceTimer -= dt;
      if (this.voiceTimer <= 0 && this.riftNear > 0.25 && this.portal.open > 0.5) {
        const pool = voicesData.voices.filter((v) => v.near <= this.riftNear && v.text !== this.lastVoice);
        if (pool.length) {
          // les plus proches de la surface de l'eau… et du réveil, en dernier
          const v = pool[Math.floor(Math.pow(Math.random(), 0.6) * pool.length)];
          this.lastVoice = v.text;
          hud.voice(v.text);
          sound.whisper(0.3 + this.riftNear * 0.5);
        }
        this.voiceTimer = 22 - this.riftNear * 12 + Math.random() * 6;
      }
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
