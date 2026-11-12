/**
 * Soute du sous-marin.
 * Phase 2 : simple liste. La capacité limitée et l'inventaire arrivent en phase 3.
 */
export class Hold {
  constructor() {
    this.items = [];
    this.listeners = new Set();
  }

  add(item) {
    this.items.push(item);
    this.listeners.forEach((fn) => fn(this));
  }

  get count() {
    return this.items.length;
  }

  get weight() {
    return this.items.reduce((sum, it) => sum + it.weight, 0);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }
}
