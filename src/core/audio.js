/**
 * Sons synthétisés avec la Web Audio API (aucun fichier audio nécessaire).
 * Chaîne : effets → filtre « sous l'eau » → bus effets ─┐
 *          musique → bus musique ─────────────────────────┼→ volume général → sortie
 * Le contexte audio ne démarre qu'après une première interaction (règle des navigateurs).
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.motor = null;
    this.volumes = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.fade = 1; // fondu temporaire (réveil à l'hôpital)
  }

  /** Volumes (0..1) : général, musique, effets */
  setVolumes({ master, music, sfx }) {
    if (master !== undefined) this.volumes.master = master;
    if (music !== undefined) this.volumes.music = music;
    if (sfx !== undefined) this.volumes.sfx = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.mainGain.gain.setTargetAtTime(this.volumes.master * this.fade, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.05);
    this.master.gain.setTargetAtTime(this.volumes.sfx * 0.75, t, 0.05);
  }

  /** À appeler sur un clic ou une touche */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 2600;
      this.mainGain = this.ctx.createGain();
      this.mainGain.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); // bus des effets (nom historique)
      this.musicBus = this.ctx.createGain();
      this.muffle.connect(this.master).connect(this.mainGain);
      this.musicBus.connect(this.mainGain);
      // Écho partagé (sonar, mouettes, cloche) : un délai rebouclé
      this.echo = this.ctx.createDelay(2);
      this.echo.delayTime.value = 0.45;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.42;
      const echoFilter = this.ctx.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.value = 1800;
      this.echo.connect(echoFilter).connect(fb).connect(this.echo);
      echoFilter.connect(this.master);
      this.setVolumes({});
      // Bruit blanc réutilisable
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  /** Enveloppe simple : attaque rapide puis décroissance exponentielle */
  envelope(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noiseBurst(t, peak, decay, filterType, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.envelope(g, t, peak, 0.005, decay);
    src.connect(f).connect(g).connect(this.muffle);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  /** Moteur hydraulique du bras (son continu) */
  motorStart() {
    if (!this.ready || this.motor) return;
    const t = this.ctx.currentTime;
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    a.frequency.value = 62;
    b.frequency.value = 125;
    b.detune.value = 14;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
    a.connect(f);
    b.connect(f);
    f.connect(g).connect(this.muffle);
    a.start(t);
    b.start(t);
    this.motor = { a, b, g, f };
  }

  /** Hauteur du moteur : plus grave quand il force (objet lourd) */
  motorPitch(factor) {
    if (!this.motor) return;
    const t = this.ctx.currentTime;
    this.motor.a.frequency.setTargetAtTime(62 * factor, t, 0.05);
    this.motor.b.frequency.setTargetAtTime(125 * factor, t, 0.05);
    this.motor.f.frequency.setTargetAtTime(380 * factor, t, 0.05);
  }

  motorStop() {
    if (!this.motor) return;
    const { a, b, g } = this.motor;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    a.stop(t + 0.2);
    b.stop(t + 0.2);
    this.motor = null;
  }

  /** Mâchoires métalliques qui se referment */
  clank(strength = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const [freq, decay] of [[310, 0.5], [473, 0.4], [731, 0.3], [1043, 0.25], [1489, 0.18]]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq * (0.97 + Math.random() * 0.06);
      const g = this.ctx.createGain();
      this.envelope(g, t, 0.07 * strength, 0.003, decay);
      o.connect(g).connect(this.muffle);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    this.noiseBurst(t, 0.25 * strength, 0.07, 'bandpass', 1800, 2);
  }

  /** Choc sourd (objet déposé dans la soute) */
  thunk(weight = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 - Math.min(weight, 60), t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const g = this.ctx.createGain();
    this.envelope(g, t, 0.45, 0.005, 0.3);
    o.connect(g).connect(this.muffle);
    o.start(t);
    o.stop(t + 0.4);
    this.noiseBurst(t, 0.2, 0.15, 'lowpass', 350);
  }

  /** Petit carillon mélancolique : un objet a été récupéré */
  capture() {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + 0.05;
    [440, 523.25, 659.25].forEach((freq, i) => {
      const t = t0 + i * 0.11;
      for (const [mul, vol] of [[1, 0.07], [2.76, 0.015]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mul;
        const g = this.ctx.createGain();
        this.envelope(g, t, vol, 0.01, 1.1);
        o.connect(g).connect(this.muffle);
        o.start(t);
        o.stop(t + 1.2);
      }
    });
  }

  /**
   * Capture d'un objet rare : arpège plus long et plus aigu, scintillement,
   * et pour les légendaires une note grave qui résonne comme une cloche lointaine.
   * @param {number} level 2 = rare, 3 = épique, 4 = légendaire
   */
  captureRare(level) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + 0.05;
    const scales = {
      2: [440, 523.25, 659.25, 880],
      3: [392, 493.88, 587.33, 739.99, 987.77],
      4: [329.63, 415.3, 493.88, 659.25, 830.61, 987.77],
    };
    const notes = scales[level] || scales[2];
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.12;
      for (const [mul, vol] of [[1, 0.06], [2.76, 0.014], [5.4, 0.005]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mul;
        const g = this.ctx.createGain();
        this.envelope(g, t, vol, 0.01, 1.6);
        o.connect(g).connect(this.muffle);
        o.start(t);
        o.stop(t + 1.7);
      }
    });
    // Scintillement : sinus aigus légèrement désaccordés
    for (let i = 0; i < level * 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 1800 + Math.random() * 900;
      const g = this.ctx.createGain();
      const t = t0 + 0.1 + Math.random() * 0.6;
      this.envelope(g, t, 0.012, 0.005, 0.35);
      o.connect(g).connect(this.muffle);
      o.start(t);
      o.stop(t + 0.4);
    }
    if (level >= 4) {
      // Cloche grave et lointaine (partiels inharmoniques)
      for (const [mul, vol] of [[1, 0.12], [2.0, 0.05], [2.41, 0.04], [3.01, 0.025]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 110 * mul;
        const g = this.ctx.createGain();
        this.envelope(g, t0, vol, 0.02, 3.5);
        o.connect(g).connect(this.muffle);
        o.start(t0);
        o.stop(t0 + 3.6);
      }
    }
  }

  /** Refus (soute pleine) : deux notes graves et sèches */
  deny() {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime;
    [0, 0.12].forEach((dt) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 110;
      const g = this.ctx.createGain();
      this.envelope(g, t0 + dt, 0.05, 0.005, 0.09);
      o.connect(g).connect(this.muffle);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.12);
    });
  }

  /** Objet largué : glouglou de bulles */
  release() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const ti = t + i * 0.06;
      o.frequency.setValueAtTime(300 + Math.random() * 200, ti);
      o.frequency.exponentialRampToValueAtTime(700 + Math.random() * 300, ti + 0.06);
      const g = this.ctx.createGain();
      this.envelope(g, ti, 0.05, 0.005, 0.07);
      o.connect(g).connect(this.muffle);
      o.start(ti);
      o.stop(ti + 0.1);
    }
  }

  /** Grincement de coque sous la pression */
  creak(strength = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dur = 0.6 + Math.random() * 0.9;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 55 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.6), t + dur);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 280 + Math.random() * 350;
    bp.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * strength, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(this.muffle);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Choc contre le fond ou un rocher */
  impact(strength = 1) {
    if (!this.ready) return;
    this.thunk(40);
    this.clank(0.4 * strength);
    this.creak(Math.min(1.5, strength));
  }

  /** Bip d'alerte (oxygène faible) */
  alarm(critical = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = critical ? [880, 880] : [740, 554];
    notes.forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      this.envelope(g, t + i * 0.16, 0.035, 0.005, 0.12);
      o.connect(g).connect(this.muffle);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 0.15);
    });
  }

  /** Battement de cœur sourd */
  heartbeat(volume = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [0, 0.22].forEach((dt, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t + dt);
      o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.12);
      const g = this.ctx.createGain();
      this.envelope(g, t + dt, (i ? 0.25 : 0.35) * volume, 0.01, 0.16);
      o.connect(g).connect(this.muffle);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    });
  }

  /** Clic de compteur Geiger */
  geiger() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
    // Ne passe pas par le filtre « sous l'eau » : c'est l'appareil dans la cabine
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.9);
    src.stop(t + 0.01);
  }

  /** Fondu du volume général (0..1), utilisé par le fondu au noir */
  setMasterVolume(v, time = 0.5) {
    this.fade = v;
    if (!this.ctx) return;
    this.mainGain.gain.setTargetAtTime(this.volumes.master * v, this.ctx.currentTime, time / 3);
  }

  /** Petit « bip » de texte qui s'écrit */
  blip(pitch = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = (180 + Math.random() * 30) * pitch;
    const g = this.ctx.createGain();
    this.envelope(g, t, 0.025, 0.003, 0.05);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.07);
  }

  /** Pas sur le granit mouillé */
  step() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 300;
    f.Q.value = 1.2;
    const g = this.ctx.createGain();
    this.envelope(g, t, 0.08, 0.004, 0.08);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.9);
    src.stop(t + 0.12);
  }

  /** Pièces qui tintent (vente) */
  coin(many = false) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime;
    const n = many ? 6 : 2;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.07 + Math.random() * 0.03;
      for (const mul of [1, 2.6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = (2100 + Math.random() * 500) * mul;
        const g = this.ctx.createGain();
        this.envelope(g, t, 0.03 / mul, 0.002, 0.18);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 0.2);
      }
    }
  }

  /** Amélioration achetée : cliquetis de clé et coup de marteau */
  upgrade() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500;
      f.Q.value = 3;
      const g = this.ctx.createGain();
      this.envelope(g, t + i * 0.08, 0.12, 0.002, 0.03);
      src.connect(f).connect(g).connect(this.master);
      src.start(t + i * 0.08, Math.random());
      src.stop(t + i * 0.08 + 0.05);
    }
    setTimeout(() => this.clank(1), 380);
  }

  /** Cri grave et distordu d'une créature qui charge */
  growl(volume = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const dur = 1.1;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(45, t + dur);
    // Trémolo irrégulier
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * volume, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.muffle);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** Morsure : craquement et choc */
  bite() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.5, 0.12, 'bandpass', 900, 1.5);
    this.noiseBurst(t + 0.06, 0.4, 0.1, 'bandpass', 1400, 2);
    this.thunk(60);
    this.creak(1.2);
  }

  /** Appel d'un fragment de mémoire tout proche : accord lointain, presque une voix */
  whisper(intensity = 0.5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const [freq, delay] of [[392, 0], [466.16, 0.4], [587.33, 0.8]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.detune.value = (Math.random() - 0.5) * 20;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.03 * intensity + 0.001, t + delay + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 2.2);
      o.connect(g).connect(this.muffle);
      o.start(t + delay);
      o.stop(t + delay + 2.3);
    }
  }

  /** Ouverture d'un souvenir : nappe douce et mélancolique */
  memory() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (const freq of [220, 261.63, 329.63, 392]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 7.1);
    }
  }

  /**
   * Bourdonnement continu du portail (0 = silence).
   * Deux oscillateurs graves légèrement désaccordés, créés à la première utilisation.
   */
  setDrone(level) {
    if (!this.ready) return;
    if (!this.drone) {
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const oscs = [55, 55.7, 82.4].map((freq) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.connect(f);
        o.start();
        return o;
      });
      f.connect(g).connect(this.muffle);
      this.drone = { g, oscs };
    }
    this.drone.g.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.3);
  }

  /** Grondement sourd (fermeture du portail, effondrement) */
  boom(duration = 3) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(25, t + duration);
    const g = this.ctx.createGain();
    this.envelope(g, t, 0.6, 0.05, duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.1);
    this.noiseBurst(t, 0.4, duration * 0.6, 'lowpass', 200);
  }

  /** Grand souffle lumineux (traversée) */
  whoosh(duration = 3) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + duration * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  /** Port vivant : brouhaha de foule et mouettes */
  crowd(duration = 12) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 2);
    g.gain.setValueAtTime(0.12, t + duration - 2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
    // Mouettes : glissandos aigus
    for (let i = 0; i < 6; i++) {
      const ti = t + 1 + Math.random() * (duration - 2);
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1400, ti);
      o.frequency.exponentialRampToValueAtTime(900, ti + 0.35);
      const gg = this.ctx.createGain();
      this.envelope(gg, ti, 0.03, 0.02, 0.35);
      o.connect(gg).connect(this.master);
      o.start(ti);
      o.stop(ti + 0.4);
    }
  }
}
