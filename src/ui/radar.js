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
const DENSITY = 0.22; // points de l'écho par m² de surface (fond, falaises, rochers, épaves : partout pareil)
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
      this.canvas.height = px;
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
    // Sonar volumétrique (amélioration) : il tient à jour le relevé qu'allume l'écho (touche R)
    if (stats.sonar3d) this.scan(dt, sub);
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
   * Prépare le nuage de points du monde fixe (épaves, rochers, piliers, arches) pour l'écho du sonar.
   * Les points sont tirés au hasard SUR les triangles, en proportion de leur surface : la densité est
   * la même partout (DENSITY points par m²), quelle que soit la finesse du maillage.
   * @param {THREE.Object3D} root décor de la plongée
   */
  setWorld(root) {
    root.updateMatrixWorld(true);
    const CELL = 24, grid = (this.worldGrid = new Map());
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const put = (x, y, z) => {
      const k = Math.floor(x / CELL) * 4099 + Math.floor(z / CELL);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(x, y, z);
    };
    const e = new Float32Array(16), A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
    const tf = (m, pos, i, out) => {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    };
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      const kind = o.material?.userData?.detail;
      if (kind === 'sand' || kind === 'coral' || kind === 'sponge' || o.material?.wireframe) return;
      const geo = o.geometry, pos = geo.attributes.position, idx = geo.index?.array, nTri = (idx ? idx.length : pos.count) / 3;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const sample = (m, minSize) => {
        if (Math.hypot(m[0], m[1], m[2]) * geo.boundingSphere.radius < minSize) return;
        for (let t = 0; t < nTri; t++) {
          tf(m, pos, idx ? idx[t * 3] : t * 3, A); tf(m, pos, idx ? idx[t * 3 + 1] : t * 3 + 1, B); tf(m, pos, idx ? idx[t * 3 + 2] : t * 3 + 2, C);
          const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
          const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
          // nombre de points = surface × densité (arrondi au hasard pour ne pas perdre les petits triangles)
          let n = area * DENSITY;
          n = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
          for (let q = 0; q < n; q++) {
            let a = rnd(), b = rnd();
            if (a + b > 1) { a = 1 - a; b = 1 - b; }
            put(A[0] + ux * a + vx * b, A[1] + uy * a + vy * b, A[2] + uz * a + vz * b);
          }
        }
      };
      if (o.isInstancedMesh) {
        const w = o.matrixWorld.elements, a = o.instanceMatrix.array;
        for (let k = 0; k < o.count; k++) {
          // matrice monde × matrice d'instance
          for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) e[c * 4 + r] = w[r] * a[k * 16 + c * 4] + w[4 + r] * a[k * 16 + c * 4 + 1] + w[8 + r] * a[k * 16 + c * 4 + 2] + w[12 + r] * a[k * 16 + c * 4 + 3];
          sample(e, 1.6);
        }
      } else sample(o.matrixWorld.elements, 1.0);
    });
    this.worldCell = CELL;
  }

  /**
   * Relevé pour l'écho : les points du fond autour du sous-marin, puis ceux des objets fixes à portée.
   * Le fond est sondé sur une grille fixe dans le monde ; sur les pentes et les falaises, on ajoute des
   * points en proportion de la surface réelle, pour garder partout la même densité.
   * Résultat : this.cloud (x, y, z…) ; this.nFloor = fin des points du fond.
   */
  scan(dt, sub) {
    this.scanTimer = (this.scanTimer ?? 0) - dt;
    if (this.scanTimer > 0 && this.cloud) return;
    this.scanTimer = 0.5;
    const range = stats.radarRange ?? 45, P = sub.position, r2 = range * range;
    const pts = (this.cloud ??= []);
    pts.length = 0;
    const step = 1 / Math.sqrt(DENSITY), n = Math.ceil((2 * range) / step) + 2;
    const x0 = Math.floor((P.x - range) / step) * step, z0 = Math.floor((P.z - range) / step) * step;
    const H = this._h?.length === n * n ? this._h : (this._h = new Float32Array(n * n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i * n + j] = getFloorHeight(x0 + i * step, z0 + j * step);
    for (let i = 1; i < n - 1; i++) for (let j = 1; j < n - 1; j++) {
      const x = x0 + i * step, z = z0 + j * step, dx = x - P.x, dz = z - P.z;
      if (dx * dx + dz * dz > r2) continue;
      // décalage fixe par point : pas d'alignement en grille visible
      const hsh = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, jx = (hsh - Math.floor(hsh) - 0.5) * step * 0.7, jz = (((hsh * 7.13) % 1 + 1) % 1 - 0.5) * step * 0.7;
      const gx = (H[(i + 1) * n + j] - H[(i - 1) * n + j]) / (2 * step), gz = (H[i * n + j + 1] - H[i * n + j - 1]) / (2 * step);
      pts.push(x + jx, H[i * n + j] + gx * jx + gz * jz, z + jz);
      // pente : la surface réelle de la maille vaut √(1 + pente²) fois sa surface au sol
      const extra = Math.min(40, Math.round(Math.sqrt(1 + gx * gx + gz * gz) - 1));
      for (let q = 1; q <= extra; q++) {
        const fx = (((hsh * (q + 1.37)) % 1 + 1) % 1 - 0.5) * step, fz = (((hsh * (q * 2.11 + 0.5)) % 1 + 1) % 1 - 0.5) * step;
        pts.push(x + fx, getFloorHeight(x + fx, z + fz), z + fz);
      }
    }
    this.nFloor = pts.length;
    if (this.worldGrid) {
      const Cc = this.worldCell;
      for (let cx = Math.floor((P.x - range) / Cc); cx <= Math.floor((P.x + range) / Cc); cx++) for (let cz = Math.floor((P.z - range) / Cc); cz <= Math.floor((P.z + range) / Cc); cz++) {
        const l = this.worldGrid.get(cx * 4099 + cz);
        if (!l) continue;
        for (let q = 0; q < l.length; q += 3) { const dx = l[q] - P.x, dz = l[q + 2] - P.z; if (dx * dx + dz * dz < r2) pts.push(l[q], l[q + 1], l[q + 2]); }
      }
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
