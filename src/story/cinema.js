/**
 * Cinématiques plein écran dessinées en 2D (fin « Traverser ») :
 *  tunnel()   : le Nautiliar file dans un tunnel de lumière et de débris ;
 *  synapses() : le noir complet, puis de petits éclairs qui se ramifient, comme un cerveau qui se rallume ;
 *  awaken()   : des paupières s'ouvrent sur un plafond d'hôpital, flou d'abord — le réveil, vu par ses yeux.
 * Tout est dessiné sur un canvas posé par-dessus le jeu (#cine), retiré par close().
 */
const TAU = Math.PI * 2;
let canvas = null, ctx = null;

function open() {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'cine';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:16;background:#000';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }
  canvas.width = Math.min(1600, innerWidth);
  canvas.height = Math.round((canvas.width * innerHeight) / innerWidth);
  canvas.style.display = 'block';
  return ctx;
}
export function close() {
  if (canvas) canvas.style.display = 'none';
}

/** Boucle d'animation : draw(t de 0 à 1, temps écoulé, dt) pendant `seconds` */
function play(seconds, draw) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    const frame = (now) => {
      const el = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(Math.min(1, el / seconds), el, dt);
      if (el < seconds) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}
const rnd = (a, b) => a + Math.random() * (b - a);

/** Le sous-marin vu de l'arrière : coque, empennage, tuyère, hélice qui tourne */
function drawSub(c, x, y, s, time, glow) {
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(time * 1.7) * 0.06);
  c.scale(s, s);
  // halo de la lumière qui vient d'en face
  const g = c.createRadialGradient(0, 0, 10, 0, 0, 150);
  g.addColorStop(0, `rgba(200,255,220,${0.5 * glow})`);
  g.addColorStop(1, 'rgba(200,255,220,0)');
  c.fillStyle = g;
  c.fillRect(-160, -160, 320, 320);
  c.fillStyle = '#05090b';
  c.strokeStyle = `rgba(190,255,215,${0.8 * glow})`;
  c.lineWidth = 2.5;
  // empennage en croix
  for (const [w, h] of [[150, 9], [9, 120]]) { c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, TAU); c.fill(); c.stroke(); }
  // coque
  c.beginPath(); c.ellipse(0, 0, 58, 62, 0, 0, TAU); c.fill(); c.stroke();
  // kiosque
  c.beginPath(); c.ellipse(0, -66, 20, 26, 0, 0, TAU); c.fill(); c.stroke();
  // tuyère et hélice
  c.lineWidth = 5;
  c.beginPath(); c.arc(0, 0, 40, 0, TAU); c.stroke();
  c.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = time * 14 + (i * TAU) / 4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); c.stroke();
  }
  c.restore();
}

