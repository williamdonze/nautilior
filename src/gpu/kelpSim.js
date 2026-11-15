/**
 * Physique des algues : chaque tige est une chaîne de 8 points.
 * Le point du bas est fixé au sol ; ceux du dessus sont poussés par la coque du sous-marin,
 * entraînés par son sillage, retenus par leurs voisins, et reviennent toujours à la verticale.
 * Feuilles et étincelles suivent la chaîne (fonction bend du shader).
 *
 * Seules les tiges proches du sous-marin sont simulées ; les autres sont au repos.
 * Résultat : une texture RGBA32F, 8 texels par tige (xyz = déplacement du point, w = hauteur de la tige).
 */
const NODES = 8, PER_ROW = 64;
const CELL = 10; // grille de recherche (m)
const REACH = 12; // distance d'éveil autour du sous-marin (m)

export class KelpSim {
  constructor(device, stalks) {
    this.device = device;
    this.stalks = stalks;
    const n = (this.n = stalks.length / 4);
    this.width = PER_ROW * NODES;
    this.height = Math.max(1, Math.ceil(n / PER_ROW));
    const data = (this.data = new Float32Array(this.width * this.height * 4));
    for (let i = 0; i < n; i++) data[i * NODES * 4 + 3] = stalks[i * 4 + 3];
    this.texture = device.createTexture({ size: [this.width, this.height], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: this.texture }, data, { bytesPerRow: this.width * 16 }, [this.width, this.height]);
    // Grille : cellule → tiges
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = this.key(stalks[i * 4], stalks[i * 4 + 2]);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(i);
    }
    this.active = new Map(); // tige → vitesses des points (8 × 3)
  }

  key(x, z) { return Math.floor(x / CELL) * 100003 + Math.floor(z / CELL); }

  /**
   * @param {number} dt
   * @param {{x,y,z}} pos centre du sous-marin   @param {{x,y,z}} vel sa vitesse
   * @param {{x,z}} fwd son avant (la coque est allongée : deux sphères, proue et poupe)
   * @param {number} radius rayon de la coque
   */
  update(dt, pos, vel, fwd, radius = 2.6) {
    dt = Math.min(dt, 1 / 30);
    const S = this.stalks, D = this.data;
    // Éveille les tiges proches
    const c0x = Math.floor((pos.x - REACH) / CELL), c1x = Math.floor((pos.x + REACH) / CELL), c0z = Math.floor((pos.z - REACH) / CELL), c1z = Math.floor((pos.z + REACH) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const l = this.grid.get(cx * 100003 + cz);
      if (!l) continue;
      for (const i of l) {
        if (this.active.has(i)) continue;
        const dx = S[i * 4] - pos.x, dz = S[i * 4 + 2] - pos.z;
        if (dx * dx + dz * dz < REACH * REACH && pos.y < S[i * 4 + 1] + S[i * 4 + 3] + radius + 1 && pos.y > S[i * 4 + 1] - radius - 1) this.active.set(i, new Float32Array(NODES * 3));
      }
    }
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    const ax = pos.x + fwd.x * 2.2, az = pos.z + fwd.z * 2.2, bx = pos.x - fwd.x * 2.2, bz = pos.z - fwd.z * 2.2;
    for (const [i, V] of this.active) {
      const o = i * NODES * 4, x0 = S[i * 4], y0 = S[i * 4 + 1], z0 = S[i * 4 + 2], H = S[i * 4 + 3];
      let energy = 0;
      for (let sub = 0; sub < 2; sub++) {
        const h = dt / 2;
        for (let k = 1; k < NODES; k++) {
          const p = o + k * 4, v = k * 3, t = k / (NODES - 1);
          let dx = D[p], dz = D[p + 2];
          // rappel vers la verticale (plus mou en haut), liaison avec les voisins, frottement de l'eau
          const ks = 3.2 * (1 - 0.55 * t), kc = 26;
          const nx = D[p - 4] - dx + (k < NODES - 1 ? D[p + 4] - dx : 0), nz = D[p - 2] - dz + (k < NODES - 1 ? D[p + 6] - dz : 0);
          V[v] += (-ks * dx + kc * nx - 2.4 * V[v]) * h;
          V[v + 2] += (-ks * dz + kc * nz - 2.4 * V[v + 2]) * h;
          dx += V[v] * h; dz += V[v + 2] * h;
          // la coque repousse le point (il glisse autour d'elle) et l'entraîne un peu
          const py = y0 + t * H + D[p + 1];
          for (let s = 0; s < 3; s++) {
            const cx = s === 0 ? ax : s === 1 ? bx : pos.x, cz = s === 0 ? az : s === 1 ? bz : pos.z;
            const qx = x0 + dx - cx, qy = py - pos.y, qz = z0 + dz - cz, d2 = qx * qx + qy * qy + qz * qz, R = radius + 0.5;
            if (d2 < R * R) {
              const hd = Math.hypot(qx, qz), want = Math.sqrt(Math.max(0.01, R * R - qy * qy));
              if (hd > 0.001) { dx += (qx / hd) * (want - hd); dz += (qz / hd) * (want - hd); } else { dx += fwd.z * want; dz -= fwd.x * want; }
              V[v] += (vel.x * 0.6 - V[v]) * 0.5; V[v + 2] += (vel.z * 0.6 - V[v + 2]) * 0.5;
            } else if (d2 < 36 && speed > 0.5) {
              // sillage : l'eau déplacée fait frémir les tiges voisines
              const w = (1 - d2 / 36) * h * 1.6;
              V[v] += vel.x * w; V[v + 2] += vel.z * w;
            }
          }
          // la tige ne s'allonge pas : un point écarté descend
          const m2 = dx * dx + dz * dz, len = t * H;
          D[p] = dx; D[p + 2] = dz;
          D[p + 1] = len > 0.01 ? Math.sqrt(Math.max(0, len * len - Math.min(m2, len * len * 0.9))) - len : 0;
          if (sub) energy += m2 + V[v] * V[v] + V[v + 2] * V[v + 2];
        }
      }
      this.device.queue.writeTexture({ texture: this.texture, origin: [(i % PER_ROW) * NODES, Math.floor(i / PER_ROW)] }, D, { offset: o * 4, bytesPerRow: NODES * 16 }, [NODES, 1]);
      // Rendort les tiges revenues au repos, loin du sous-marin
      const dx = x0 - pos.x, dz = z0 - pos.z;
      if (energy < 1e-4 && dx * dx + dz * dz > REACH * REACH) {
        for (let k = 1; k < NODES; k++) D[o + k * 4] = D[o + k * 4 + 1] = D[o + k * 4 + 2] = 0;
        this.device.queue.writeTexture({ texture: this.texture, origin: [(i % PER_ROW) * NODES, Math.floor(i / PER_ROW)] }, D, { offset: o * 4, bytesPerRow: NODES * 16 }, [NODES, 1]);
        this.active.delete(i);
      }
    }
  }
}
