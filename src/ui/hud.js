/**
 * HUD en HTML par-dessus le canvas.
 * Phase 1 : profondeur en mètres + jauge verticale + aide aux commandes.
 */
const GAUGE_MAX_DEPTH = 300; // profondeur représentée en bas de la jauge (sera liée à la coque en phase 4)

export class Hud {
  constructor() {
    this.depthValue = document.getElementById('depth-value');
    this.depthMarker = document.getElementById('depth-marker');
    this.hint = document.getElementById('hint');
    this.fade = document.getElementById('fade');
    this.lastDepth = -1;
    this.hintHidden = false;
  }

  /** Ouverture en fondu depuis le noir */
  intro() {
    setTimeout(() => this.fade.classList.add('hidden'), 1800);
  }

  update(depth, input) {
    const d = Math.round(depth);
    if (d !== this.lastDepth) {
      this.lastDepth = d;
      this.depthValue.textContent = String(d).padStart(4, '0');
      this.depthMarker.style.top = `${Math.min(100, (depth / GAUGE_MAX_DEPTH) * 100)}%`;
    }
    // L'aide disparaît quelques secondes après le premier mouvement
    if (!this.hintHidden && input.anyMovement) {
      this.hintHidden = true;
      setTimeout(() => this.hint.classList.add('hidden'), 4000);
    }
  }
}