/** Tunnel de lumière et de débris */
export function tunnel(seconds = 9, sound = null) {
  const c = open(), W = canvas.width, H = canvas.height, cx = W / 2, cy = H * 0.47, R = Math.hypot(W, H) * 0.6;
  const streaks = Array.from({ length: 320 }, () => ({ a: rnd(0, TAU), z: rnd(0.05, 1), v: rnd(0.5, 1.4), hue: Math.random() }));
  const debris = Array.from({ length: 46 }, () => ({ a: rnd(0, TAU), z: rnd(0.1, 1), v: rnd(0.25, 0.7), rot: rnd(0, TAU), w: rnd(-3, 3), n: 3 + Math.floor(rnd(0, 4)), s: rnd(0.5, 1.6), plank: Math.random() < 0.3 }));
  const rings = Array.from({ length: 16 }, (_, i) => ({ z: (i + 0.5) / 16, seed: rnd(0, 100) }));
  return play(seconds, (t, el, dt) => {
    const speed = 0.35 + t * t * 2.4; // ça accélère jusqu'au bout
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `rgba(0, 6, 4, ${0.5 - t * 0.2})`;
    c.fillRect(0, 0, W, H);
    // lumière au bout
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * (0.25 + t * 0.9));
    g.addColorStop(0, `rgba(235, 255, 240, ${0.75 + t * 0.25})`);
    g.addColorStop(0.25, `rgba(120, 240, 160, ${0.35 + t * 0.3})`);
    g.addColorStop(1, 'rgba(0, 20, 10, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    // anneaux : les parois du tunnel défilent
    for (const r of rings) {
      r.z -= dt * speed * 0.45;
      if (r.z <= 0.02) { r.z += 1; r.seed = rnd(0, 100); }
      const rad = (R * 0.09) / r.z;
      c.strokeStyle = `rgba(90, 230, 150, ${Math.min(0.5, (1 - r.z) * 0.6)})`;
      c.lineWidth = 1 + (1 - r.z) * 6;
      c.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * TAU, rr = rad * (1 + Math.sin(a * 5 + r.seed) * 0.08 + Math.sin(a * 11 + r.seed * 2 + el) * 0.04);
        if (k) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9);
      }
      c.stroke();
    }
    // traits de lumière
    for (const s of streaks) {
      const z0 = s.z;
      s.z -= dt * speed * s.v;
      if (s.z <= 0.03) { s.z = 1; s.a = rnd(0, TAU); continue; }
      const r0 = (R * 0.06) / z0, r1 = (R * 0.06) / s.z;
      c.strokeStyle = s.hue < 0.3 ? `rgba(255,255,255,${(1 - s.z) * 0.9})` : `rgba(120,255,170,${(1 - s.z) * 0.7})`;
      c.lineWidth = 0.6 + (1 - s.z) * 2.6;
      c.beginPath(); c.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); c.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); c.stroke();
    }
    // débris : pierres, planches, ce que la mer gardait
    c.globalCompositeOperation = 'source-over';
    for (const d of debris) {
      d.z -= dt * speed * d.v;
      d.rot += dt * d.w;
      if (d.z <= 0.04) { d.z = 1; d.a = rnd(0, TAU); }
      const rad = (R * 0.075) / d.z, x = cx + Math.cos(d.a) * rad, y = cy + Math.sin(d.a) * rad, size = (9 * d.s) / d.z;
      c.save();
      c.translate(x, y); c.rotate(d.rot);
      c.fillStyle = '#020605';
      c.strokeStyle = `rgba(150, 255, 190, ${0.55 * (1 - d.z)})`;
      c.lineWidth = 1.5;
      c.beginPath();
      if (d.plank) c.rect(-size * 1.6, -size * 0.25, size * 3.2, size * 0.5);
      else for (let k = 0; k < d.n + 2; k++) { const a = (k / (d.n + 2)) * TAU, rr = size * (0.6 + 0.4 * Math.sin(k * 2.3 + d.s * 9)); if (k) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // le Nautiliar, de dos, qui s'éloigne vers la lumière
    const far = Math.pow(t, 1.6);
    drawSub(c, cx + Math.sin(el * 0.9) * 20 * (1 - far), cy + H * 0.2 * (1 - far) + Math.sin(el * 1.3) * 8, (W / 1400) * (1.5 - far * 1.35), el, 0.5 + t * 0.5);
    // tout se dissout dans le blanc à la fin
    if (t > 0.82) { c.fillStyle = `rgba(240, 255, 245, ${(t - 0.82) / 0.18})`; c.fillRect(0, 0, W, H); }
    if (sound && Math.random() < dt * (1 + t * 6)) sound.crackle?.(0.4 + t * 0.6);
  });
}

/** Fondu de l'image courante vers le noir complet */
export function blackout(seconds = 1.5) {
  const c = open(), W = canvas.width, H = canvas.height;
  return play(seconds, () => { c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, 0, W, H); }).then(() => { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); });
}

/** Éclair qui se ramifie (récursif) */
function bolt(c, x, y, a, len, w, depth) {
  let px = x, py = y;
  c.lineWidth = w;
  c.beginPath(); c.moveTo(px, py);
  const n = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    a += rnd(-0.6, 0.6);
    px += Math.cos(a) * len / n; py += Math.sin(a) * len / n;
    c.lineTo(px, py);
    if (depth > 0 && Math.random() < 0.4) { c.stroke(); bolt(c, px, py, a + rnd(-1.2, 1.2), len * rnd(0.4, 0.7), w * 0.6, depth - 1); c.lineWidth = w; c.beginPath(); c.moveTo(px, py); }
  }
  c.stroke();
  // bouton au bout : la jonction qui s'allume
  c.beginPath(); c.arc(px, py, w * 1.6, 0, TAU); c.fill();
}

