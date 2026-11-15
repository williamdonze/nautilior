import * as THREE from 'three';
import { SUBMARINE, WORLD, RADIATION } from '../config/settings.js';
import { clamp, damp, lerp } from '../core/utils.js';
import { getFloorHeight } from '../world/seabed.js';
import { createSubmarineModel, spinPropellers } from './subModel.js';
import { createCockpit } from './cockpit.js';
import { createBeam } from './beam.js';
import { stats } from './stats.js';

/**
 * Le Nautiliar : modèle + pilotage avec inertie + phare.
 * Physique volontairement simple (pas besoin de Rapier pour l'instant) :
 * accélération → vitesse → position, avec freinage exponentiel (traînée de l'eau).
 */
export class Submarine {
  constructor(scene, colliders = []) {
    // root : position et cap ; body : tangage et roulis ; hull : le modèle (change avec la coque)
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.hull = new THREE.Group();
    this.object.add(this.body);
    this.body.add(this.hull);
    this.colliders = colliders;
    scene.add(this.object);
    this.clawRoot = new THREE.Vector3();
    this.clawRest = new THREE.Vector3();
    this.cockpit = new THREE.Vector3();
    this.tailPoint = new THREE.Object3D(); // sortie des bulles
    this.body.add(this.tailPoint);
    this.lift = 0; // commande de montée/descente lissée (rotors verticaux)

    // État physique
    this.position = this.object.position;
    this.position.set(SUBMARINE.SPAWN.x, SUBMARINE.SPAWN.y, SUBMARINE.SPAWN.z);
    this.velocity = new THREE.Vector3();
    this.yaw = SUBMARINE.SPAWN.yaw;
    this.yawVelocity = 0;
    this.throttle = 0; // poussée lissée (-1..1), sert à l'hélice et aux bulles

    // Inclinaisons visuelles
    this.roll = 0;
    this.pitch = 0;

    // --- Phare : principale source de lumière en profondeur
    this.spot = new THREE.SpotLight('#efe3bb', 55, 90, 0.5, 0.5, 0.8);
    this.spotTarget = new THREE.Object3D();
    this.spotBase = new THREE.Vector3(0, -9, 24); // incliné vers le fond
    this.spotTarget.position.copy(this.spotBase);
    this.body.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;

    this.beam = createBeam();
    this.body.add(this.beam.mesh);

    // Lueur de cabine : éclaire le poste de pilotage (et laisse deviner la coque dans le noir)
    this.cabinLight = new THREE.PointLight('#e8d8b0', 5, 4, 1.2);
    this.body.add(this.cabinLight);
    // Lumière d'appoint froide au-dessus de la coque : en vue extérieure, on devine le sous-marin dans le noir
    this.fillLight = new THREE.PointLight('#8fb8c8', 9, 16, 1.4);
    this.fillLight.position.set(1.5, 4.5, -2);
    this.body.add(this.fillLight);
    // Halo de lumière autour du sous-marin (projecteurs de flanc) : grandit avec le phare
    this.auraLight = new THREE.PointLight('#e8e0c8', 4, 12, 1.2);
    this.auraLight.position.set(0, -1.6, 2.5);
    this.body.add(this.auraLight);
    this.cockpitGroup = new THREE.Group(); // poste de pilotage 3D (vue à la 1re personne)
    this.body.add(this.cockpitGroup);

    // Vecteurs de travail
    this._forward = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._prev = new THREE.Vector3();

    this.setModel(0);
  }

  /** Remplace le modèle 3D (niveau de coque) ; le phare, le bras et le poste suivent */
  setModel(level) {
    if (this.model?.level === level) return;
    this.hull.clear();
    const model = createSubmarineModel(level);
    this.model = model;
    this.hull.add(model.group);
    this.spot.position.copy(model.lampPosition);
    this.beam.mesh.position.copy(model.lampPosition);
    this.aimLight(0, 0);
    this.cockpit.copy(model.cockpit);
    // Le bras sort sous le hublot, devant le poste de pilotage (visible depuis le cockpit)
    this.clawRoot.copy(model.cockpit).add({ x: 0, y: -0.95, z: 1.0 });
    this.clawRest.copy(this.clawRoot).add({ x: 0, y: -0.55, z: 0.9 });
    this.tailPoint.position.copy(model.tail);
    // Poste de pilotage propre à ce sous-marin
    this.cockpitGroup.clear();
    this.cockpit3d = createCockpit(level);
    this.cockpitGroup.add(this.cockpit3d.group);
    this.cockpitGroup.position.copy(model.cockpit);
    this.cabinLight.position.copy(model.cockpit).add({ x: 0.1, y: 0.55, z: 0.1 });
    model.group.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    this.setHullVisible(this.hullVisible ?? true);
  }

