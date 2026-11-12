import * as THREE from 'three';

/**
 * Souris : position à l'écran (pixels et coordonnées normalisées -1..1), clics,
 * et capture du pointeur (vue à la 1re personne : la souris fait tourner le regard).
 */
export class Pointer {
  constructor() {
    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.ndc = new THREE.Vector2();
    this.listeners = new Set();
    this.lockListeners = new Set();
    this.locked = false;
    this.lookDX = 0; // déplacements accumulés pendant la capture
    this.lookDY = 0;

    window.addEventListener('pointermove', (e) => {
      if (this.locked) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      } else this.move(e.clientX, e.clientY);
    });
    window.addEventListener('pointerdown', (e) => {
      if (!this.locked) this.move(e.clientX, e.clientY);
      if (e.button === 0) this.listeners.forEach((fn) => fn(e));
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = !!document.pointerLockElement;
      this.lookDX = this.lookDY = 0;
      this.lockListeners.forEach((fn) => fn(this.locked));
    });
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

  /** Appelé quand la capture commence ou s'arrête */
  onLockChange(fn) {
    this.lockListeners.add(fn);
  }

  /** Capture la souris (doit être appelé pendant un clic de l'utilisateur) */
  lock() {
    if (this.locked) return;
    const el = document.querySelector('#game canvas') ?? document.body;
    try {
      const r = el.requestPointerLock?.();
      r?.catch?.(() => {});
    } catch {
      /* navigateur sans capture du pointeur */
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock?.();
  }

  /** Lit et remet à zéro le mouvement de la souris capturée */
  consumeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return d;
  }
}

/** Pointeur fixe au centre de l'écran (réticule de la vue à la 1re personne) */
export const CENTER_POINTER = {
  ndc: new THREE.Vector2(0, 0),
  get x() {
    return window.innerWidth / 2;
  },
  get y() {
    return window.innerHeight / 2;
  },
};