/** Le noir, puis des éclairs fins qui se répondent : quelque chose se rallume */
export function synapses(seconds = 7, sound = null) {
  const c = open(), W = canvas.width, H = canvas.height;
  let next = 0.8;
  return play(seconds, (t, el, dt) => {
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(0, 0, 0, 0.16)'; // les éclairs laissent une trace qui s'éteint
    c.fillRect(0, 0, W, H);
    next -= dt;
    if (next <= 0 && t < 0.93) {
      next = Math.max(0.05, 0.9 - t * 1.0) * rnd(0.4, 1.2); // de plus en plus rapprochés
      const n = 1 + Math.floor(t * 4 * Math.random());
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const big = Math.random() < 0.15 + t * 0.2;
        c.shadowColor = '#9fd0ff'; c.shadowBlur = big ? 28 : 14;
        c.strokeStyle = c.fillStyle = big ? 'rgba(235, 245, 255, 0.95)' : 'rgba(170, 205, 255, 0.8)';
        bolt(c, rnd(W * 0.1, W * 0.9), rnd(H * 0.1, H * 0.9), rnd(0, TAU), rnd(60, 260) * (big ? 1.6 : 1) * (W / 1400), big ? 2.4 : 1.2, big ? 3 : 2);
      }
      c.shadowBlur = 0;
      sound?.crackle?.(0.3 + t * 0.5);
    }
    if (t > 0.93) { c.fillStyle = `rgba(0,0,0,${(t - 0.93) / 0.07})`; c.fillRect(0, 0, W, H); }
  });
}

/** Forme d'un battement sur le moniteur */
const ecg = (p) => 0.12 * Math.exp(-(((p - 0.12) / 0.03) ** 2)) - 0.15 * Math.exp(-(((p - 0.28) / 0.008) ** 2)) + Math.exp(-(((p - 0.3) / 0.01) ** 2)) - 0.3 * Math.exp(-(((p - 0.32) / 0.01) ** 2)) + 0.22 * Math.exp(-(((p - 0.52) / 0.05) ** 2));

