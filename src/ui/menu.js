import { preferences, savePreferences, QUALITY_LEVELS } from '../save/preferences.js';

/**
 * Menus : écran titre, pause et réglages (dans #menu).
 * Les actions sont transmises au jeu par des fonctions de rappel.
 */
export class Menu {
  /**
   * @param {object} deps hasSave(), onContinue(), onNewGame(), onResume(), onQuitToTitle(), applySettings()
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.root = document.getElementById('menu');
    this.screen = null;
    this.back = null; // écran auquel revenir depuis les réglages

    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (b) this.action(b.dataset.menu);
    });
    this.root.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.dataset.pref) return;
      const v = Number(el.value);
      preferences[el.dataset.pref] = el.dataset.pref === 'qualityLevel' ? v : v / 100;
      savePreferences();
      this.applySettings();
      this.updateLabels();
    });
    this.root.addEventListener('change', (e) => {
      if (e.target.dataset.toggle) {
        preferences[e.target.dataset.toggle] = e.target.checked;
        savePreferences();
        this.applySettings();
      }
    });
  }

  get isOpen() {
    return !!this.screen;
  }

  show(screen) {
    this.screen = screen;
    this.root.className = `open ${screen}`;
    this.root.innerHTML = this[`render_${screen}`]();
    this.updateLabels();
  }

  hide() {
    this.screen = null;
    this.root.className = '';
    this.root.innerHTML = '';
  }

  action(a) {
    this.sound?.blip(1.4);
    switch (a) {
      case 'continue': this.hide(); this.onContinue(); break;
      case 'new':
        if (this.hasSave()) this.show('confirm');
        else { this.hide(); this.onNewGame(); }
        break;
      case 'confirmNew': this.hide(); this.onNewGame(); break;
      case 'settings': this.back = this.screen; this.show('settings'); break;
      case 'back': this.show(this.back ?? 'main'); break;
      case 'resume': this.hide(); this.onResume(); break;
      case 'title': this.onQuitToTitle(); break;
    }
  }

  render_main() {
    const save = this.hasSave();
    return `<div class="menu-frame">
      <div class="menu-title">NAUTILIAR</div>
      <div class="menu-sub">Port-Kerys, 1984</div>
      <div class="menu-buttons">
        ${save ? '<button data-menu="continue">CONTINUER</button>' : ''}
        <button data-menu="new">NOUVELLE PARTIE</button>
        <button data-menu="settings">RÉGLAGES</button>
      </div>
      <div class="menu-foot">Casque conseillé. Le son démarre au premier clic.</div>
    </div>`;
  }

  render_confirm() {
    return `<div class="menu-frame">
      <div class="menu-sub">Effacer la partie en cours et recommencer ?</div>
      <div class="menu-buttons">
        <button data-menu="confirmNew">OUI, RECOMMENCER</button>
        <button data-menu="back">NON</button>
      </div>
    </div>`;
  }

  render_pause() {
    return `<div class="menu-frame">
      <div class="menu-title small">PAUSE</div>
      <div class="menu-buttons">
        <button data-menu="resume">REPRENDRE</button>
        <button data-menu="settings">RÉGLAGES</button>
        <button data-menu="title">ÉCRAN TITRE</button>
      </div>
      <div class="menu-foot">La partie est sauvegardée automatiquement.</div>
    </div>`;
  }

  render_settings() {
    const slider = (pref, label, max = 100) =>
      `<label class="setting"><span>${label}</span>
        <input type="range" min="0" max="${max}" value="${Math.round(preferences[pref] * 100)}" data-pref="${pref}">
        <em data-label="${pref}"></em></label>`;
    return `<div class="menu-frame">
      <div class="menu-title small">RÉGLAGES</div>
      <div class="settings">
        ${slider('master', 'Volume général')}
        ${slider('music', 'Musique')}
        ${slider('sfx', 'Effets')}
        <label class="setting"><span>Qualité graphique</span>
          <input type="range" min="0" max="${QUALITY_LEVELS.length - 1}" value="${preferences.qualityLevel}" data-pref="qualityLevel">
          <em data-label="qualityLevel"></em></label>
        <label class="setting toggle"><span>Afficher les images/s</span>
          <input type="checkbox" data-toggle="showFps" ${preferences.showFps ? 'checked' : ''}><em></em></label>
      </div>
      <div class="menu-buttons"><button data-menu="back">RETOUR</button></div>
    </div>`;
  }

  updateLabels() {
    for (const el of this.root.querySelectorAll('[data-label]')) {
      const k = el.dataset.label;
      if (k === 'qualityLevel') {
        const lvl = QUALITY_LEVELS[preferences.qualityLevel] ?? QUALITY_LEVELS[2];
        el.textContent = `${lvl.label} (${Math.round(lvl.scale * 100)} %)`;
      } else el.textContent = `${Math.round(preferences[k] * 100)} %`;
    }
  }
}
