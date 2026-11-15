import { stats } from '../submarine/stats.js';
import { getFloorHeight } from '../world/seabed.js';

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
      this.canvas.width = px;
      this.canvas.height = this.mode3d ? Math.round(px * 0.75) : px;
    }
  }

  /**
   * @param {number} dt
   * @param {object} sub sous-marin (position, yaw)
   * @param {Array<{id, kind, x, y, z}>} contacts ce qui peut être détecté
   */
  /** Onde de l'impulsion de défense : un anneau qui s'étend sur l'écran */
  pulse() {
    this.pulseT = 0;
  }

  update(dt, sub, contacts, colliders = []) {
    this.fit();
    if (this.pulseT != null && (this.pulseT += dt) > 1.2) this.pulseT = null;
    // Sonar volumétrique (amélioration) : nuage de points en relief à la place du balayage
    const mode3d = !!stats.sonar3d;
    if (mode3d !== this.mode3d) {
      this.mode3d = mode3d;
      this.canvas.parentElement.classList.toggle('sonar3d', mode3d);
      document.getElementById('radar-title').textContent = mode3d ? 'SONAR 3D' : 'SONAR';
      this.size = 0;
      this.fit();
    }
    if (mode3d) return this.update3d(dt, sub, contacts, colliders);
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

  /**
   * Sonar volumétrique : le relief et tout ce qui bouge autour du sous-marin, en nuage de points,
   * vus de trois quarts arrière. Le fond est sondé en éventail ; rochers et piliers ressortent ;
   * les bêtes sont des grappes de points rouges (hostiles) ou bleutées, avec leur trace.
   */
  update3d(dt, sub, contacts, colliders) {
    const range = stats.radarRange ?? 45;
    if (range !== this.lastRange) { this.lastRange = range; this.rangeEl.textContent = `${range} m`; }
    this.sweep = (this.sweep + dt * 0.55) % 1; // onde qui part du sous-marin
    const sin = Math.sin(sub.yaw), cos = Math.cos(sub.yaw), P = sub.position;
    // Relief : re-sondé quelques fois par seconde (points en repère local : droite, haut, avant)
    this.scanTimer = (this.scanTimer ?? 0) - dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.2;
      const pts = (this.cloud ??= []);
      pts.length = 0;
      const NR = 15, NA = 44;
      for (let i = 1; i <= NR; i++) {
        const r = range * Math.pow(i / NR, 1.25);
        for (let j = 0; j < NA; j++) {
          const a = ((j + (i % 2) * 0.5) / NA) * Math.PI * 2, lr = Math.sin(a) * r, lf = Math.cos(a) * r;
          const wx = P.x + lf * sin - lr * cos, wz = P.z + lf * cos + lr * sin;
          pts.push(lr, getFloorHeight(wx, wz) - P.y, lf, 0);
        }
      }
      // Rochers, piliers, arches : leur sommet et leur ceinture
      for (const c of colliders) {
        const dx = c.x - P.x, dz = c.z - P.z;
        if (dx * dx + dz * dz > range * range || c.r < 1.2) continue;
        const lf = dx * sin + dz * cos, lr = -dx * cos + dz * sin, y = c.y - P.y;
        pts.push(lr, y + c.r, lf, 1);
        for (let k = 0; k < 5; k++) { const a = k * 1.2566 + c.x; pts.push(lr + Math.cos(a) * c.r, y + c.r * 0.3, lf + Math.sin(a) * c.r, 1); }
      }
    }
    // Traces des contacts mobiles
    const trails = (this.trails ??= new Map());
    for (const c of contacts) {
      if (c.kind !== 'creature' && c.kind !== 'fish') continue;
      let t = trails.get(c.id);
      if (!t) trails.set(c.id, (t = { pts: [], seen: 0 }));
      t.seen = 0;
      t.pts.push(c.x, c.y, c.z);
      if (t.pts.length > 36) t.pts.splice(0, 3);
    }
    for (const [id, t] of trails) if ((t.seen += dt) > 0.5) trails.delete(id);

    const { ctx, canvas } = this, W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(3, 12, 12, 0.82)';
    ctx.fillRect(0, 0, W, H);
    // Projection : caméra derrière et au-dessus du sous-marin, inclinée vers l'avant
    const T = 0.62, cT = Math.cos(T), sT = Math.sin(T), sc = (W * 0.46) / range, cx = W / 2, cy = H * 0.6;
    const proj = (lr, u, lf) => {
      const d = lf * cT - u * sT, k = 1 / (1 + (d / range) * 0.45);
      return [cx + lr * sc * k, cy - (u * cT + lf * sT) * sc * k, k];
    };
    const wave = this.sweep * range * 1.15, px = Math.max(1, W * 0.006);
    const pts = this.cloud ?? [];
    for (let i = 0; i < pts.length; i += 4) {
      const lr = pts[i], u = pts[i + 1], lf = pts[i + 2], rock = pts[i + 3];
      const r = Math.hypot(lr, lf), [x, y, k] = proj(lr, u, lf);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      // l'onde illumine les points qu'elle traverse ; la couleur dit la hauteur par rapport au sous-marin
      const lit = Math.max(0, 1 - Math.abs(r - wave) / (range * 0.12));
      const h = Math.max(0, Math.min(1, (u + range * 0.5) / (range * 0.75)));
      const a = (0.25 + 0.75 * lit) * (1 - (r / range) * 0.55) * (rock ? 1 : 0.8);
      ctx.fillStyle = rock ? `rgba(${150 + 80 * lit}, ${225}, ${190}, ${a})` : `rgba(${60 + 90 * h}, ${150 + 90 * h}, ${130 + 60 * h}, ${a})`;
      const s = px * k * (rock ? 1.5 : 1) * (1 + lit * 0.8);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // Contacts
    for (const c of contacts) {
      const dx = c.x - P.x, dz = c.z - P.z;
      if (dx * dx + dz * dz > range * range) continue;
      const lf = dx * sin + dz * cos, lr = -dx * cos + dz * sin, u = c.y - P.y;
      const [x, y, k] = proj(lr, u, lf);
      const st = STYLE[c.kind] ?? STYLE.item, hostile = c.kind === 'creature';
      ctx.fillStyle = ctx.strokeStyle = hostile ? '#ff6a4a' : c.kind === 'fish' ? '#8fd0e0' : st.color;
      // tige jusqu'au fond : situe le contact en hauteur
      const [fx, fy] = proj(lr, getFloorHeight(c.x, c.z) - P.y, lf);
      ctx.globalAlpha = 0.3; ctx.lineWidth = Math.max(1, px * 0.5);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      const t = trails.get(c.id);
      if (t) {
        ctx.globalAlpha = 0.5; ctx.beginPath();
        for (let i = 0; i < t.pts.length; i += 3) {
          const ddx = t.pts[i] - P.x, ddz = t.pts[i + 2] - P.z, q = proj(-ddx * cos + ddz * sin, t.pts[i + 1] - P.y, ddx * sin + ddz * cos);
          if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const n = hostile || c.kind === 'fish' ? 9 : 1, sp = (c.size ?? 3) * sc * k * 0.5;
      for (let j = 0; j < n; j++) {
        const a = j * 2.4 + c.x, s = px * k * (hostile ? 2 : 1.6) * (j ? 1 : 1.6);
        ctx.fillRect(x + (j ? Math.cos(a) * sp * ((j % 3) / 3 + 0.3) : 0) - s / 2, y + (j ? Math.sin(a * 1.3) * sp * 0.5 : 0) - s / 2, s, s);
      }
      if (c.kind === 'fragment' || c.kind === 'wreck') { ctx.beginPath(); ctx.arc(x, y, px * 3.5 * k, 0, Math.PI * 2); ctx.stroke(); }
    }
    // Le sous-marin, et l'onde de l'impulsion
    ctx.fillStyle = '#efe3bb';
    ctx.beginPath(); ctx.moveTo(cx, cy - px * 5); ctx.lineTo(cx + px * 3, cy + px * 3); ctx.lineTo(cx - px * 3, cy + px * 3); ctx.closePath(); ctx.fill();
    if (this.pulseT != null) {
      ctx.strokeStyle = `rgba(127, 208, 192, ${1 - this.pulseT / 1.2})`; ctx.lineWidth = px * 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, (this.pulseT / 1.2) * W * 0.5, (this.pulseT / 1.2) * W * 0.5 * sT, 0, 0, Math.PI * 2); ctx.stroke();
    }
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
        ctx.font = `${Math.round(size * 0.07)}px 'Barlow Condensed', sans-serif`;
        ctx.fillText(b.dy > 0 ? '▴' : '▾', x + s * 1.3, y + s * 0.6);
      }
    }
    ctx.globalAlpha = 1;
    if (this.pulseT != null) {
      ctx.strokeStyle = `rgba(127, 208, 192, ${1 - this.pulseT / 1.2})`;
      ctx.lineWidth = size * 0.012;
      ctx.beginPath(); ctx.arc(c, c, R * Math.min(1, this.pulseT / 1.0), 0, Math.PI * 2); ctx.stroke();
    }

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