/** La chambre, vue du lit : plafond, néon, potence de perfusion, moniteur, une silhouette penchée, des mains */
function drawRoom(r, W, H, el, lean) {
  const g = r.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#cfd8d2'); g.addColorStop(0.55, '#b3c0ba'); g.addColorStop(1, '#8d9c97');
  r.fillStyle = g; r.fillRect(0, 0, W, H);
  // dalles du plafond, en perspective (on est couché : le plafond remplit l'image)
  r.strokeStyle = 'rgba(110, 125, 120, 0.5)'; r.lineWidth = 2;
  const vx = W * 0.5, vy = H * 1.25;
  for (let i = -8; i <= 8; i++) { r.beginPath(); r.moveTo(vx + i * W * 0.02, vy); r.lineTo(vx + i * W * 0.22, -H * 0.1); r.stroke(); }
  for (let j = 0; j < 7; j++) { const y = H * (0.02 + 0.72 * Math.pow(j / 6, 1.7)); r.beginPath(); r.moveTo(0, y); r.lineTo(W, y); r.stroke(); }
  // néon
  r.save();
  r.shadowColor = '#ffffff'; r.shadowBlur = 90;
  r.fillStyle = '#ffffff';
  r.beginPath(); r.moveTo(W * 0.36, H * 0.12); r.lineTo(W * 0.64, H * 0.12); r.lineTo(W * 0.68, H * 0.24); r.lineTo(W * 0.32, H * 0.24); r.closePath(); r.fill();
  r.restore();
  // rideau à gauche
  const cg = r.createLinearGradient(0, 0, W * 0.16, 0);
  cg.addColorStop(0, '#6f8f8a'); cg.addColorStop(1, 'rgba(120, 150, 145, 0)');
  r.fillStyle = cg; r.fillRect(0, 0, W * 0.16, H);
  // potence et poche de perfusion
  r.strokeStyle = '#7d8a88'; r.lineWidth = 7;
  r.beginPath(); r.moveTo(W * 0.2, H); r.lineTo(W * 0.2, H * 0.2); r.lineTo(W * 0.26, H * 0.2); r.stroke();
  r.fillStyle = 'rgba(225, 240, 235, 0.85)'; r.strokeStyle = '#93a3a0'; r.lineWidth = 3;
  r.beginPath(); r.roundRect(W * 0.235, H * 0.22, W * 0.05, H * 0.17, 12); r.fill(); r.stroke();
  r.strokeStyle = 'rgba(200, 220, 215, 0.9)'; r.lineWidth = 2.5;
  r.beginPath(); r.moveTo(W * 0.26, H * 0.39); r.bezierCurveTo(W * 0.26, H * 0.7, W * 0.36, H * 0.75, W * 0.4, H); r.stroke();
  // moniteur cardiaque : le tracé qui défile, et le chiffre
  const mx = W * 0.74, my = H * 0.36, mw = W * 0.19, mh = H * 0.2;
  r.fillStyle = '#2c3433'; r.beginPath(); r.roundRect(mx - 10, my - 10, mw + 20, mh + 20, 10); r.fill();
  r.fillStyle = '#07120e'; r.fillRect(mx, my, mw, mh);
  r.strokeStyle = '#5dff8a'; r.lineWidth = 3; r.shadowColor = '#5dff8a'; r.shadowBlur = 10;
  r.beginPath();
  for (let k = 0; k <= 120; k++) {
    const u = k / 120, ph = (((el * 0.93 - (1 - u) * 2.2) % 1) + 1) % 1;
    const y = my + mh * 0.62 - ecg(ph) * mh * 0.45;
    if (k) r.lineTo(mx + u * mw * 0.74, y); else r.moveTo(mx + u * mw * 0.74, y);
  }
  r.stroke();
  r.shadowBlur = 0;
  r.fillStyle = '#5dff8a'; r.font = `600 ${Math.round(mh * 0.34)}px 'Barlow Condensed', sans-serif`;
  r.fillText('56', mx + mw * 0.78, my + mh * 0.45);
  r.strokeStyle = '#59605f'; r.lineWidth = 6; r.beginPath(); r.moveTo(mx + mw / 2, my + mh + 10); r.lineTo(mx + mw / 2, H); r.stroke();
  // quelqu'un se penche (elle entre dans l'image quand il ouvre les yeux pour de bon)
  const ax = W * (1.06 - lean * 0.36), ay = H * (0.74 - lean * 0.1);
  r.fillStyle = '#3a2a24'; r.beginPath(); r.ellipse(ax, ay - H * 0.02, W * 0.085, H * 0.155, -0.2, 0, TAU); r.fill(); // cheveux
  r.fillStyle = '#d9b9a4'; r.beginPath(); r.ellipse(ax - W * 0.012, ay + H * 0.005, W * 0.058, H * 0.115, -0.15, 0, TAU); r.fill(); // visage
  r.fillStyle = '#3a2a24'; r.beginPath(); r.ellipse(ax + W * 0.02, ay - H * 0.07, W * 0.07, H * 0.07, -0.3, 0, TAU); r.fill(); // frange
  r.fillStyle = '#7a8f96'; r.beginPath(); r.ellipse(ax + W * 0.03, ay + H * 0.3, W * 0.17, H * 0.22, 0, 0, TAU); r.fill(); // épaules
  // le drap, et deux mains l'une dans l'autre
  r.fillStyle = '#e4ebe7'; r.beginPath(); r.moveTo(0, H); r.lineTo(0, H * 0.9); r.quadraticCurveTo(W * 0.5, H * 0.8, W, H * 0.93); r.lineTo(W, H); r.closePath(); r.fill();
  r.fillStyle = '#d2ab95'; r.beginPath(); r.ellipse(W * 0.55, H * 0.9, W * 0.07, H * 0.035, -0.1, 0, TAU); r.fill();
  r.fillStyle = '#dcbba7'; r.beginPath(); r.ellipse(W * (0.6 - lean * 0.02), H * 0.885, W * 0.06, H * 0.03, 0.25, 0, TAU); r.fill();
}

/**
 * Le réveil : du noir, des paupières lourdes qui battent puis s'ouvrent ; l'image, d'abord brûlée et
 * floue, se précise. Reste affiché (et vivant) jusqu'à close(). onBeat est appelé à chaque battement.
 * @returns {Promise} résolue quand les yeux sont grands ouverts
 */
