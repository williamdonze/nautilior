/**
 * Sons synthétisés avec la Web Audio API (aucun fichier audio nécessaire).
 * Tout passe par un filtre passe-bas commun pour un rendu étouffé, « sous l'eau ».
 * Le contexte audio ne démarre qu'après une première interaction (règle des navigateurs).
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.motor = null;
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
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.muffle.connect(this.master).connect(this.ctx.destination);
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
}
