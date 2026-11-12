import { HOLD } from '../config/settings.js';

/**
 * Soute du sous-marin : nombre d'emplacements limité.
 * Chaque emplacement contient la définition d'un objet (voir items.json).
 */
export class Hold {
  constructor(capacity = HOLD.CAPACITY) {
    this.capacity = capacity;
    this.items = [];
    this.listeners = new Set();
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
