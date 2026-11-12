import paletteData from '../config/palette.json';

/**
 * Images pixel des souvenirs, dessinées en code sur un petit canvas,
 * puis ramenées à la palette du jeu avec un dithering (même rendu que la 3D).
 */
export const ART_W = 160;
export const ART_H = 100;

const PALETTE = paletteData.colors.map((h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
});
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function quantize(ctx) {
  const img = ctx.getImageData(0, 0, ART_W, ART_H);
  const d = img.data;
  for (let y = 0; y < ART_H; y++) {
    for (let x = 0; x < ART_W; x++) {
      const i = (y * ART_W + x) * 4;
      const t = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 18;
      let best = PALETTE[0], bd = Infinity;
      for (const p of PALETTE) {
        const dr = (d[i] + t - p[0]) * 0.55, dg = (d[i + 1] + t - p[1]) * 0.8, db = (d[i + 2] + t - p[2]) * 0.45;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bd) { bd = dist; best = p; }
      }
      d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* --- petits outils de dessin --- */
const rect = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const disc = (c, col, x, y, r) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
const grad = (c, top, bottom, y0 = 0, y1 = ART_H) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, y0, ART_W, y1 - y0);
};
const text = (c, col, str, x, y, size = 8, align = 'left') => {
  c.fillStyle = col;
  c.font = `${size}px monospace`;
  c.textAlign = align;
  c.fillText(str, x, y);
};
/** Silhouette humaine simple */
const person = (c, col, x, y, s = 1) => {
  disc(c, col, x, y - 14 * s, 3 * s);
  rect(c, col, x - 3 * s, y - 11 * s, 6 * s, 8 * s);
  rect(c, col, x - 3 * s, y - 3 * s, 2 * s, 5 * s);
  rect(c, col, x + 1 * s, y - 3 * s, 2 * s, 5 * s);
};

