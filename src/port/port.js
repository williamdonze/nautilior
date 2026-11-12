import * as THREE from 'three';
import layout from './layout.json';
import { buildPort } from './portBuilder.js';
import { Player } from './player.js';
import { createCharacter, LOOKS } from './characters.js';
import { NPCS } from '../story/dialogue.js';
import { damp } from '../core/utils.js';

/**
 * Scène du port, à la surface : brume, ciel gris, lumière froide.
 * Le joueur s'y promène à pied ; E pour parler ou interagir.
 */
const INTERACT_RADIUS = 2.4;
const CAMERA_OFFSET = new THREE.Vector3(0, 7.5, 11);

export class Port {
  constructor({ sound }) {
    this.sound = sound;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#5f6564');
    this.scene.fog = new THREE.FogExp2('#5f6564', 0.03);

    // Lumière froide et diffuse d'un ciel couvert
    this.scene.add(new THREE.HemisphereLight('#a8bdb2', '#26292b', 1.5));
    const sun = new THREE.DirectionalLight('#ccd8cc', 0.9);
    sun.position.set(-20, 30, 15);
    this.scene.add(sun);

    this.world = buildPort();
    this.scene.add(this.world.group);

    this.player = new Player(this.scene);

    // Personnages
    this.npcs = layout.npcs.map((n) => {
      const character = createCharacter(LOOKS[n.id]);
      character.object.position.set(n.x, 0, n.z);
      character.object.rotation.y = n.yaw;
      this.scene.add(character.object);
      return { ...n, character, yawNow: n.yaw };
    });

    // Points d'interaction
    this.interactables = [
      ...this.npcs.map((n) => ({ id: n.id, kind: 'npc', npcId: n.id, x: n.x, z: n.z, label: `Parler ${talkLabel(NPCS[n.id].name)}` })),
      ...layout.interactables,
      ...this.world.interactables,
    ];
    this.circles = this.npcs.map((n) => ({ x: n.x, z: n.z, r: 0.45 }));
    this.focus = null; // point d'interaction le plus proche

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.lookAt = new THREE.Vector3();
    this.cine = null; // plan de cinématique en cours
    this.crowd = [];
  }

  /* ------------------------------------------------------------ Cinématiques */

  /**
   * Mouvement de caméra scripté (interpolation douce).
   * @returns {Promise} résolue à la fin du mouvement
   */
  cameraMove(from, to, lookFrom, lookTo, duration) {
    return new Promise((resolve) => {
      this.cine = { t: 0, duration, from: v(from), to: v(to), lookFrom: v(lookFrom), lookTo: v(lookTo), resolve };
    });
  }

  /** Les trois villageois réunis sur le quai, face au joueur */
  gatherVillagers() {
    const spots = { mechanic: [9.5, -1.5], doctor: [12, -2.2], merchant: [14.5, -1.5] };
    for (const n of this.npcs) {
      const [x, z] = spots[n.id];
      n.x = x;
      n.z = z;
      n.yaw = 0;
      n.character.object.position.set(x, 0, z);
    }
    this.circles = this.npcs.map((n) => ({ x: n.x, z: n.z, r: 0.45 }));
  }

  /** Dissolution du village des morts (0 → 1) : brume blanche, silhouettes qui s'effacent */
  dissolve(t) {
    const fogCol = new THREE.Color('#5f6564').lerp(new THREE.Color('#e8ece2'), t);
    this.scene.fog.color.copy(fogCol);
    this.scene.background.copy(fogCol);
    this.scene.fog.density = 0.03 + t * t * 0.35;
    for (const n of this.npcs) {
      const o = n.character.object;
      o.scale.set(1 - t * 0.6, Math.max(0.01, 1 - t), 1 - t * 0.6);
      o.position.y = -t * 0.8;
    }
  }