  /** Coque visible ou non (masquée en vue à la 1re personne, où l'on voit le poste de pilotage) */
  setHullVisible(v) {
    this.hullVisible = v;
    this.hull.traverse((o) => {
      if (o.isMesh) o.visible = v;
    });
    this.cockpitGroup.visible = !v;
    this.fillLight.visible = v;
    this.beam.mesh.visible = v && this.beam.mesh.visible;
  }

  /**
   * Oriente le phare (et son faisceau) : il suit le regard en vue à la 1re personne.
   * @param {number} yaw décalage horizontal (rad), @param {number} pitch décalage vertical (rad)
   */
  aimLight(yaw, pitch) {
    const t = this.spotTarget.position.copy(this.spotBase).sub(this.spot.position);
    t.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    t.add(this.spot.position);
    const dir = this._tmp.copy(t).sub(this.spot.position).normalize();
    this.beam.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }

  /** Direction avant dans le plan horizontal */
  get forward() {
    return this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Vitesse horizontale (m/s) */
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Profondeur en mètres (0 à la surface) */
  get depth() {
    return Math.max(0, WORLD.SURFACE_Y - this.position.y);
  }

  /** Remet le sous-marin à un point donné, immobile */
  teleport(x, y, z, yaw) {
    this.position.set(x, y, z);
    this._prev.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.yawVelocity = 0;
    this.throttle = 0;
  }

  update(dt, time, input) {
    const S = SUBMARINE;
    const thrustInput = input.axis('backward', 'forward');
    const turnInput = input.axis('right', 'left');
    const liftInput = input.axis('down', 'up');

    // --- Rotation avec inertie
    this.yawVelocity += turnInput * S.TURN_ACCEL * dt;
    this.yawVelocity *= Math.exp(-S.TURN_DRAG * dt);
    this.yaw += this.yawVelocity * dt;

    // --- Poussée
    const fwd = this.forward;
    // Les coques améliorées sont plus puissantes (stats.speedMul / liftMul, voir upgrades.json)
    const accel = (thrustInput >= 0 ? S.FORWARD_ACCEL : S.REVERSE_ACCEL) * (stats.speedMul ?? 1);
    this.velocity.addScaledVector(fwd, thrustInput * accel * dt);
    this.velocity.y += liftInput * S.VERTICAL_ACCEL * (stats.liftMul ?? 1) * dt;

    // --- Traînée : forte sur les côtés (quille), faible dans l'axe → glisse naturelle
    this._side.set(fwd.z, 0, -fwd.x);
    const vf = this.velocity.dot(fwd);
    const vs = this.velocity.dot(this._side);
    const nf = vf * Math.exp(-S.FORWARD_DRAG * dt);
    const ns = vs * Math.exp(-S.SIDE_DRAG * dt);
    const vy = this.velocity.y * Math.exp(-S.VERTICAL_DRAG * dt);
    this.velocity.copy(fwd).multiplyScalar(nf).addScaledVector(this._side, ns);
    this.velocity.y = vy;

    // --- Intégration
    this._prev.copy(this.position);
    this.contactTimer = (this.contactTimer ?? 0) - dt;
    this.position.addScaledVector(this.velocity, dt);

    this.collide();

    // --- Rendu : roulis dans les virages, tangage avec la montée/descente, léger roulis de houle
    const bob = Math.sin(time * 1.3) * 0.04;
    this.roll = lerp(this.roll, -this.yawVelocity * 0.22 + bob * 0.5, damp(4, dt));
    this.pitch = lerp(this.pitch, -this.velocity.y * 0.09 + Math.sin(time * 0.9) * 0.015, damp(3, dt));
    this.object.rotation.set(0, this.yaw, 0);
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');
    this.body.position.y = Math.sin(time * 1.1) * 0.06;

    // --- Hélices et rotors
    this.throttle = lerp(this.throttle, thrustInput, damp(2.5, dt));
    this.lift = lerp(this.lift, liftInput, damp(3, dt));
    spinPropellers(this.model, dt, this.throttle, this.lift);
  }

  /** Collisions : fond marin, surface, limites du monde, gros rochers */
  collide() {
    const S = SUBMARINE;
    const p = this.position;
    // Fond : on teste le centre, l'avant et l'arrière de la coque
    const floorAt = (x, z) => {
      const fwd = this.forward;
      return Math.max(
        getFloorHeight(x, z),
        getFloorHeight(x + fwd.x * 3.5, z + fwd.z * 3.5),
        getFloorHeight(x - fwd.x * 3.5, z - fwd.z * 3.5)
      );
    };
    let minY = floorAt(p.x, p.z) + S.HULL_RADIUS;
    if (p.y < minY) {
      const moved = Math.hypot(p.x - this._prev.x, p.z - this._prev.z);
      // Pente du terrain entre l'ancienne et la nouvelle position (et non la descente du sous-marin)
      const rise = minY - (floorAt(this._prev.x, this._prev.z) + S.HULL_RADIUS);
      // Seules les vraies falaises arrêtent le sous-marin ; les crêtes ordinaires se franchissent
      if (moved > 1e-4 && rise / moved > 3) {
        // Paroi trop raide (canyon, épave) : on bloque l'avance au lieu de grimper
        this.onImpact?.(this.speed);
        p.x = this._prev.x;
        p.z = this._prev.z;
        this.velocity.x *= -0.25;
        this.velocity.z *= -0.25;
        minY = floorAt(p.x, p.z) + S.HULL_RADIUS;
      }
      if (p.y < minY) {
        p.y = minY;
        // Vitesse de choc : verticale + une part de l'horizontale (on racle le fond)
        // Un choc ne compte qu'au premier contact (pas à chaque image passée à racler le fond)
        if (this.velocity.y < 0 && this.contactTimer <= 0) this.onImpact?.(-this.velocity.y + this.speed * 0.3);
        this.contactTimer = 0.6;
        if (this.velocity.y < 0) this.velocity.y *= -0.25; // petit rebond mou
        this.velocity.x *= 0.96;
        this.velocity.z *= 0.96;
      }
    }

    // Surface
    const maxY = WORLD.SURFACE_Y - S.SURFACE_MARGIN;
    if (p.y > maxY) {
      p.y = maxY;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    // La falaise dépasse la surface : impossible de passer par-dessus
    if (floorAt(p.x, p.z) + S.HULL_RADIUS > maxY) {
      p.x = this._prev.x;
      p.z = this._prev.z;
      this.velocity.x *= -0.25;
      this.velocity.z *= -0.25;
    }

    // La déchirure du portail ne se traverse pas en avançant : il faut choisir de la franchir
    if (!this.ghost) {
      const dx = p.x - RADIATION.SOURCE.x, dz = p.z - RADIATION.SOURCE.z, d = Math.hypot(dx, dz), R = 6.5 + S.HULL_RADIUS;
      if (d < R && d > 1e-4) {
        p.x = RADIATION.SOURCE.x + (dx / d) * R;
        p.z = RADIATION.SOURCE.z + (dz / d) * R;
        const vn = (this.velocity.x * dx + this.velocity.z * dz) / d;
        if (vn < 0) { this.velocity.x -= (vn * dx) / d; this.velocity.z -= (vn * dz) / d; }
      }
    }

    // Rochers (sphères)
    for (const c of this.colliders) {
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const minDist = c.r + S.HULL_RADIUS;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minDist * minDist && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        p.x = c.x + nx * minDist;
        p.y = c.y + ny * minDist;
        p.z = c.z + nz * minDist;
        // Annule la composante de vitesse qui rentre dans le rocher
        const vn = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz;
        if (vn < 0) {
          this.onImpact?.(-vn);
          this.velocity.x -= vn * nx * 1.2;
          this.velocity.y -= vn * ny * 1.2;
          this.velocity.z -= vn * nz * 1.2;
        }
      }
    }
  }

  /** Position monde du phare et direction du faisceau (pour la neige marine) */
  getLightRay(outPos, outDir) {
    this.spot.getWorldPosition(outPos);
    this.spotTarget.getWorldPosition(outDir);
    outDir.sub(outPos).normalize();
  }

  /** Position monde de l'arrière du sous-marin (pour les bulles) */
  getPropellerPosition(out) {
    return this.tailPoint.getWorldPosition(out);
  }

  /** Réglages du phare selon les améliorations */
  applyLight(stats) {
    this.auraLight.intensity = stats.auraIntensity ?? 4;
    this.auraLight.distance = stats.auraRange ?? 12;
    // Le rendu HDR permet un phare franchement puissant : il éclaire loin sans tout brûler
    this.spot.intensity = stats.lightIntensity * 1.4;
    this.spot.distance = stats.lightRange;
    this.spot.angle = stats.lightAngle;
  }

  /** Ajuste l'intensité visuelle du faisceau selon la profondeur */
  setBeamVisibility(v) {
    // Le faisceau est désormais volumétrique (calculé par le renderer) : l'ancien cône est éteint
    this.beam.setOpacity(0);
  }
}
