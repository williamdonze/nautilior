/**
 * Musique générative, lente et mélancolique (aucun fichier audio).
 * Une nappe d'accords qui change toutes les quelques secondes, et de rares notes
 * pincées qui s'éteignent dans l'écho. L'humeur dépend du lieu :
 *  - port / menu : la mineur, accords ouverts ;
 *  - plongée     : ré mineur, plus grave et plus clairsemé ;
 *  - abysses     : un bourdon et des accords dissonants.
 */
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const MOODS = {
  port: {
    bar: 7,
    chords: [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]], // Lam Fa Do Sol
    scale: [69, 72, 74, 76, 79, 81],
    notes: [0, 3], // nombre de notes pincées par mesure (min, max)
    cutoff: 900,
  },
  dive: {
    bar: 9,
    chords: [[50, 53, 57], [46, 53, 58], [53, 57, 60], [48, 55, 60]], // Rém Sib Fa Do
    scale: [62, 65, 67, 69, 72],
    notes: [0, 2],
    cutoff: 650,
  },
  deep: {
    bar: 11,
    chords: [[38, 45, 51], [37, 44, 50], [38, 44, 49]], // grappes dissonantes
    scale: [62, 63, 68, 69],
    notes: [0, 1],
    cutoff: 450,
  },
  // En présence du gardien : grappes graves et serrées, tambours lourds (voir rhythm)
  boss: {
    bar: 6,
    chords: [[33, 39, 46], [32, 38, 45], [34, 40, 46], [31, 37, 44]],
    scale: [57, 58, 63, 64],
    notes: [1, 3],
    cutoff: 560,
  },
};

export class Music {
  constructor(sound) {
    this.sound = sound;
    this.mood = 'port';
    this.timer = 0;
    this.index = 0;
    this.enabled = true;
    this.threat = 0; // bêtes en train de charger : la musique se resserre et cogne
    this.tension = 0;
    this.beat = 0;
    this.beatTimer = 0;
  }

  /**
   * Rythme : un battement sourd et régulier sous la nappe. En plongée il est lent, comme un cœur ;
   * dans les abysses, plus lourd. Dès qu'une bête charge, le tempo double, la caisse claque
   * et des accords dissonants tombent sur les temps.
   */
  rhythm(dt) {
    const s = this.sound;
    this.tension += ((this.threat > 0 ? 1 : 0) - this.tension) * Math.min(1, dt * (this.threat > 0 ? 4 : 0.5));
    if (this.mood === 'port' && this.tension < 0.05) return;
    const hunted = this.tension > 0.35;
    const boss = this.mood === 'boss';
    const bpm = hunted ? (boss ? 150 : 138) : boss ? 88 : this.mood === 'deep' ? 54 : 66;
    this.beatTimer -= dt;
    if (this.beatTimer > 0) return;
    this.beatTimer += 60 / bpm / 2; // croches
    if (this.beatTimer < 0) this.beatTimer = 0;
    const step = this.beat++ % 8, t = s.ctx.currentTime + 0.02;
    if (hunted) {
      if (step % 2 === 0) this.kick(t, 0.34);
      if (step === 2 || step === 6) s.noiseBurst(t, 0.16, 0.12, 'bandpass', 1800, 1.2);
      else s.noiseBurst(t, 0.035, 0.03, 'highpass', 6000, 1);
      if (step === 0 || step === 5) this.stab(t, step ? [39, 45, 50] : [38, 44, 51]);
    } else if (boss) {
      // marche lourde : tambours graves, souffle rauque sur les temps faibles, accord qui tombe en début de mesure
      if (step === 0 || step === 3 || step === 4 || step === 6) this.kick(t, step === 0 ? 0.4 : 0.26);
      if (step === 2 || step === 7) s.noiseBurst(t, 0.09, 0.3, 'lowpass', 240, 0.8);
      if (step === 0 && this.beat % 16 === 1) this.stab(t, [33, 39, 46]);
    } else {
      // cœur lent : deux coups rapprochés, puis le silence
      if (step === 0) this.kick(t, this.mood === 'deep' ? 0.2 : 0.13);
      if (step === 1) this.kick(t, this.mood === 'deep' ? 0.12 : 0.08);
      if (step === 4 && this.mood === 'deep') s.noiseBurst(t, 0.03, 0.4, 'lowpass', 300, 0.7);
    }
  }

  kick(t, vol) {
    const s = this.sound, o = s.ctx.createOscillator(), g = s.ctx.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(s.musicBus);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** Accord dissonant, bref et rauque */
  stab(t, notes) {
    const s = this.sound, f = s.ctx.createBiquadFilter(), g = s.ctx.createGain();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    g.gain.setValueAtTime(0.085, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    f.connect(g).connect(s.musicBus);
    for (const n of notes) {
      const o = s.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.connect(f);
      o.start(t);
      o.stop(t + 0.36);
    }
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.timer = Math.min(this.timer, 1.5); // le prochain accord arrive vite
  }

  update(dt) {
    const s = this.sound;
    if (!s.ready || !this.enabled) return;
    this.rhythm(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    const m = MOODS[this.mood];
    this.timer = m.bar;
    const chord = m.chords[this.index++ % m.chords.length];
    this.pad(chord, m.bar, m.cutoff);
    const count = m.notes[0] + Math.floor(Math.random() * (m.notes[1] - m.notes[0] + 1));
    for (let i = 0; i < count; i++) {
      const note = m.scale[Math.floor(Math.random() * m.scale.length)];
      this.pluck(note, 0.8 + Math.random() * (m.bar - 2));
    }
  }

  /** Nappe : chaque note d'accord, plus la basse une octave en dessous */
  pad(notes, bar, cutoff) {
    const s = this.sound;
    const t = s.ctx.currentTime;
    const dur = bar + 2.5; // chevauche la mesure suivante
    const f = s.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = s.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 2.2);
    g.gain.setValueAtTime(0.06, t + bar - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(s.musicBus);
    for (const n of [notes[0] - 12, ...notes]) {
      for (const detune of [-6, 6]) {
        const o = s.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  /** Note pincée, douce, qui part dans l'écho */
  pluck(note, delay) {
    const s = this.sound;
    const t = s.ctx.currentTime + delay;
    const g = s.ctx.createGain();
    s.envelope(g, t, 0.035, 0.01, 2.4);
    g.connect(s.musicBus);
    g.connect(s.echo);
    for (const [mul, vol] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const o = s.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(note) * mul;
      const gg = s.ctx.createGain();
      gg.gain.value = vol;
      o.connect(gg).connect(g);
      o.start(t);
      o.stop(t + 2.6);
    }
  }
}
