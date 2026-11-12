import { stats } from '../submarine/stats.js';
import { getItem } from './loot.js';

/**
 * Soute du sous-marin : nombre d'emplacements limité (selon les améliorations).
 * Chaque emplacement contient la définition d'un objet (voir items.json).
 */
export class Hold {
  constructor() {
    this.items = [];
    this.listeners = new Set();
  }

  get capacity() {
    return stats.holdCapacity;
  }

  /** Identifiants des objets (pour la sauvegarde) */
  toIds() {
    return this.items.map((it) => it.id);
  }

  /** Recharge la soute depuis une liste d'identifiants */
  fromIds(ids) {
    this.items = ids.map(getItem).filter(Boolean);
    this.emit();
  }

  /** Vide la soute et renvoie son contenu */
  takeAll() {
    const all = this.items;
    this.items = [];
    this.emit();
    return all;
  }

  get full() {
    return this.items.length >= this.capacity;
  }

  /** Ajoute un objet ; renvoie false si la soute est pleine */
  add(item) {
    if (this.full) return false;
    this.items.push(item);
    this.emit();
    return true;
  }

  /** Retire l'objet à l'index donné et le renvoie */
  removeAt(index) {
    const [item] = this.items.splice(index, 1);
    this.emit();
    return item;
  }

  /**
   * Perd une partie de la soute au hasard (réveil à l'hôpital).
   * @param {number} fraction part perdue (arrondie au supérieur)
   * @returns {object[]} objets perdus
   */
  loseFraction(fraction) {
    const n = Math.ceil(this.items.length * fraction);
    const lost = [];
    for (let i = 0; i < n; i++) {
      const index = Math.floor(Math.random() * this.items.length);
      lost.push(...this.items.splice(index, 1));
    }
    if (lost.length) this.emit();
    return lost;
  }

  get count() {
    return this.items.length;
  }

  get weight() {
    return Math.round(this.items.reduce((sum, it) => sum + it.weight, 0) * 10) / 10;
  }

  get value() {
    return this.items.reduce((sum, it) => sum + it.price, 0);
  }

  emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  onChange(fn) {
    this.listeners.add(fn);
  }
}
