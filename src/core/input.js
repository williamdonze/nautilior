/**
 * Gestion du clavier.
 * On lit `event.code` (position physique de la touche) : la touche « W » d'un clavier QWERTY
 * est la touche « Z » d'un clavier AZERTY. ZQSD et WASD fonctionnent donc tous les deux,
 * sans détection de disposition.
 */
const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['Space'],
  down: ['ShiftLeft', 'ShiftRight'],
};

// Touches dont on bloque le comportement par défaut (défilement de la page…)
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor() {
    this.down = new Set();
    this.listeners = new Set();

    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.listeners.forEach((fn) => fn(e.code));
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    // Évite les touches « collées » quand la fenêtre perd le focus
    window.addEventListener('blur', () => this.down.clear());
  }

  /** true si l'une des touches de l'action est enfoncée */
  is(action) {
    return BINDINGS[action].some((code) => this.down.has(code));
  }

  /** -1, 0 ou 1 selon deux actions opposées */
  axis(negative, positive) {
    return (this.is(positive) ? 1 : 0) - (this.is(negative) ? 1 : 0);
  }

  /** Appelé à chaque nouvel appui de touche (pour les actions ponctuelles) */
  onPress(fn) {
    this.listeners.add(fn);
  }

  /** true dès que le joueur a touché une commande de pilotage */
  get anyMovement() {
    return Object.keys(BINDINGS).some((a) => this.is(a));
  }
}
