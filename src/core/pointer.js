import * as THREE from 'three';

/**
 * Souris : position à l'écran (pixels et coordonnées normalisées -1..1) et clics.
 */
export class Pointer {
  constructor() {
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.ndc = new THREE.Vector2();
    this.listeners = new Set();

    window.addEventListener('pointermove', (e) => this.move(e.clientX, e.clientY));
    window.addEventListener('pointerdown', (e) => {
      this.move(e.clientX, e.clientY);
      if (e.button === 0) this.listeners.forEach((fn) => fn(e));
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    this.move(this.x, this.y);
  }

  move(x, y) {
    this.x = x;
    this.y = y;
    this.ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  }

  onClick(fn) {
    this.listeners.add(fn);
  }
}
