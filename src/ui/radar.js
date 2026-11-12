import { stats } from '../submarine/stats.js';

/**
 * Radar / sonar de bord : un balayage circulaire révèle ce qui se trouve autour du sous-marin.
 * Orientation « cap en haut » : le haut de l'écran est l'avant du sous-marin.
 * Les échos apparaissent au passage du faisceau puis s'estompent.
 *
 * Types de contacts : item (objet), fragment (souvenir), creature (créature mutée),
 * fish (banc de poissons), wreck (épave, portail, repère).
 */
const SWEEP_PERIOD = 2.6; // secondes par tour
const FADE = SWEEP_PERIOD * 0.95;

const STYLE = {
  item: { color: '#cdb57c', size: 2.2 },
  fragment: { color: '#e8ece2', size: 3.2 },
  creature: { color: '#d0603f', size: 3.4 },
  fish: { color: '#5f8a84', size: 1.6 },
  wreck: { color: '#83a39a', size: 3 },
};

export class Radar {
  constructor(sound) {
    this.sound = sound;
    this.canvas = document.getElementById('radar-canvas');
    this.rangeEl = document.getElementById('radar-range');
    this.ctx = this.canvas.getContext('2d');
    this.sweep = 0;
    this.blips = new Map(); // id → { x, y, dy, kind, age }
    this.size = 0;
    this.lastRange = -1;
  }

  /** Taille réelle du canvas (écrans haute densité) */
  fit() {
    const css = this.canvas.clientWidth || 190;
    const px = Math.round(css * Math.min(window.devicePixelRatio || 1, 2));
    if (px !== this.size) {
      this.size = px;
      this.canvas.width = this.canvas.height = px;
    }
  }

  /**
   * @param {number} dt
   * @param {object} sub sous-marin (position, yaw)
   * @param {Array<{id, kind, x, y, z}>} contacts ce qui peut être détecté
   */
  update(dt, sub, contacts) {
    this.fit();
    const range = stats.radarRange ?? 45;
    if (range !== this.lastRange) {
      this.lastRange = range;
      this.rangeEl.textContent = `${range} m`;
    }
    const prev = this.sweep;
    this.sweep = (this.sweep + (dt / SWEEP_PERIOD) * Math.PI * 2) % (Math.PI * 2);
    const wrapped = this.sweep < prev;

    // Repère du sous-marin : avant = haut de l'écran
    const sin = Math.sin(sub.yaw), cos = Math.cos(sub.yaw);
    let newCreature = false;
    for (const c of contacts) {
      const dx = c.x - sub.position.x, dz = c.z - sub.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      // Coordonnées locales : avant (f) et droite (r)
      const f = dx * sin + dz * cos;
      const r = -dx * cos + dz * sin;
      // Angle écran, mesuré depuis le haut dans le sens horaire
      let a = Math.atan2(r, f);
      if (a < 0) a += Math.PI * 2;
      const swept = wrapped ? a > prev || a <= this.sweep : a > prev && a <= this.sweep;
      if (swept) {
        if (c.kind === 'creature' && !this.blips.has(c.id)) newCreature = true;
        this.blips.set(c.id, { x: r / range, y: -f / range, dy: c.y - sub.position.y, kind: c.kind, age: 0 });
      }
    }
    if (newCreature) this.sound.radarAlert?.();
    for (const [id, b] of this.blips) {
      b.age += dt;
      if (b.age > FADE) this.blips.delete(id);
    }
    this.draw();
  }

  draw() {
    const { ctx, size } = this;
    const c = size / 2;
    const R = c - size * 0.04;
    ctx.clearRect(0, 0, size, size);

    // Fond et graduations
    ctx.fillStyle = 'rgba(4, 14, 12, 0.88)';
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127, 191, 122, 0.22)';
    ctx.lineWidth = size * 0.006;
    for (const k of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, R * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c - R, c); ctx.lineTo(c + R, c);
    ctx.moveTo(c, c - R); ctx.lineTo(c, c + R);
    ctx.stroke();

    // Faisceau : secteur dégradé derrière la ligne de balayage
    const a = this.sweep - Math.PI / 2;
    for (let i = 0; i < 18; i++) {
      const a0 = a - (i + 1) * 0.035, a1 = a - i * 0.035;
      ctx.fillStyle = `rgba(127, 191, 122, ${0.22 * (1 - i / 18)})`;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160, 230, 150, 0.8)';
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    ctx.stroke();

    // Échos
    for (const b of this.blips.values()) {
      const st = STYLE[b.kind] ?? STYLE.item;
      const alpha = Math.max(0, 1 - b.age / FADE);
      const x = c + b.x * R, y = c + b.y * R;
      const s = st.size * size * 0.012;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = st.color;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = size * 0.008;
      if (b.kind === 'creature') {
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s); ctx.lineTo(x - s, y + s);
        ctx.closePath();
        ctx.fill();
      } else if (b.kind === 'fragment') {
        ctx.beginPath();
        ctx.arc(x, y, s * (1 + (1 - alpha) * 0.8), 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.kind === 'wreck') {
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Au-dessus / en dessous
      if (Math.abs(b.dy) > 8 && b.kind !== 'fish') {
        ctx.font = `${Math.round(size * 0.07)}px VT323, monospace`;
        ctx.fillText(b.dy > 0 ? '▴' : '▾', x + s * 1.3, y + s * 0.6);
      }
    }
    ctx.globalAlpha = 1;

    // Le sous-marin au centre
    ctx.fillStyle = '#efe3bb';
    ctx.beginPath();
    ctx.moveTo(c, c - size * 0.035);
    ctx.lineTo(c + size * 0.022, c + size * 0.025);
    ctx.lineTo(c - size * 0.022, c + size * 0.025);
    ctx.closePath();
    ctx.fill();
  }
}
