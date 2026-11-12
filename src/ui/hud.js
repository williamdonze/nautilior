/**
 * HUD en HTML par-dessus le canvas :
 * profondeur, soute, réticule de la pince, message de capture, aide aux commandes.
 */
const GAUGE_MAX_DEPTH = 300; // profondeur représentée en bas de la jauge (sera liée à la coque en phase 4)

export class Hud {
  constructor() {
    this.depthValue = document.getElementById('depth-value');
    this.depthMarker = document.getElementById('depth-marker');
    this.cargoCount = document.getElementById('cargo-count');
    this.cargoWeight = document.getElementById('cargo-weight');
    this.cargoBox = this.cargoCount.parentElement;
    this.reticle = document.getElementById('reticle');
    this.reticleLabel = document.getElementById('reticle-label');
    this.toastEl = document.getElementById('toast');
    this.toastName = document.getElementById('toast-name');
    this.toastRarity = document.getElementById('toast-rarity');
    this.flashEl = document.getElementById('flash');
    this.toastDesc = document.getElementById('toast-desc');
    this.hint = document.getElementById('hint');
    this.fade = document.getElementById('fade');
    this.lastDepth = -1;
    this.hintHidden = false;
    this.reticleState = '';
    this.toastTimer = null;
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
      setTimeout(() => this.hint.classList.add('hidden'), 6000);
    }
  }

  /**
   * Réticule : suit la souris et change d'état
   *  - « target » : objet à portée → coins resserrés, couleur chaude
   *  - « far »    : objet trop loin
   *  - « busy »   : la pince travaille
   */
  updateReticle(pointer, aim, busy, holdFull) {
    this.reticle.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    let state = '';
    let label = '';
    if (busy) state = 'busy';
    else if (aim.pickup && aim.inRange && holdFull) {
      state = 'full';
      label = 'SOUTE PLEINE';
    } else if (aim.pickup && aim.inRange) {
      state = 'target';
      label = 'SAISIR';
    } else if (aim.pickup) {
      state = 'far';
      label = 'TROP LOIN';
    }
    if (state !== this.reticleState) {
      this.reticleState = state;
      this.reticle.className = state;
      this.reticleLabel.textContent = label;
    }
  }

  updateCargo(hold) {
    this.cargoCount.textContent = `${String(hold.count).padStart(2, '0')}/${String(hold.capacity).padStart(2, '0')}`;
    this.cargoWeight.textContent = `${hold.weight} kg`;
    // Petit « pouls » visuel
    this.cargoBox.classList.remove('pulse');
    void this.cargoBox.offsetWidth; // relance l'animation CSS
    this.cargoBox.classList.add('pulse');
  }

  /** Refus : la soute est pleine */
  denyCargo() {
    this.cargoBox.classList.remove('deny');
    void this.cargoBox.offsetWidth;
    this.cargoBox.classList.add('deny');
  }

  /** Éclat coloré plein écran */
  flash(color) {
    this.flashEl.style.setProperty('--flash', color);
    this.flashEl.classList.remove('play');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('play');
  }

  /** Affiche le nom, la rareté et la description de l'objet récupéré */
  toast(item, rarity) {
    this.toastEl.style.setProperty('--rarity', rarity.level > 0 ? rarity.color : '');
    this.toastRarity.textContent = rarity.name.toUpperCase();
    this.toastName.textContent = item.name;
    this.toastDesc.textContent = item.description;
    this.toastEl.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), 4200);
  }
}
