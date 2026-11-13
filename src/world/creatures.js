import * as THREE from 'three';
import creaturesData from '../config/creatures.json';
import { WORLD } from '../config/settings.js';
import { damp } from '../core/utils.js';
import { getFloorHeight } from './seabed.js';
import { createEel, createLantern, createJelly, createFishGeometry, FISH_SPECIES } from './creatureModels.js';

/**
 * Faune : bancs de poissons ordinaires près de la surface,
 * créatures mutées et agressives en profondeur.
 * Les créatures apparaissent hors de vue autour du sous-marin selon la zone,
 * et disparaissent quand elles sont trop loin.
 */
const FISH = creaturesData.fish;
const TYPES = creaturesData.mutants;
const MAX_SCHOOLS = 8;
const SPAWN_MIN = 55, SPAWN_MAX = 80, DESPAWN = 135;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Position d'apparition : autour du sous-marin, dans l'eau, au-dessus du fond.
 * On essaie plusieurs directions pour rester à peu près à la profondeur du sous-marin
 * (sinon, dans le canyon, on tomberait sur le plateau, très au-dessus).
 */
function spawnPoint(sub, out, minY = -1e9, maxY = -3) {
  let best = null;
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const x = THREE.MathUtils.clamp(sub.position.x + Math.cos(a) * d, WORLD.BOUNDS.minX, WORLD.BOUNDS.maxX);
    const z = THREE.MathUtils.clamp(sub.position.z + Math.sin(a) * d, WORLD.BOUNDS.minZ, WORLD.BOUNDS.maxZ);
    const floor = getFloorHeight(x, z);
    const y = THREE.MathUtils.clamp(sub.position.y + (Math.random() - 0.5) * 16, Math.max(floor + 3, minY), maxY);
    const gap = Math.abs(y - sub.position.y);
    if (!best || gap < best.gap) best = { x, y, z, gap };
    if (gap < 12) break;
  }
  return out.set(best.x, best.y, best.z);
}

/* ================================================================ Bancs de poissons */

