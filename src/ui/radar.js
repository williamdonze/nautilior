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
   * Sonar volumétrique : le relief devant le sous-marin, dessiné en lignes de niveau (fil de fer
   * avec faces cachées), vu de trois quarts arrière. Tout ce qui dépasse la hauteur du sous-marin
   * passe à l'ambre : c'est un obstacle. Les bêtes ont une tige jusqu'au fond et leur distance.
   * Pas de fond : seules les lignes et les marqueurs sont dessinés par-dessus l'image.
   */
  update3d(dt, sub, contacts, colliders) {
    const range = stats.radarRange ?? 45;
    if (range !== this.lastRange) { this.lastRange = range; this.rangeEl.textContent = `${range} m`; }
    this.sweep = (this.sweep + dt * 0.45) % 1;
    const sin = Math.sin(sub.yaw), cos = Math.cos(sub.yaw), P = sub.position;
    const NR = 24, NC = 26, F0 = -range * 0.22, F1 = range, HW = range * 0.45;
    // Relief sondé quelques fois par seconde : hauteurs relatives au sous-marin, rochers et piliers compris
    this.scanTimer = (this.scanTimer ?? 0) - dt;
    if (this.scanTimer <= 0 || !this.heights) {
      this.scanTimer = 0.18;
      const Hh = (this.heights ??= new Float32Array((NR + 1) * (NC + 1)));
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NC; j++) {
        const lf = F1 + (F0 - F1) * (i / NR), lr = -HW + 2 * HW * (j / NC);
        Hh[i * (NC + 1) + j] = getFloorHeight(P.x + lf * sin - lr * cos, P.z + lf * cos + lr * sin) - P.y;
      }
      const cw = (2 * HW) / NC, ch = (F1 - F0) / NR;
      for (const c of colliders) {
        const dx = c.x - P.x, dz = c.z - P.z;
        if (c.r < 1.5 || dx * dx + dz * dz > range * range * 1.5) continue;
        const lf = dx * sin + dz * cos, lr = -dx * cos + dz * sin, top = c.y + c.r - P.y;
        const i0 = Math.round(((lf - F1) / (F0 - F1)) * NR), j0 = Math.round(((lr + HW) / (2 * HW)) * NC), n = Math.ceil(c.r / Math.min(cw, ch));
        for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
          if (i < 0 || i > NR || j < 0 || j > NC) continue;
          const k = i * (NC + 1) + j, d = Math.hypot((i - i0) * ch, (j - j0) * cw);
          if (d <= c.r) Hh[k] = Math.max(Hh[k], top - (d / c.r) * c.r * 0.4);
        }
      }
    }
    const Hh = this.heights, { ctx, canvas } = this, W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    // Caméra : derrière et au-dessus du sous-marin, plongeant vers l'avant
    // (cadrée sur la hauteur moyenne du fond ; le relief est accentué pour se lire d'un coup d'œil)
    let mean = 0;
    for (let k = 0; k < Hh.length; k++) mean += Hh[k];
    mean /= Hh.length;
    const T = 0.85, cT = Math.cos(T), sT = Math.sin(T), camY = mean + range * 0.55, camZ = -range * 0.95, FOC = W * 1.05, cx = W / 2, cy = H * 1.12, EX = 1.6;
    const proj = (lr, u, lf) => {
      const ry = mean + (u - mean) * EX - camY, rz = lf - camZ, d = Math.max(1, rz * cT - ry * sT);
      return [cx + (lr * FOC) / d, cy - ((ry * cT + rz * sT) * FOC) / d, d];
    };
    const px = Math.max(1, W / 420);
    ctx.lineJoin = 'round';
    const wave = F0 + this.sweep * (F1 - F0) * 1.1;
    const pts = (this._pts ??= new Float32Array((NC + 1) * 2)), prev = (this._prev ??= new Float32Array((NC + 1) * 2));
    for (let i = 0; i <= NR; i++) {
      const lf = F1 + (F0 - F1) * (i / NR);
      for (let j = 0; j <= NC; j++) {
        const q = proj(-HW + 2 * HW * (j / NC), Hh[i * (NC + 1) + j], lf);
        pts[j * 2] = q[0]; pts[j * 2 + 1] = q[1];
      }
      if (i > 0) {
        // face cachée : la bande entre deux lignes masque ce qui est derrière
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        for (let j = 1; j <= NC; j++) ctx.lineTo(prev[j * 2], prev[j * 2 + 1]);
        for (let j = NC; j >= 0; j--) ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2, 12, 14, 0.62)';
        ctx.fill();
      }
      const near = i / NR, lit = Math.max(0, 1 - Math.abs(lf - wave) / (range * 0.1));
      ctx.lineWidth = px * (0.9 + near * 0.9 + lit * 0.8);
      for (let j = 0; j < NC; j++) {
        // ambre si le relief arrive à la hauteur du sous-marin, turquoise sinon
        const h = Math.max(Hh[i * (NC + 1) + j], Hh[i * (NC + 1) + j + 1]);
        const danger = Math.max(0, Math.min(1, (h + 7) / 7));
        const a = (0.3 + 0.6 * near + 0.4 * lit) * (1 - Math.abs(j / NC - 0.5) * 0.7);
        ctx.strokeStyle = `rgba(${Math.round(90 + 165 * danger)}, ${Math.round(225 - 70 * danger)}, ${Math.round(200 - 150 * danger)}, ${Math.min(1, a)})`;
        ctx.beginPath(); ctx.moveTo(pts[j * 2], pts[j * 2 + 1]); ctx.lineTo(pts[j * 2 + 2], pts[j * 2 + 3]); ctx.stroke();
      }
      // lignes de fuite, discrètes
      if (i > 0) {
        ctx.strokeStyle = `rgba(110, 215, 195, ${0.1 + 0.16 * near})`; ctx.lineWidth = px * 0.7;
        ctx.beginPath();
        for (let j = 0; j <= NC; j += 2) { ctx.moveTo(prev[j * 2], prev[j * 2 + 1]); ctx.lineTo(pts[j * 2], pts[j * 2 + 1]); }
        ctx.stroke();
      }
      prev.set(pts);
    }
    // Contacts : marqueur, tige jusqu'au fond, distance pour ce qui est hostile
    ctx.font = `500 ${Math.round(W / 26)}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = 'center';
    for (const c of contacts) {
      const dx = c.x - P.x, dz = c.z - P.z, lf = dx * sin + dz * cos, lr = -dx * cos + dz * sin;
      if (lf < F0 || lf > F1 || Math.abs(lr) > HW) continue;
      const u = c.y - P.y, [x, y] = proj(lr, u, lf), [fx, fy] = proj(lr, getFloorHeight(c.x, c.z) - P.y, lf);
      const hostile = c.kind === 'creature', col = hostile ? '#ff6a4a' : c.kind === 'fish' ? '#9fe0f0' : (STYLE[c.kind] ?? STYLE.item).color;
      const s = px * (hostile ? 6 + Math.sin(this.sweep * 40) * 1.5 : 4);
      ctx.strokeStyle = ctx.fillStyle = col;
      ctx.lineWidth = px; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(fx, fy, s * 0.9, s * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      if (hostile) { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); ctx.closePath(); ctx.fill(); }
      else if (c.kind === 'fish') { ctx.arc(x, y, s * 0.8, 0, Math.PI * 2); ctx.fill(); }
      else if (c.kind === 'wreck') { ctx.lineWidth = px * 1.5; ctx.strokeRect(x - s, y - s, s * 2, s * 2); }
      else { ctx.lineWidth = px * 1.5; ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke(); }
      if (hostile) ctx.fillText(`${Math.round(Math.hypot(dx, dz, u))} m`, x, y - s - px * 3);
    }
    // Le sous-marin, sa tige jusqu'au fond, et l'onde de l'impulsion
    const [sx, sy] = proj(0, 0, 0), [gx, gy] = proj(0, getFloorHeight(P.x, P.z) - P.y, 0);
    ctx.strokeStyle = 'rgba(239, 227, 187, 0.6)'; ctx.lineWidth = px;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.fillStyle = '#efe3bb';
    ctx.beginPath(); ctx.moveTo(sx, sy - px * 9); ctx.lineTo(sx + px * 6, sy + px * 5); ctx.lineTo(sx, sy + px * 2); ctx.lineTo(sx - px * 6, sy + px * 5); ctx.closePath(); ctx.fill();
    if (this.pulseT != null) {
      const k = this.pulseT / 1.2;
      ctx.strokeStyle = `rgba(127, 208, 192, ${1 - k})`; ctx.lineWidth = px * 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, k * W * 0.55, k * W * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
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
