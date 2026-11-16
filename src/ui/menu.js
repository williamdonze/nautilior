import { getEndings } from '../save/save.js';
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
    this.back = null;
    this.qualityAtStart = preferences.qualityLevel; // le niveau de détail s'applique au lancement

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
      if (el.dataset.pref === 'qualityLevel') preferences.autoScale = 1;
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
    this.root.className = `open is-${screen}`; // préfixe : « settings » est aussi le nom de la liste des réglages
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
      case 'reload': this.onQuitToTitle(); break;
    }
  }

  render_main() {
    const save = this.hasSave();
    // L'écran-titre garde la trace de la dernière fin vue
    const last = getEndings().at(-1);
    document.body.dataset.ending = last ?? '';
    const after = { close: 'Il n\'y a plus personne à réveiller.', cross: 'Il manque quelqu\'un.', depart: 'La montre s\'est remise à tourner.' }[last];
    const items = [save && ['continue', 'Continuer'], ['new', 'Nouvelle partie'], ['settings', 'Réglages']].filter(Boolean);
    return `<div class="menu-frame title-frame">
      <div class="t-kicker">Port-Kermor <i></i> 1984</div>
      <h1 class="t-title">NAUTILIAR</h1>
      <div class="t-rule"><span></span></div>
      ${after ? `<div class="menu-after">${after}</div>` : ''}
      <nav class="menu-buttons">
        ${items.map(([id, label], i) => `<button data-menu="${id}" style="--i:${i}"><span class="n">0${i + 1}</span>${label}</button>`).join('')}
      </nav>
      <div class="menu-foot">Casque conseillé <i></i> le son démarre au premier clic</div>
    </div>
    <div class="t-corner">48° 05′ N <i></i> 4° 20′ O</div>`;
  }

  render_confirm() {
    return `<div class="menu-frame panel-frame">
      <div class="p-title">Recommencer</div>
      <p class="p-text">La partie en cours sera effacée.</p>
      <nav class="menu-buttons inline">
        <button data-menu="confirmNew">Oui, recommencer</button>
        <button data-menu="back">Non</button>
      </nav>
    </div>`;
  }

  render_pause() {
    return `<div class="menu-frame panel-frame">
      <div class="p-title">Pause</div>
      <nav class="menu-buttons">
        <button data-menu="resume"><span class="n">01</span>Reprendre</button>
        <button data-menu="settings"><span class="n">02</span>Réglages</button>
        <button data-menu="title"><span class="n">03</span>Écran titre</button>
      </nav>
      <div class="menu-foot">La partie est sauvegardée automatiquement.</div>
    </div>`;
  }

  render_settings() {
    const slider = (pref, label, max = 100) =>
      `<label class="setting"><span>${label}</span>
        <input type="range" min="0" max="${max}" value="${Math.round(preferences[pref] * 100)}" data-pref="${pref}">
        <em data-label="${pref}"></em></label>`;
    return `<div class="menu-frame panel-frame wide">
      <div class="p-title">Réglages</div>
      <div class="settings">
        ${slider('master', 'Volume général')}
        ${slider('music', 'Musique')}
        ${slider('sfx', 'Effets')}
        <label class="setting"><span>Niveau de détail</span>
          <input type="range" min="0" max="${QUALITY_LEVELS.length - 1}" value="${preferences.qualityLevel}" data-pref="qualityLevel">
          <em data-label="qualityLevel"></em></label>
        <p class="setting-note" id="quality-note">${this.qualityAtStart !== undefined && this.qualityAtStart !== preferences.qualityLevel ? 'Appliqué au prochain lancement : <button data-menu="reload">Relancer</button>' : 'Règle la densité des algues, les ombres, les rayons de lumière et la finesse de l\'image.'}</p>
        <label class="setting toggle"><span>Résolution auto (60 i/s)</span>
          <input type="checkbox" data-toggle="autoRes" ${preferences.autoRes ? 'checked' : ''}><em></em></label>
        <label class="setting toggle"><span>Afficher les images/s</span>
          <input type="checkbox" data-toggle="showFps" ${preferences.showFps ? 'checked' : ''}><em></em></label>
      </div>
      <nav class="menu-buttons inline"><button data-menu="back">Retour</button></nav>
    </div>`;
  }

  updateLabels() {
    for (const el of this.root.querySelectorAll('[data-label]')) {
      const k = el.dataset.label;
      if (k === 'qualityLevel') {
        const lvl = QUALITY_LEVELS[preferences.qualityLevel] ?? QUALITY_LEVELS[2];
        el.textContent = lvl.label;
        const note = this.root.querySelector('#quality-note');
        if (note && preferences.qualityLevel !== this.qualityAtStart) {
          note.innerHTML = 'Appliqué au prochain lancement : <button data-menu="reload">Relancer</button>';
        }
      } else el.textContent = `${Math.round(preferences[k] * 100)} %`;
    }
  }
}