class FishSchools {
  constructor(scene) {
    const uniforms = (this.uniforms = { uTime: { value: 0 } });
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    /*
     * Nage : une onde part de la tête et grandit en descendant vers la queue
     * (la tête bouge à peine, la queue bat). aU = 0 à la tête, 1 au bout de la queue.
     * aGlow : yeux, pustules et rayures irradiées qui luisent dans le noir.
     */
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          attribute float aU;
          attribute float aGlow;
          varying float vGlow;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vGlow = aGlow;
          float ph = dot(instanceMatrix[3].xyz, vec3(1.3, 0.7, 1.1));
          float amp = 0.012 + 0.16 * aU * aU;
          transformed.x += sin(uTime * 9.0 + ph - aU * 5.0) * amp;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.4;`
        );
    };
    // Un banc = une espèce ; les espèces disponibles dépendent de la zone (voir zones.json)
    this.geoCache = {};
    this.material = mat;
    this.scene = scene;
    this.schools = [];
    for (let s = 0; s < MAX_SCHOOLS; s++) {
      const id = 'sardine';
      this.geoCache[id] ??= createFishGeometry(id);
      const mesh = new THREE.InstancedMesh(this.geoCache[id], mat, FISH.perSchool);
      mesh.frustumCulled = false;
      mesh.visible = false;
      const c = new THREE.Color();
      for (let i = 0; i < FISH.perSchool; i++) mesh.setColorAt(i, c.setScalar(0.85 + Math.random() * 0.3));
      scene.add(mesh);
      const fish = [];
      for (let i = 0; i < FISH.perSchool; i++) {
        fish.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), offset: new THREE.Vector3().randomDirection().multiplyScalar(1 + Math.random() * 3) });
      }
      this.schools.push({ active: false, species: id, mesh, center: new THREE.Vector3(), target: new THREE.Vector3(), fish });
    }
  }

  /** Change l'espèce d'un banc (à sa réapparition) */
  setSpecies(school, id) {
    if (school.species === id) return;
    school.species = id;
    this.geoCache[id] ??= createFishGeometry(id);
    school.mesh.geometry = this.geoCache[id];
  }

  update(dt, time, sub, wanted, speciesList = ['sardine']) {
    this.uniforms.uTime.value = time;
    for (let s = 0; s < MAX_SCHOOLS; s++) {
      const school = this.schools[s];
      const shouldLive = s < wanted;
      const far = school.active && school.center.distanceTo(sub.position) > DESPAWN;
      if (shouldLive && (!school.active || far)) {
        // (Ré)apparition hors de vue, avec une espèce de la zone
        this.setSpecies(school, speciesList[Math.floor(Math.random() * speciesList.length)]);
        spawnPoint(sub, school.center, -1300, -3);
        school.target.copy(school.center);
        for (const f of school.fish) {
          f.pos.copy(school.center).add(f.offset);
          f.vel.set(0, 0, 0);
        }
        school.active = true;
      } else if (!shouldLive && school.active && far) {
        school.active = false;
      }

      school.mesh.visible = school.active;
      if (school.active) {
        let idx = 0;
        // Le banc erre vers une cible qui change de temps en temps
        if (school.center.distanceTo(school.target) < 3) {
          spawnPoint({ position: school.center }, school.target, -1300, -3);
          school.target.lerp(school.center, 0.6);
        }
        _v.subVectors(school.target, school.center).normalize().multiplyScalar(FISH.speed * 0.6 * dt);
        school.center.add(_v);

        for (const f of school.fish) {
          // Cohésion : chaque poisson vise sa place dans le banc
          _v.copy(school.center).add(f.offset).sub(f.pos);
          const desired = _v.multiplyScalar(1.2).clampLength(0, FISH.speed);
          // Fuite devant le sous-marin
          const dx = f.pos.x - sub.position.x, dy = f.pos.y - sub.position.y, dz = f.pos.z - sub.position.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < FISH.fleeRadius * FISH.fleeRadius) {
            const d = Math.sqrt(d2) + 0.01;
            desired.set(dx / d, dy / d * 0.4, dz / d).multiplyScalar(FISH.fleeSpeed);
          }
          f.vel.lerp(desired, damp(3, dt));
          f.pos.addScaledVector(f.vel, dt);
          f.pos.y = Math.min(f.pos.y, -1.5);
          // Orientation dans le sens de la nage
          if (f.vel.lengthSq() > 0.01) _m.lookAt(f.vel, _v.set(0, 0, 0), UP);
          _m.setPosition(f.pos);
          school.mesh.setMatrixAt(idx++, _m);
        }
        school.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

/* ================================================================ Créatures mutées */

class Mutant {
  constructor(type, scene) {
    this.type = type;
    this.cfg = TYPES[type];
    this.model = type === 'eel' ? createEel() : type === 'lantern' ? createLantern() : createJelly();
    this.object = this.model.root;
    scene.add(this.object);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.home = new THREE.Vector3();
    this.wander = new THREE.Vector3();
    this.state = 'wander';
    this.timer = 0;
    this.cooldown = 0;
    this.phase = Math.random() * 10;
  }

  place(p) {
    this.pos.copy(p);
    this.home.copy(p);
    this.wander.copy(p);
    this.vel.set(0, 0, 0);
    this.state = 'wander';
    this.cooldown = 2;
    if (this.model.segments) for (const s of this.model.segments) s.position.copy(p);
  }

  dispose(scene) {
    scene.remove(this.object);
    this.object.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  }

  /**
   * @returns {number} dégâts infligés ce tour (0 sinon)
   */
  update(dt, time, sub, events) {
    const cfg = this.cfg;
    const toSub = _v.subVectors(sub.position, this.pos);
    const dist = toSub.length();
    this.cooldown -= dt;
    let desiredSpeed = cfg.speed;
    const desired = new THREE.Vector3();

    if (this.state === 'wander') {
      if (this.pos.distanceTo(this.wander) < 3) {
        // Elles rôdent : si le sous-marin est dans les parages, elles s'en rapprochent peu à peu
        const base = dist < 90 ? sub.position : this.home;
        this.wander.copy(base).add(new THREE.Vector3().randomDirection().multiplyScalar(dist < 90 ? 12 : 18));
      }
      desired.subVectors(this.wander, this.pos).normalize();
      if (dist < cfg.aggroRadius && this.cooldown <= 0) {
        this.state = 'charge';
        this.timer = 0;
        if (!cfg.contact) events.growl?.(this);
      }
    } else if (this.state === 'charge') {
      this.timer += dt;
      desired.copy(toSub).normalize();
      desiredSpeed = cfg.chargeSpeed;
      if (dist > cfg.aggroRadius * 1.8 || this.timer > 9) this.state = 'wander';
    } else if (this.state === 'retreat') {
      this.timer -= dt;
      desired.copy(toSub).normalize().negate();
      desiredSpeed = cfg.chargeSpeed * 0.7;
      if (this.timer <= 0) {
        this.state = 'wander';
        this.cooldown = cfg.cooldown;
        this.home.copy(this.pos);
      }
    }

    // Pilotage doux
    desired.multiplyScalar(desiredSpeed);
    this.vel.lerp(desired, damp(this.state === 'charge' ? 2.5 : 1.2, dt));
    this.pos.addScaledVector(this.vel, dt);
    const floor = getFloorHeight(this.pos.x, this.pos.z);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, floor + 1.5, -3);

    // Contact / morsure
    let damage = 0;
    const reach = cfg.biteRadius + 1.6;
    if (dist < reach) {
      if (cfg.contact) {
        damage = cfg.damage * dt; // brûlure continue
      } else if (this.state === 'charge') {
        damage = cfg.damage;
        this.state = 'retreat';
        this.timer = cfg.retreatTime;
        events.bite?.(this, toSub.clone().normalize());
      }
    }

    this.animate(dt, time);
    return damage;
  }

  animate(dt, time) {
    const o = this.object;
    const m = this.model;
    const t = time + this.phase;
    const charging = this.state === 'charge';
    const k = Math.min(1, dt * 6);
    if (this.type === 'eel') {
      // La tête mène, les segments suivent en chaîne
      m.head.position.copy(this.pos);
      if (this.vel.lengthSq() > 0.01) m.head.lookAt(_v.copy(this.pos).add(this.vel));
      const side = new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize().multiplyScalar(Math.sin(t * 6) * 0.25);
      m.head.position.add(side);
      // La gueule s'ouvre grand quand elle charge
      const jawTarget = charging ? 0.55 : 0.08 + Math.sin(t * 1.7) * 0.05;
      m.jaw.rotation.x += (jawTarget - m.jaw.rotation.x) * k;
      let prev = m.head.position;
      for (const seg of m.segments) {
        _v.subVectors(seg.position, prev);
        const len = _v.length() || 1;
        seg.position.copy(prev).addScaledVector(_v, m.spacing / len);
        seg.lookAt(prev);
        prev = seg.position;
      }
    } else if (this.type === 'lantern') {
      o.position.copy(this.pos);
      if (this.vel.lengthSq() > 0.01) o.lookAt(_v.copy(this.pos).add(this.vel));
      m.body.rotation.z = Math.sin(t * 1.3) * 0.08;
      m.tail.rotation.y = Math.sin(t * (charging ? 9 : 3)) * 0.5;
      m.pect.forEach((f, i) => (f.rotation.z = Math.sin(t * 4 + i * Math.PI) * 0.3));
      const jawTarget = charging ? 0.7 : 0.15 + Math.sin(t * 0.9) * 0.08;
      m.jaw.rotation.x += (jawTarget - m.jaw.rotation.x) * k;
      m.stalk.rotation.z = Math.sin(t * 1.1) * 0.25;
      // Les leurres clignotent chacun à leur rythme
      m.lures.forEach((h, i) => {
        const flick = 0.75 + Math.sin(t * (7 + i * 2.3)) * 0.15 + (Math.random() < 0.02 ? -0.5 : 0);
        h.material.opacity = 0.5 * flick;
      });
    } else {
      o.position.copy(this.pos);
      const pulse = Math.sin(t * 1.6);
      m.bell.scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
      // Filaments : chaque tronçon ondule avec un léger retard → mouvement de vague
      m.tendrils.forEach((p, i) => {
        p.rotation.x = Math.sin(t * 1.2 + i * 0.7) * 0.22;
        p.rotation.z = Math.cos(t * 1.0 + i * 0.5) * 0.22;
      });
      m.halo.material.opacity = 0.35 + pulse * 0.1;
      // Les yeux de la cloche roulent dans tous les sens
      m.innerEyes.forEach((e, i) => (e.rotation.z = Math.sin(t * 0.7 + i * 1.9) * 0.8));
    }
  }
}

/* ================================================================ Gestionnaire */

export class Creatures {
  /**
   * @param {object} events growl(mutant), bite(mutant, direction) : effets côté plongée
   */
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.fish = new FishSchools(scene);
    this.mutants = [];
    this.calm = false; // portail refermé : les bêtes s'apaisent et s'en vont
  }

  /** Retire toutes les créatures (nouvelle plongée) */
  clear() {
    this.calm = false;
    for (const m of this.mutants) m.dispose(this.scene);
    this.mutants = [];
    for (const s of this.fish.schools) s.active = false;
  }

  /**
   * @returns {number} dégâts subis par le sous-marin ce tour
   */
  update(dt, time, sub, zone) {
    this.fish.update(dt, time, sub, zone.fishSchools ?? 0, zone.fishSpecies);

    // Retire les créatures trop lointaines
    for (let i = this.mutants.length - 1; i >= 0; i--) {
      if (this.mutants[i].pos.distanceTo(sub.position) > DESPAWN) {
        this.mutants[i].dispose(this.scene);
        this.mutants.splice(i, 1);
      }
    }
    if (this.calm) {
      // Elles s'éloignent, apaisées, sans plus attaquer
      for (const m of this.mutants) {
        m.state = 'retreat';
        m.timer = 99;
        m.update(dt, time, sub, {});
      }
      return 0;
    }
    // Complète la population de la zone, une créature à la fois
    for (const [type, wanted] of Object.entries(zone.mutants ?? {})) {
      const have = this.mutants.filter((m) => m.type === type).length;
      if (have < wanted && Math.random() < dt * 0.5) {
        const m = new Mutant(type, this.scene);
        m.place(spawnPoint(sub, new THREE.Vector3()));
        this.mutants.push(m);
      }
    }

    let damage = 0;
    for (const m of this.mutants) damage += m.update(dt, time, sub, this.events);
    return damage;
  }
}
