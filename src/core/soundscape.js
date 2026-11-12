/**
 * Ambiance sonore continue, selon le lieu :
 *  - plongée : grondement sourd (plus grave en profondeur), filets de bulles,
 *    ping de sonar avec écho, grincements lointains, chants déformés dans les abysses ;
 *  - port : vent qui souffle par rafales, ressac contre le quai, mouettes, cloche lointaine.
 */
export class Soundscape {
  constructor(sound) {
    this.sound = sound;
    this.nodes = null;
    this.timers = { bubbles: 2, sonar: 6, creak: 9, moan: 15, gull: 4, wave: 1, bell: 25 };
    this.time = 0;
  }

  /** Crée les sons continus (bruits filtrés en boucle) à la première utilisation */
  init() {
    const s = this.sound;
    const ctx = s.ctx;
    const loop = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = s.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(s.master);
      src.start();
      return { f, g };
    };
    this.nodes = {
      rumble: loop('lowpass', 120, 0.7), // grondement sous-marin
      wind: loop('bandpass', 500, 0.5), // vent du port
    };
  }

  /**
   * @param {number} dt
   * @param {object} ctx { mode: 'dive' | 'port' | 'menu', depth, paused }
   */
  update(dt, { mode, depth = 0, paused = false }) {
    const s = this.sound;
    if (!s.ready) return;
    if (!this.nodes) this.init();
    this.time += dt;
    const t = s.ctx.currentTime;
    const n = this.nodes;
    const diving = mode === 'dive' && !paused;
    const inPort = mode === 'port' || mode === 'menu';

    // Grondement : plus présent et plus grave en profondeur
    const deep = Math.min(1, depth / 1000);
    n.rumble.g.gain.setTargetAtTime(diving ? 0.18 + deep * 0.22 : 0, t, 0.8);
    n.rumble.f.frequency.setTargetAtTime(140 - deep * 80, t, 1);
    // Vent : rafales lentes
    const gust = 0.5 + Math.sin(this.time * 0.23) * 0.3 + Math.sin(this.time * 0.61) * 0.2;
    n.wind.g.gain.setTargetAtTime(inPort ? 0.05 + gust * 0.07 : 0, t, 0.6);
    n.wind.f.frequency.setTargetAtTime(380 + gust * 420, t, 0.6);

    for (const k in this.timers) this.timers[k] -= dt;
    if (diving) {
      if (this.timers.bubbles <= 0) {
        this.bubbles();
        this.timers.bubbles = 2 + Math.random() * 5;
      }
      if (this.timers.sonar <= 0) {
        this.sonar();
        this.timers.sonar = 14 + Math.random() * 10;
      }
      if (this.timers.creak <= 0) {
        s.creak(0.25 + deep * 0.3);
        this.timers.creak = 12 + Math.random() * 18;
      }
      if (depth > 450 && this.timers.moan <= 0) {
        this.moan(deep);
        this.timers.moan = 20 + Math.random() * 25;
      }
    } else if (inPort) {
      if (this.timers.gull <= 0) {
        this.gull();
        this.timers.gull = 6 + Math.random() * 12;
      }
      if (this.timers.wave <= 0) {
        s.noiseBurst(t, 0.12 + Math.random() * 0.08, 1.6, 'lowpass', 400 + Math.random() * 200);
        this.timers.wave = 2.5 + Math.random() * 3;
      }
      if (this.timers.bell <= 0) {
        this.bell();
        this.timers.bell = 35 + Math.random() * 40;
      }
    }
  }

  /** Petit chapelet de bulles qui remontent */
  bubbles() {
    const s = this.sound;
    const t0 = s.ctx.currentTime;
    const count = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const t = t0 + i * (0.05 + Math.random() * 0.1);
      const o = s.ctx.createOscillator();
      o.type = 'sine';
      const f = 400 + Math.random() * 500;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.06);
      const g = s.ctx.createGain();
      s.envelope(g, t, 0.025, 0.004, 0.06);
      o.connect(g).connect(s.muffle);
      o.start(t);
      o.stop(t + 0.08);
    }
  }

  /** Ping de sonar avec écho */
  sonar() {
    const s = this.sound;
    const t = s.ctx.currentTime;
    const o = s.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1180;
    const g = s.ctx.createGain();
    s.envelope(g, t, 0.06, 0.01, 0.9);
    o.connect(g);
    g.connect(s.master);
    g.connect(s.echo);
    o.start(t);
    o.stop(t + 1);
  }

  /** Chant lointain et déformé, quelque part dans le noir */
  moan(deep) {
    const s = this.sound;
    const t = s.ctx.currentTime;
    const dur = 3 + Math.random() * 2;
    const o = s.ctx.createOscillator();
    o.type = 'triangle';
    const f0 = 90 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (1.3 + Math.random() * 0.4), t + dur * 0.4);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + dur);
    const f = s.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 3;
    const g = s.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 + deep * 0.05, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g);
    g.connect(s.muffle);
    g.connect(s.echo);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** Cri de mouette (deux ou trois glissandos) */
  gull() {
    const s = this.sound;
    const t0 = s.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.28;
      const o = s.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(1500 + Math.random() * 200, t);
      o.frequency.exponentialRampToValueAtTime(950, t + 0.25);
      const f = s.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1700;
      f.Q.value = 4;
      const g = s.ctx.createGain();
      s.envelope(g, t, 0.025, 0.02, 0.25);
      o.connect(f).connect(g);
      g.connect(s.master);
      g.connect(s.echo);
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  /** Cloche de la chapelle, au loin */
  bell() {
    const s = this.sound;
    const t = s.ctx.currentTime;
    for (const [mul, vol] of [[1, 0.05], [2.0, 0.02], [2.4, 0.018], [3.0, 0.01]]) {
      const o = s.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 196 * mul;
      const g = s.ctx.createGain();
      s.envelope(g, t, vol, 0.01, 4);
      o.connect(g);
      g.connect(s.master);
      g.connect(s.echo);
      o.start(t);
      o.stop(t + 4.1);
    }
  }
}