  /** Le vrai Port-Kerys : volets ouverts, fenêtres éclairées, ciel plus clair, foule sur le quai */
  makeAlive() {
    const T = this.world.tagged;
    T.shutters.forEach((m) => (m.visible = false));
    T.darkWindows.forEach((m) => (m.material = this.world.glowMaterial));
    T.boats.forEach((m) => (m.visible = false));
    this.scene.background.set('#9a9a94');
    this.scene.fog.color.set('#9a9a94');
    this.scene.fog.density = 0.018;
    this.scene.traverse((o) => {
      if (o.isHemisphereLight) o.intensity = 2.4;
      if (o.isDirectionalLight) o.intensity = 1.8;
    });
    // Les morts ne sont plus là
    for (const n of this.npcs) n.character.object.visible = false;
    // La foule, en arc de cercle autour du quai
    const coats = ['#2f4a66', '#63321b', '#cdb57c', '#5b8fc0', '#a8bdb2', '#8a4f28', '#3c7048', '#7a5a26'];
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (0.15 + (i / 21) * 0.7);
      const r = 5 + (i % 3) * 1.6;
      const c = createCharacter({
        coat: coats[i % coats.length],
        legs: i % 2 ? '#26292b' : '#2f4a66',
        hat: i % 4 === 0 ? 'cap' : i % 5 === 0 ? 'scarf' : null,
        hatColor: coats[(i + 3) % coats.length],
        long: i % 3 === 0,
        hair: ['#3e2114', '#878a85', '#22140d', '#7d6f48'][i % 4],
      });
      const x = 12 + Math.cos(a) * r * 1.6;
      const z = 3.5 - Math.sin(a) * r;
      c.object.position.set(x, 0, z);
      c.object.rotation.y = Math.atan2(12 - x, 4.5 - z);
      this.scene.add(c.object);
      this.crowd.push(c);
    }
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Place le joueur à un point d'apparition ('hospital' ou 'quay') */
  enter(spotId) {
    const s = layout.spawns[spotId] ?? layout.spawns.quay;
    this.player.place(s.x, s.z, s.yaw);
    this.snapCamera();
  }

  snapCamera() {
    this.camera.position.copy(this.player.position).add(CAMERA_OFFSET);
    this.lookAt.copy(this.player.position).add({ x: 0, y: 1.2, z: -2 });
    this.camera.lookAt(this.lookAt);
  }

  /**
   * @param {boolean} controls le joueur peut-il bouger (faux pendant un dialogue)
   */
  update(dt, time, input, controls) {
    const noInput = { axis: () => 0 };
    this.player.update(dt, time, controls ? input : noInput, this.world.colliders, this.circles, layout.bounds);
    if (this.player.character.stepped() && this.player.speed > 0.5) this.sound.step();
    for (const c of this.crowd) c.animate(dt, 0, time + c.object.position.x);

    const p = this.player.position;
    if (this.cine) {
      // Cinématique : la caméra suit le script
      const c = this.cine;
      c.t = Math.min(1, c.t + dt / c.duration);
      const e = c.t * c.t * (3 - 2 * c.t);
      this.camera.position.lerpVectors(c.from, c.to, e);
      this.lookAt.lerpVectors(c.lookFrom, c.lookTo, e);
      this.camera.lookAt(this.lookAt);
      if (c.t >= 1) {
        this.cine = null;
        c.resolve();
      }
    } else if (!this.holdCamera) {
      // Caméra : suit le joueur en douceur
      const desired = new THREE.Vector3().copy(p).add(CAMERA_OFFSET);
      this.camera.position.lerp(desired, damp(4, dt));
      this.lookAt.lerp(new THREE.Vector3(p.x, 1.2, p.z - 2), damp(6, dt));
      this.camera.lookAt(this.lookAt);
    }

    // Les personnages se tournent vers le joueur quand il approche
    for (const n of this.npcs) {
      const dx = p.x - n.x, dz = p.z - n.z;
      const near = dx * dx + dz * dz < 36;
      const target = near ? Math.atan2(dx, dz) : n.yaw;
      let diff = Math.atan2(Math.sin(target - n.yawNow), Math.cos(target - n.yawNow));
      n.yawNow += diff * damp(3, dt);
      n.character.object.rotation.y = n.yawNow;
      n.character.animate(dt, 0, time + n.x);
    }

    // Point d'interaction le plus proche
    let best = null, bestD = INTERACT_RADIUS;
    for (const it of this.interactables) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d < bestD) { bestD = d; best = it; }
    }
    this.focus = best;

    this.world.update(time);
  }
}

const v = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

/** « Parler au médecin », « Parler à la marchande »… */
function talkLabel(name) {
  if (name.startsWith('Le ')) return `au ${name.slice(3).toLowerCase()}`;
  if (name.startsWith('La ')) return `à la ${name.slice(3).toLowerCase()}`;
  return `à ${name}`;
}
