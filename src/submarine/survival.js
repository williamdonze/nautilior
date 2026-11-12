import { SURVIVAL, RADIATION } from '../config/settings.js';
import { clamp } from '../core/utils.js';
import { getRadiation } from '../world/radiation.js';
import { stats } from './stats.js';

/**
 * Survie : oxygène, intégrité de la coque, pression et radiation.
 *  - l'oxygène baisse en plongée (plus vite en poussant le moteur) et se recharge en surface ;
 *  - au-delà de la profondeur max de la coque, la pression l'abîme ;
 *  - la radiation l'use aussi, et aggrave l'effet de la pression ;
 *  - oxygène ou coque à zéro → `onDeath(cause)`.
 */
export class Survival {
  constructor() {
    // Caractéristiques partagées (oxygenMax, hullMax, crushDepth), issues des améliorations
    this.stats = stats;
    this.onDamage = null; // (quantité, type) → effets
    this.onDeath = null; // (cause : 'oxygen' | 'hull')
    this.reset();
  }

  /** Plein d'air et coque réparée */
  reset() {
    this.oxygen = this.stats.oxygenMax;
    this.hull = this.stats.hullMax;
    this.radiation = 0;
    this.overDepth = 0; // mètres au-delà de la profondeur max
    this.atSurface = false;
    this.dead = false;
  }

  get oxygenRatio() {
    return this.oxygen / this.stats.oxygenMax;
  }

  get hullRatio() {
    return this.hull / this.stats.hullMax;
  }

  update(dt, sub) {
    if (this.dead) return;
    const S = SURVIVAL;
    const depth = sub.depth;
    this.atSurface = depth < S.SURFACE_DEPTH;

    // --- Oxygène
    if (this.atSurface) {
      this.oxygen += S.OXYGEN_REFILL * dt;
    } else {
      this.oxygen -= (S.OXYGEN_USE + Math.abs(sub.throttle) * S.OXYGEN_USE_THRUST) * dt;
    }
    this.oxygen = clamp(this.oxygen, 0, this.stats.oxygenMax);
    this.hull = Math.min(this.hull, this.stats.hullMax);

    // --- Pression et radiation
    this.radiation = getRadiation(sub.position);
    this.overDepth = Math.max(0, depth - this.stats.crushDepth);
    let damage = 0;
    if (this.overDepth > 0) {
      damage += (S.CRUSH_DAMAGE_BASE + this.overDepth * S.CRUSH_DAMAGE_PER_M) * (1 + this.radiation * RADIATION.CRUSH_MULT);
    }
    damage += this.radiation * RADIATION.DAMAGE;
    if (damage > 0) this.damage(damage * dt, this.overDepth > 0 ? 'pressure' : 'radiation');

    if (this.oxygen <= 0) this.die('oxygen');
  }

  /** Choc contre le fond ou un rocher */
  impact(speed) {
    const excess = speed - SURVIVAL.IMPACT_THRESHOLD;
    if (excess > 0 && !this.dead) this.damage(excess * SURVIVAL.IMPACT_DAMAGE, 'impact');
  }

  damage(amount, kind) {
    if (this.dead) return;
    this.hull = Math.max(0, this.hull - amount);
    this.onDamage?.(amount, kind);
    if (this.hull <= 0) this.die('hull');
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.onDeath?.(cause);
  }
}
