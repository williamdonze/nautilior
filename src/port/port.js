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

    // Caméra : suit le joueur en douceur
    const p = this.player.position;
    const desired = new THREE.Vector3().copy(p).add(CAMERA_OFFSET);
    this.camera.position.lerp(desired, damp(4, dt));
    this.lookAt.lerp(new THREE.Vector3(p.x, 1.2, p.z - 2), damp(6, dt));
    this.camera.lookAt(this.lookAt);

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

/** « Parler au médecin », « Parler à la marchande »… */
function talkLabel(name) {
  if (name.startsWith('Le ')) return `au ${name.slice(3).toLowerCase()}`;
  if (name.startsWith('La ')) return `à la ${name.slice(3).toLowerCase()}`;
  return `à ${name}`;
}