const ART = {
  // Photo d'un quai plein de vie, cadre blanc
  photo(c) {
    rect(c, '#2a2c2e', 0, 0, ART_W, ART_H);
    rect(c, '#e8ece2', 22, 6, 116, 88);
    c.save(); c.beginPath(); c.rect(28, 12, 104, 70); c.clip();
    grad(c, '#efe3bb', '#b07a47', 12, 50);
    rect(c, '#5b8fc0', 28, 46, 104, 12); // mer
    for (let i = 0; i < 6; i++) { rect(c, '#9a9282', 30 + i * 18, 26, 14, 20); rect(c, '#63321b', 28 + i * 18, 22, 18, 5); rect(c, '#2f4a66', 34 + i * 18, 32, 4, 5); }
    rect(c, '#9a9282', 28, 58, 104, 24); // quai
    for (let i = 0; i < 14; i++) person(c, i % 3 ? '#4a463e' : '#7d6f48', 32 + i * 7.5, 74 + (i % 2) * 3, 0.6);
    person(c, '#22140d', 70, 80, 1.1);
    person(c, '#3e2114', 82, 80, 1.05);
    c.restore();
  },

  // Une main, un anneau d'or, une porte
  ring(c) {
    grad(c, '#17323b', '#05090d');
    rect(c, '#3e2114', 96, 8, 40, 92); // porte
    rect(c, '#22140d', 100, 12, 32, 84);
    disc(c, '#cdb57c', 128, 56, 2);
    rect(c, '#b9917a', 20, 52, 70, 18); // main
    for (let i = 0; i < 4; i++) rect(c, '#b9917a', 80 + i * 0, 44 + i * 7, 22, 6);
    c.strokeStyle = '#e0b050'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(90, 59, 3, 5, 0, 0, Math.PI * 2); c.stroke();
    disc(c, '#efe3bb', 89, 55, 1);
  },

  // Plaque d'identité gravée
  tag(c) {
    grad(c, '#2a5056', '#0c1a22');
    c.fillStyle = '#878a85';
    c.beginPath(); c.roundRect(40, 22, 80, 54, 10); c.fill();
    rect(c, '#a8bdb2', 44, 26, 72, 3);
    disc(c, '#2a5056', 52, 34, 4);
    for (let i = 0; i < 3; i++) rect(c, '#45484a', 62, 40 + i * 9, 48 - i * 8, 4);
    text(c, '#26292b', '14.10.84', 80, 72, 9, 'center');
    c.strokeStyle = '#5f6564'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(52, 34); c.quadraticCurveTo(30, 10, 10, 20); c.stroke();
  },

  // Carnet ouvert, dernière ligne d'une autre main
  logbook(c) {
    grad(c, '#11252e', '#05090d');
    rect(c, '#ccd8cc', 18, 14, 60, 76);
    rect(c, '#b9cbc2', 82, 14, 60, 76);
    rect(c, '#878a85', 78, 12, 4, 80);
    for (let i = 0; i < 7; i++) rect(c, '#2f4a66', 24, 22 + i * 9, 30 + ((i * 17) % 22), 2);
    for (let i = 0; i < 3; i++) rect(c, '#2f4a66', 88, 22 + i * 9, 40 - i * 6, 2);
    text(c, '#63321b', '17 h.', 88, 66, 9);
    for (let x = 0; x < 44; x += 4) rect(c, '#63321b', 88 + x, 72 + Math.sin(x) * 1.5, 3, 2);
  },

  // Coupure de journal
  newspaper(c) {
    rect(c, '#05090d', 0, 0, ART_W, ART_H);
    c.save(); c.translate(80, 50); c.rotate(-0.06); c.translate(-80, -50);
    rect(c, '#b9cbc2', 22, 8, 116, 86);
    text(c, '#17191a', 'OUEST-FRANCE', 80, 18, 8, 'center');
    rect(c, '#45484a', 26, 21, 108, 1);
    text(c, '#17191a', 'DISPARU EN MER', 80, 32, 10, 'center');
    rect(c, '#5f6564', 28, 38, 46, 34); // photo
    rect(c, '#9a9282', 28, 60, 46, 12);
    for (let i = 0; i < 4; i++) rect(c, '#26292b', 32 + i * 10, 56, 6, 3);
    for (let i = 0; i < 8; i++) rect(c, '#6b6e6c', 80, 40 + i * 6, 52 - (i % 3) * 6, 2);
    for (let i = 0; i < 2; i++) rect(c, '#6b6e6c', 28, 78 + i * 6, 104, 2);
    c.restore();
  },

  // Montre de plongée arrêtée à 4 h 12
  watch(c) {
    grad(c, '#0c1a22', '#020407');
    rect(c, '#26292b', 70, 0, 20, 100); // bracelet
    disc(c, '#878a85', 80, 50, 32);
    disc(c, '#17191a', 80, 50, 27);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      disc(c, '#ccd8cc', 80 + Math.sin(a) * 22, 50 - Math.cos(a) * 22, i % 3 ? 1 : 2);
    }
    c.strokeStyle = '#efe3bb'; c.lineWidth = 3;
    const h = ((4 + 12 / 60) / 12) * Math.PI * 2, m = (12 / 60) * Math.PI * 2;
    c.beginPath(); c.moveTo(80, 50); c.lineTo(80 + Math.sin(h) * 13, 50 - Math.cos(h) * 13); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(80, 50); c.lineTo(80 + Math.sin(m) * 21, 50 - Math.cos(m) * 21); c.stroke();
    c.strokeStyle = '#a8bdb2'; c.lineWidth = 1; // verre fendu
    c.beginPath(); c.moveTo(62, 30); c.lineTo(78, 46); c.lineTo(74, 70); c.stroke();
  },

  // Plaque de granit et fleurs fanées
  memorial(c) {
    grad(c, '#26292b', '#05090d');
    rect(c, '#5f6564', 30, 10, 100, 66);
    rect(c, '#6b6e6c', 34, 14, 92, 58);
    text(c, '#26292b', 'À NOS DISPARUS', 80, 26, 8, 'center');
    text(c, '#26292b', 'EN MER', 80, 35, 8, 'center');
    for (let i = 0; i < 3; i++) rect(c, '#3f4446', 50, 44 + i * 8, 60, 3);
    for (let i = 0; i < 7; i++) {
      rect(c, '#2c4430', 44 + i * 11, 78, 1, 14);
      disc(c, i % 2 ? '#63321b' : '#7a5a26', 44 + i * 11, 78, 3);
    }
  },
};

/** Dessine l'image d'un souvenir dans un canvas (taille ART_W × ART_H) */
export function drawMemory(key, canvas) {
  canvas.width = ART_W;
  canvas.height = ART_H;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  (ART[key] ?? ART.photo)(c);
  quantize(c);
}
