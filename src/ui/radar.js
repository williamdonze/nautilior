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

  update(dt, sub, contacts, colliders = [], movers = []) {
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
    if (mode3d) return this.update3d(dt, sub, contacts, colliders, movers);
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
   * Prépare le nuage de points du monde fixe : on prélève des sommets sur les épaves, les rochers,
   * les piliers et les arches, rangés dans une grille pour retrouver vite ceux qui sont à portée.
   * @param {THREE.Object3D} root décor de la plongée
   */
  setWorld(root) {
    root.updateMatrixWorld(true);
    const CELL = 24, grid = (this.worldGrid = new Map());
    const put = (x, y, z) => {
      const k = Math.floor(x / CELL) * 4099 + Math.floor(z / CELL);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(x, y, z);
    };
    const e = new Float32Array(16);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      const kind = o.material?.userData?.detail;
      if (kind === 'sand' || kind === 'coral' || kind === 'sponge' || o.material?.wireframe) return;
      const pos = o.geometry.attributes.position, n = pos.count;
      const sample = (m, budget, minSize) => {
        const sc = Math.hypot(m[0], m[1], m[2]);
        if (sc * (o.geometry.boundingSphere?.radius ?? 1) < minSize) return;
        const step = Math.max(1, Math.floor(n / budget));
        for (let i = 0; i < n; i += step) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
      };
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.isInstancedMesh) {
        const w = o.matrixWorld.elements, a = o.instanceMatrix.array;
        for (let k = 0; k < o.count; k++) {
          // matrice monde × matrice d'instance
          for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) e[c * 4 + r] = w[r] * a[k * 16 + c * 4] + w[4 + r] * a[k * 16 + c * 4 + 1] + w[8 + r] * a[k * 16 + c * 4 + 2] + w[12 + r] * a[k * 16 + c * 4 + 3];
          sample(e, 90, 2.2);
        }
      } else sample(o.matrixWorld.elements, 700, 1.2);
    });
    this.worldCell = CELL;
  }

  /**
   * Sonar volumétrique : un nuage de points serrés, comme un relevé bathymétrique.
   * Le fond, les épaves, les rochers et les bêtes sont faits de points ; la couleur dit la hauteur
   * (bleu = profond, vert, jaune, rouge = à hauteur du sous-marin ou au-dessus). Les bêtes hostiles
   * sont rouges vif, les paisibles blanches. Vue de trois quarts arrière, l'avant vers le haut.
   */
  update3d(dt, sub, contacts, colliders, movers = []) {
    const range = stats.radarRange ?? 45;
    if (range !== this.lastRange) { this.lastRange = range; this.rangeEl.textContent = `${range} m`; }
    const sin = Math.sin(sub.yaw), cos = Math.cos(sub.yaw), P = sub.position;
    // --- Relevé (quelques fois par seconde) : points du fond sur une grille fixe dans le monde,
    //     plus les points des épaves et des rochers à portée
    this.scanTimer = (this.scanTimer ?? 0) - dt;
    if (this.scanTimer <= 0 || !this.cloud) {
      this.scanTimer = 0.3;
      const pts = (this.cloud ??= []);
      pts.length = 0;
      const step = range / 34, x0 = Math.floor((P.x - range) / step) * step, z0 = Math.floor((P.z - range) / step) * step;
      for (let x = x0; x <= P.x + range; x += step) for (let z = z0; z <= P.z + range; z += step) {
        // léger décalage fixe par point : pas d'alignement en grille visible
        const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, jx = (h - Math.floor(h) - 0.5) * step * 0.8, jz = ((h * 7.13) % 1) * step * 0.4;
        const wx = x + jx, wz = z + jz, dx = wx - P.x, dz = wz - P.z;
        if (dx * dx + dz * dz > range * range) continue;
        pts.push(wx, getFloorHeight(wx, wz), wz);
      }
      this.nFloor = pts.length;
      if (this.worldGrid) {
        const C = this.worldCell, r2 = range * range;
        for (let cx = Math.floor((P.x - range) / C); cx <= Math.floor((P.x + range) / C); cx++) for (let cz = Math.floor((P.z - range) / C); cz <= Math.floor((P.z + range) / C); cz++) {
          const l = this.worldGrid.get(cx * 4099 + cz);
          if (!l) continue;
          for (let i = 0; i < l.length; i += 3) { const dx = l[i] - P.x, dz = l[i + 2] - P.z; if (dx * dx + dz * dz < r2) pts.push(l[i], l[i + 1], l[i + 2]); }
        }
      }
    }
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height, pts = this.cloud;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 3, 8, 0.72)';
    ctx.fillRect(0, 0, W, H);
    // --- Projection : caméra derrière et au-dessus, qui plonge vers le sous-marin
    const T = 0.95, cT = Math.cos(T), sT = Math.sin(T), D = range * 2.1, FOC = W * 1.25, cx = W / 2, cy = H * 0.5;
    const proj = (wx, wy, wz) => {
      const dx = wx - P.x, dz = wz - P.z, lf = dx * sin + dz * cos, lr = -dx * cos + dz * sin, u = wy - P.y;
      const d = D + lf * cT - u * sT;
      return [cx - (lr * FOC) / d, cy - ((u * cT + lf * sT) * FOC) / d, d];
    };
    // Palette « jet » selon la hauteur par rapport au sous-marin : −0,6 portée (bleu) … +0,1 portée (rouge)
    const jet = (u) => {
      const t = Math.max(0, Math.min(1, (u + range * 0.6) / (range * 0.7)));
      const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3))), g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2))), b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
      return `rgb(${Math.round(40 + 215 * r)}, ${Math.round(60 + 195 * g)}, ${Math.round(90 + 165 * b)})`;
    };
    const px = Math.max(1.6, W / 300);
    // on dessine par bandes de hauteur pour ne changer de couleur que quelques fois
    const bands = (this.bands ??= Array.from({ length: 14 }, () => []));
    for (const b of bands) b.length = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const q = proj(pts[i], pts[i + 1], pts[i + 2]);
      if (q[0] < 0 || q[0] > W || q[1] < 0 || q[1] > H) continue;
      const u = pts[i + 1] - P.y, k = Math.max(0, Math.min(13, Math.floor(((u + range * 0.6) / (range * 0.7)) * 14)));
      bands[k].push(q[0], q[1], i >= this.nFloor ? 1.35 : 1);
    }
    bands.forEach((b, k) => {
      ctx.fillStyle = jet(((k + 0.5) / 14) * range * 0.7 - range * 0.6);
      for (let i = 0; i < b.length; i += 3) { const s = px * b[i + 2]; ctx.fillRect(b[i] - s / 2, b[i + 1] - s / 2, s, s); }
    });
    // --- Ce qui bouge : chaque bête est dessinée avec les points de son propre corps
    const v = [0, 0, 0];
    for (const m of movers) {
      const o = m.object, dx = o.position.x - P.x, dz = o.position.z - P.z;
      if (dx * dx + dz * dz > range * range) continue;
      ctx.fillStyle = m.hostile ? '#ff4a3a' : '#f0f6ff';
      const s = px * (m.hostile ? 1.7 : 1.4);
      o.traverse((c) => {
        const pos = c.isMesh && c.geometry?.attributes.position;
        if (!pos) return;
        const e = c.matrixWorld.elements, n = c.isInstancedMesh ? 0 : pos.count, st = Math.max(1, Math.floor(n / 70));
        for (let i = 0; i < n; i += st) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const q = proj(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
          ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s);
        }
      });
      // corps en chaîne (le ver) : un anneau de points par tronçon
      if (m.chain) for (let k = 0; k < m.chain.length; k++) {
        const c = m.chain[k], rr = m.radius * (1 - 0.7 * Math.pow(k / m.chain.length, 2.2));
        for (let i = 0; i < 7; i++) { const a = i * 0.9 + k, q = proj(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, c.z); ctx.fillRect(q[0] - s / 2, q[1] - s / 2, s, s); }
      }
      if (m.hostile) {
        const q = proj(o.position.x, o.position.y, o.position.z);
        ctx.font = `600 ${Math.round(W / 30)}px 'Barlow Condensed', sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(Math.hypot(dx, dz, o.position.y - P.y))} m`, q[0], q[1] - px * 6);
      }
    }
    // --- Repères : objets importants, épaves, portail
    ctx.lineWidth = Math.max(1, px * 0.7);
    for (const c of contacts) {
      if (c.kind === 'creature' || c.kind === 'fish') continue;
      const dx = c.x - P.x, dz = c.z - P.z;
      if (dx * dx + dz * dz > range * range) continue;
      const q = proj(c.x, c.y + 1, c.z), s = px * 3.2;
      ctx.strokeStyle = ctx.fillStyle = c.kind === 'fragment' ? '#ffffff' : c.kind === 'wreck' ? '#ffd27a' : '#ffe46a';
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - s); ctx.lineTo(q[0] + s, q[1]); ctx.lineTo(q[0], q[1] + s); ctx.lineTo(q[0] - s, q[1]); ctx.closePath();
      if (c.kind === 'wreck') ctx.stroke(); else ctx.fill();
    }
    // --- Le sous-marin : flèche blanche, sa tige jusqu'au fond, un cercle de 20 m pour l'échelle
    const a = proj(P.x, P.y, P.z), f = proj(P.x, getFloorHeight(P.x, P.z), P.z);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(f[0], f[1]); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) { const t = (k / 40) * Math.PI * 2, q = proj(P.x + Math.cos(t) * 20, P.y, P.z + Math.sin(t) * 20); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
    const n1 = proj(P.x + sin * 5, P.y, P.z + cos * 5), l1 = proj(P.x - sin * 3 - cos * 2.6, P.y, P.z - cos * 3 + sin * 2.6), r1 = proj(P.x - sin * 3 + cos * 2.6, P.y, P.z - cos * 3 - sin * 2.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(n1[0], n1[1]); ctx.lineTo(l1[0], l1[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(r1[0], r1[1]); ctx.closePath(); ctx.fill();
    ctx.font = `500 ${Math.round(W / 34)}px 'Barlow Condensed', sans-serif`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('20 m', proj(P.x + cos * 20, P.y, P.z - sin * 20)[0] + px * 2, proj(P.x + cos * 20, P.y, P.z - sin * 20)[1]);
    // légende des couleurs
    for (let k = 0; k < 14; k++) { ctx.fillStyle = jet(((k + 0.5) / 14) * range * 0.7 - range * 0.6); ctx.fillRect(px * 4, H - px * 6 - (k + 1) * px * 5, px * 4, px * 5); }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('haut', px * 11, H - px * 6 - 13 * px * 5); ctx.fillText('profond', px * 11, H - px * 8);
    if (this.pulseT != null) {
      const k = this.pulseT / 1.2;
      ctx.strokeStyle = `rgba(127, 208, 192, ${1 - k})`; ctx.lineWidth = px * 2;
      ctx.beginPath(); ctx.ellipse(a[0], a[1], k * W * 0.5, k * W * 0.5 * cT, 0, 0, Math.PI * 2); ctx.stroke();
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