export function awaken(seconds = 11, onBeat = null) {
  const c = open(), W = canvas.width, H = canvas.height;
  const room = document.createElement('canvas');
  room.width = W / 2; room.height = H / 2;
  const r = room.getContext('2d');
  let lastBeat = -1, running = true;
  // ouverture des paupières dans le temps : frémissent, retombent, s'entrouvrent, retombent, s'ouvrent
  const keys = [[0, 0], [0.12, 0], [0.2, 0.14], [0.27, 0.03], [0.4, 0.05], [0.5, 0.42], [0.58, 0.12], [0.68, 0.2], [0.86, 1], [1, 1]];
  const lid = (t) => { for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const f = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]), s = f * f * (3 - 2 * f); return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * s; } return 1; };
  const draw = (t, el) => {
    const o = lid(t), clear = Math.pow(Math.max(0, (t - 0.45) / 0.55), 1.5);
    drawRoom(r, room.width, room.height, el, Math.max(0, (t - 0.7) / 0.3));
    c.globalCompositeOperation = 'source-over';
    c.filter = `blur(${Math.round(26 * (1 - clear) + 1.5)}px) brightness(${1.9 - clear * 0.85}) saturate(${0.5 + clear * 0.5})`;
    c.drawImage(room, -20, -20, W + 40, H + 40);
    c.filter = 'none';
    // paupières : deux arcs noirs, bord flou
    const gap = o * H * 0.62;
    c.fillStyle = '#000';
    c.shadowColor = '#000'; c.shadowBlur = 60;
    c.beginPath(); c.moveTo(-50, -50); c.lineTo(W + 50, -50); c.lineTo(W + 50, H / 2 - gap * 0.5); c.quadraticCurveTo(W / 2, H / 2 - gap * 1.35, -50, H / 2 - gap * 0.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-50, H + 50); c.lineTo(W + 50, H + 50); c.lineTo(W + 50, H / 2 + gap * 0.5); c.quadraticCurveTo(W / 2, H / 2 + gap * 1.2, -50, H / 2 + gap * 0.5); c.closePath(); c.fill();
    c.shadowBlur = 0;
    const b = Math.floor(el * 0.93 + 0.7);
    if (b !== lastBeat) { lastBeat = b; onBeat?.(); }
  };
  const t0 = performance.now();
  const loop = () => { if (!running || canvas.style.display === 'none') return; const el = (performance.now() - t0) / 1000; draw(Math.min(1, el / seconds), el); requestAnimationFrame(loop); };
  loop();
  return new Promise((res) => setTimeout(res, seconds * 1000));
}

/**
 * Paupières par-dessus un plan 3D : le canvas devient transparent et ne dessine que les deux arcs noirs.
 * Le flou et l'éblouissement du réveil sont appliqués au canvas du jeu (filtre CSS), puis se dissipent.
 * onFrame(t, temps) est appelé à chaque image, onBeat à chaque battement. Reste actif jusqu'à close().
 * @returns {Promise} résolue quand les yeux sont grands ouverts
 */
export function eyelids(seconds = 12, onFrame = null, onBeat = null) {
  const c = open(), W = canvas.width, H = canvas.height;
  canvas.style.background = 'none';
  const game = document.querySelector('#game canvas');
  let lastBeat = -1;
  const keys = [[0, 0], [0.1, 0], [0.18, 0.14], [0.25, 0.03], [0.38, 0.05], [0.48, 0.42], [0.56, 0.1], [0.66, 0.2], [0.86, 1], [1, 1]];
  const lid = (t) => { for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const f = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]), s = f * f * (3 - 2 * f); return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * s; } return 1; };
  const t0 = performance.now();
  const loop = () => {
    if (canvas.style.display === 'none') { if (game) game.style.filter = ''; canvas.style.background = '#000'; return; }
    const el = (performance.now() - t0) / 1000, t = Math.min(1, el / seconds), o = lid(t), clear = Math.pow(Math.max(0, (t - 0.42) / 0.58), 1.6);
    if (game) game.style.filter = `blur(${(22 * (1 - clear) + 1.3).toFixed(1)}px) saturate(${(0.45 + clear * 0.55).toFixed(2)})`;
    c.clearRect(0, 0, W, H);
    const gap = o * H * 0.66;
    c.fillStyle = '#000';
    c.shadowColor = '#000'; c.shadowBlur = 70;
    c.beginPath(); c.moveTo(-60, -60); c.lineTo(W + 60, -60); c.lineTo(W + 60, H / 2 - gap * 0.5); c.quadraticCurveTo(W / 2, H / 2 - gap * 1.4, -60, H / 2 - gap * 0.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-60, H + 60); c.lineTo(W + 60, H + 60); c.lineTo(W + 60, H / 2 + gap * 0.5); c.quadraticCurveTo(W / 2, H / 2 + gap * 1.25, -60, H / 2 + gap * 0.5); c.closePath(); c.fill();
    c.shadowBlur = 0;
    // cils : un voile sombre et irrégulier le long des bords tant que l'œil est mi-clos
    if (o < 0.9) { const g = c.createLinearGradient(0, H / 2 - gap, 0, H / 2 + gap); g.addColorStop(0, `rgba(0,0,0,${0.6 * (1 - o)})`); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.6 * (1 - o)})`); c.fillStyle = g; c.fillRect(0, H / 2 - gap, W, gap * 2); }
    onFrame?.(t, el);
    const b = Math.floor(el * 0.93 + 0.7);
    if (b !== lastBeat) { lastBeat = b; onBeat?.(); }
    requestAnimationFrame(loop);
  };
  loop();
  return new Promise((res) => setTimeout(res, seconds * 1000));
}
