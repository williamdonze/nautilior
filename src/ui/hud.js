/**
 * HUD en HTML par-dessus le canvas :
 * profondeur, soute, réticule de la pince, message de capture, aide aux commandes.
 */
const GAUGE_MAX_DEPTH = 1250; // profondeur représentée en bas de la jauge

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
    this.crushZone = document.getElementById('crush-zone');
    this.gauges = {
      oxygen: this.makeGauge('g-oxygen'),
      hull: this.makeGauge('g-hull'),
      rad: this.makeGauge('g-rad'),
    };
    this.warningsEl = document.getElementById('warnings');
    this.damageEl = document.getElementById('damage-vignette');
    this.tunnelEl = document.getElementById('tunnel');
    this.lastWarnings = '';
    this.lastCrush = -1;
    this.lastTunnel = -1;
    this.lastDepth = -1;
    this.hintHidden = false;
    this.reticleState = '';
    this.toastTimer = null;
  }

  makeGauge(id) {
    const el = document.getElementById(id);
    return { el, fill: el.querySelector('.fill'), pct: el.querySelector('.pct'), last: -1, cls: '' };
  }

  /** Met à jour une jauge (ratio 0..1) ; état visuel : '', 'low' ou 'critical' */
  setGauge(g, ratio, state = '') {
    const v = Math.round(ratio * 100);
    if (v !== g.last) {
      g.last = v;
      g.fill.style.width = `${v}%`;
      g.pct.textContent = v;
    }
    if (state !== g.cls) {
      g.el.classList.remove('low', 'critical');
      if (state) g.el.classList.add(state);
      g.cls = state;
    }
  }

  /** Jauges de survie, zone d'écrasement et alertes */
  updateSurvival(survival, depth) {
    const S = survival;
    const o2 = S.oxygenRatio;
    this.setGauge(this.gauges.oxygen, o2, o2 < 0.12 ? 'critical' : o2 < 0.25 ? 'low' : '');
    const hull = S.hullRatio;
    this.setGauge(this.gauges.hull, hull, hull < 0.25 ? 'critical' : hull < 0.5 ? 'low' : '');
    this.setGauge(this.gauges.rad, S.radiation, S.radiation > 0.5 ? 'critical' : '');
    this.gauges.rad.el.classList.toggle('active', S.radiation > 0.01);

    // Zone hachurée sous la profondeur max de la coque
    const crush = Math.round(Math.min(100, (S.stats.crushDepth / GAUGE_MAX_DEPTH) * 100));
    if (crush !== this.lastCrush) {
      this.lastCrush = crush;
      this.crushZone.style.top = `${crush}%`;
    }

    // Alertes
    const w = [];
    if (!S.dead) {
      if (o2 < 0.25) w.push(['OXYGÈNE FAIBLE', '']);
      if (S.overDepth > 0) w.push(['PRESSION CRITIQUE', '']);
      else if (depth > S.stats.crushDepth - 10) w.push(['LIMITE DE LA COQUE', '']);
      if (S.radiation > 0.05) w.push(['RADIATIONS', 'rad']);
    }
    const key = w.map((x) => x[0]).join('|');
    if (key !== this.lastWarnings) {
      this.lastWarnings = key;
      this.warningsEl.innerHTML = w.map(([t, c]) => `<div class="warning ${c}">${t}</div>`).join('');
    }

    // Vision qui se resserre quand l'air manque
    const tunnel = o2 < 0.15 ? Math.round(20 + (o2 / 0.15) * 40) : 100;
    if (tunnel !== this.lastTunnel) {
      this.lastTunnel = tunnel;
      this.tunnelEl.style.opacity = tunnel >= 100 ? 0 : 1;
      this.tunnelEl.style.setProperty('--tunnel', `${tunnel}%`);
    }
  }

  /** Voile rouge bref quand la coque encaisse un coup */
  damageFlash(strength = 1) {
    this.damageEl.style.setProperty('opacity', '');
    this.damageEl.classList.add('hit');
    this.damageEl.style.opacity = Math.min(1, 0.35 + strength * 0.5);
    requestAnimationFrame(() => {
      this.damageEl.classList.remove('hit');
      this.damageEl.style.opacity = 0;
    });
  }

  /** Bandeau d'entrée dans une zone (« LES ÉPAVES · 150 – 500 m ») */
  showZone(zone) {
    const el = document.getElementById('zone-banner');
    el.querySelector('.zb-name').textContent = zone.name.toUpperCase();
    el.querySelector('.zb-depth').textContent =
      zone.maxDepth > 5000 ? `au-delà de ${zone.minDepth} m` : `${zone.minDepth} – ${zone.maxDepth} m`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Ouverture en fondu depuis le noir, avec une ligne de texte */
  intro(text = '') {
    this.fade.querySelector('p').textContent = text;
    setTimeout(() => this.fade.classList.add('hidden'), 1800);
  }

  /** Invite d'interaction (« E  Parler au médecin ») ; '' pour la masquer */
  setPrompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.promptEl ??= document.getElementById('prompt');
    this.promptEl.querySelector('#prompt-text').textContent = text;
    this.promptEl.classList.toggle('visible', !!text);
  }

  setMoney(amount) {
    document.getElementById('money-value').textContent = `${amount.toLocaleString('fr-FR')} F`;
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
    else if (aim.pickup && aim.inRange && holdFull && !aim.pickup.item.fragment) {
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
  toast(item, rarity, isNew = false) {
    this.toastEl.style.setProperty('--rarity', rarity.level > 0 ? rarity.color : '');
    this.toastRarity.textContent = rarity.name.toUpperCase() + (isNew ? '  ·  NOUVEAU' : '');
    this.toastName.textContent = item.name;
    this.toastDesc.textContent = item.description;
    this.toastEl.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('visible'), 4200);
  }
}
