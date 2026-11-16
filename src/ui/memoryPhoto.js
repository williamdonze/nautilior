import * as THREE from 'three';
import { createCharacter, LOOKS } from '../port/characters.js';

/**
 * Les images des souvenirs : de vraies vues 3D du jeu (le quai, une porte du village, la plate sur l'eau du port…)
 * rendues à part, puis vieillies comme un tirage papier : couleurs passées, grain, vignettage, poussières, rayures.
 * Plus rien de « pixel » : le souvenir a la matière du jeu, et l'âge d'une photo qu'on a gardée longtemps.
 */
export const PHOTO_W = 720;
export const PHOTO_H = 450;
const TAU = Math.PI * 2;

let renderer = null;
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(PHOTO_W, PHOTO_H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

const LOOK = {
  yann: { coat: '#2f4a66', legs: '#2a2c2e', hair: '#3e2114', skin: '#e2c2a8' },
  anna: { coat: '#6f8a99', legs: '#3a3f46', skin: '#e2c0aa', hair: '#4a2e22', long: true, female: true, hairStyle: 'long', eyes: '#5a4632' },
  boyA: { coat: '#b9a57a', legs: '#3a4a5a', hair: '#3e2114', skin: '#e6c8ae' },
  boyB: { coat: '#8a3a2a', legs: '#3a4a5a', hair: '#4a2a16', skin: '#e6c8ae' },
  diver: { coat: '#c9d6d2', legs: '#c9d6d2', skin: '#dfe8e4', hair: '#c9d6d2', eyes: '#8fa8a2', hairStyle: 'short' },
};
const person = (look, x, z, yaw, scale = 1) => { const c = createCharacter(look); c.object.position.set(x, 0, z); c.object.rotation.y = yaw; c.object.scale.setScalar(scale); return c; };
const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });

/** Papier écrit à la main : lignes d'écriture (lisibles ou non) sur un canvas */
function paper(w, h, draw, bg = '#e9e2cf') {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const k = cv.getContext('2d');
  k.fillStyle = bg; k.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { k.fillStyle = `rgba(90,70,40,${Math.random() * 0.06})`; k.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  draw(k, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const HAND = 'italic 500 %px "Segoe Script", "Bradley Hand", "Brush Script MT", "Snell Roundhand", cursive';
const hand = (k, text, x, y, size, color = '#2a2a3a') => { k.fillStyle = color; k.font = HAND.replace('%', size); k.fillText(text, x, y); };

/**
 * Vue prise dans le vrai village : on emprunte la scène du port le temps de la photo
 * (volets ouverts, lumière d'un beau jour), puis on remet tout en place.
 */
function inPort(ctx, cam, setup, { bright = 1.9, fog = 0.012, sky = '#b9c4c2' } = {}) {
  const port = ctx?.port;
  if (!port) return null;
  const S = port.scene, undo = [];
  const set = (obj, key, value) => { const old = obj[key]; obj[key] = value; undo.push(() => (obj[key] = old)); };
  // volets ouverts, comme avant
  for (const m of port.world.tagged.shutters) { const r = m.rotation.y; m.rotation.y = m.userData.side * -1.45; undo.push(() => (m.rotation.y = r)); }
  for (const n of port.npcs) set(n.character.object, 'visible', false);
  set(port.player.object, 'visible', false);
  if (port.subBeacon) set(port.subBeacon, 'visible', false);
  S.traverse((o) => { if (o.isHemisphereLight || o.isDirectionalLight) set(o, 'intensity', o.intensity * bright); });
  const bg = S.background.clone(), fc = S.fog.color.clone(), fd = S.fog.density;
  S.background.set(sky); S.fog.color.set(sky); S.fog.density = fog;
  undo.push(() => { S.background.copy(bg); S.fog.color.copy(fc); S.fog.density = fd; });
  const extra = new THREE.Group();
  S.add(extra);
  setup(extra, port);
  S.updateMatrixWorld(true);
  getRenderer().render(S, cam);
  S.remove(extra);
  for (const u of undo.reverse()) u();
  return true;
}

const camera = (fov, pos, look) => { const c = new THREE.PerspectiveCamera(fov, PHOTO_W / PHOTO_H, 0.05, 400); c.position.set(...pos); c.lookAt(...look); return c; };

/** Petite scène de table (objets vus de près) */
function still(setup, cam, { bg = '#1a1612', key = '#ffe2b0' } = {}) {
  const S = new THREE.Scene();
  S.background = new THREE.Color(bg);
  S.add(new THREE.HemisphereLight('#cfd6d2', '#2a2018', 0.9));
  const l = new THREE.SpotLight(key, 60, 12, 0.7, 0.8, 1.5);
  l.position.set(-1.6, 2.6, 1.2);
  S.add(l, l.target);
  setup(S);
  getRenderer().render(S, cam);
  S.traverse((o) => { o.geometry?.dispose?.(); });
}

const SCENES = {
  /* Le quai, un dimanche : le même, mais vivant. Quelqu'un rit, tout près, au bord du cadre. */
  photo: (ctx) => inPort(ctx, camera(46, [6.5, 1.72, 3.6], [-9, 2.6, -11]), (g) => {
    const y = person(LOOK.yann, 4.9, 1.6, 0.25);
    y.head.rotation.set(-0.2, 0.55, 0.1); // la tête renversée : il rit
    y.arms[0].rotation.x = -0.5;
    g.add(y.object);
    const coats = ['#63321b', '#cdb57c', '#5b8fc0', '#a8bdb2', '#8a4f28', '#3c7048', '#7a5a26', '#2f4a66'];
    [[-2, -1.5, 0.6], [-3.2, -1.2, -0.8], [-7, 0.8, 2.2], [-8.1, 1.2, -1.9], [0.5, -4, 0.2], [-12, -3, 1.2], [-13, -2.4, -1.6], [-5, -6, 2.9], [-16, 1.5, 1.5], [2.5, -1, -2.4], [-10, 2.2, 0.4]].forEach(([x, z, yaw], i) => {
      const c = person({ coat: coats[i % coats.length], legs: i % 2 ? '#26292b' : '#2f4a66', hat: i % 4 === 0 ? 'cap' : i % 5 === 0 ? 'scarf' : null, hatColor: coats[(i + 3) % 8], long: i % 3 === 0, female: i % 3 === 0, hair: ['#3e2114', '#878a85', '#22140d', '#7d6f48'][i % 4] }, x, z, yaw);
      c.arms[i % 2].rotation.x = -0.3 - (i % 3) * 0.3;
      g.add(c.object);
    });
  }),

  /* Une promesse : deux mains, sur le pas d'une porte */
  ring: (ctx) => inPort(ctx, camera(26, [3.9, 1.22, -18.1], [2.05, 1.0, -19.2]), (g) => {
    const anna = person(LOOK.anna, 2.0, -19.55, 0), loic = person(LOOKS.player, 2.1, -18.78, Math.PI);
    anna.arms[1].rotation.set(-0.95, 0, 0.12);
    anna.arms[0].rotation.set(-0.85, 0, -0.1);
    loic.arms[0].rotation.set(-0.9, 0, -0.1);
    loic.arms[1].rotation.set(-0.2, 0, 0);
    anna.head.rotation.x = 0.12;
    g.add(anna.object, loic.object);
    const lamp = new THREE.PointLight('#ffd9a0', 6, 6, 1.5);
    lamp.position.set(2, 2.2, -19.4);
    g.add(lamp);
  }, { bright: 1.5, fog: 0.02 }),

  /* La plate : deux gamins sur l'eau du port, un été */
  boat: (ctx) => inPort(ctx, camera(30, [-1.5, 2.6, 4.9], [-7.5, -0.6, 11.5]), (g) => {
    const b = new THREE.Group();
    b.position.set(-7.5, -1.0, 11.5);
    b.rotation.set(0.03, 0.35, 0.05);
    g.add(b);
    const wood = lam('#8a6a44'), paint = lam('#3c6a78');
    const hull = new THREE.CylinderGeometry(0.72, 0.5, 3.2, 14, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI).scale(1, 0.55, 1);
    mesh(b, hull, new THREE.MeshLambertMaterial({ color: '#3c6a78', side: THREE.DoubleSide }), 0, 0.3, 0);
    for (const s of [-1, 1]) mesh(b, new THREE.BoxGeometry(0.06, 0.34, 1.1), paint, s * 1.6, 0.16, 0);
    for (const x of [-0.7, 0.5]) mesh(b, new THREE.BoxGeometry(0.22, 0.04, 1.3), wood, x, 0.26, 0);
    const big = person(LOOK.boyA, 0.5, 0, -Math.PI / 2, 0.72), small = person(LOOK.boyB, -0.7, 0.1, Math.PI / 2, 0.56);
    for (const c of [big, small]) { c.object.position.y = -0.22; b.add(c.object); }
    // l'aîné rame, le petit écope, penché
    big.arms[0].rotation.set(-1.2, 0, -0.5); big.arms[1].rotation.set(-1.2, 0, 0.5);
    small.body.rotation.x = 0.5; small.arms[1].rotation.set(-1.5, 0, 0);
    for (const s of [-1, 1]) { const oar = mesh(b, new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), wood, 0.75, 0.42, s * 1.05); oar.rotation.set(s * 1.15, 0, 0.25); mesh(oar, new THREE.BoxGeometry(0.14, 0.5, 0.02), wood, 0, s > 0 ? -1.2 : 1.2, 0); }
  }, { bright: 2.6, fog: 0.006, sky: '#d8dcd6' }),

  /* 4 h 12 : la montre, posée */
  watch: () => still((S) => {
    mesh(S, new THREE.BoxGeometry(6, 0.2, 4), lam('#4a3626'), 0, -0.1, 0);
    const steel = new THREE.MeshPhongMaterial({ color: '#b9bcb8', shininess: 80 }), leather = lam('#3a2416');
    for (const s of [-1, 1]) { const st = mesh(S, new THREE.BoxGeometry(0.34, 0.035, 1.1, 1, 1, 8), leather, 0, 0.03, s * 0.8); st.rotation.x = s * 0.06; }
    mesh(S, new THREE.CylinderGeometry(0.36, 0.38, 0.11, 48), steel, 0, 0.075, 0);
    const face = paper(256, 256, (k) => {
      k.fillStyle = '#efe8d4'; k.beginPath(); k.arc(128, 128, 128, 0, TAU); k.fill();
      k.fillStyle = '#1c1c22'; k.font = '600 26px serif'; k.textAlign = 'center';
      for (let i = 1; i <= 12; i++) { const a = (i / 12) * TAU - Math.PI / 2; k.fillText(String(i), 128 + Math.cos(a) * 98, 137 + Math.sin(a) * 98); }
      const handTo = (a, len, w) => { k.strokeStyle = '#14141a'; k.lineWidth = w; k.lineCap = 'round'; k.beginPath(); k.moveTo(128, 128); k.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len); k.stroke(); };
      handTo(((4 + 12 / 60) / 12) * TAU - Math.PI / 2, 56, 7); // 4 h
      handTo((12 / 60) * TAU - Math.PI / 2, 86, 4); // 12
      k.fillStyle = '#14141a'; k.beginPath(); k.arc(128, 128, 6, 0, TAU); k.fill();
    }, '#00000000');
    mesh(S, new THREE.CircleGeometry(0.32, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: face }), 0, 0.132, 0);
    mesh(S, new THREE.CylinderGeometry(0.33, 0.33, 0.012, 48), new THREE.MeshPhongMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, shininess: 200 }), 0, 0.142, 0);
    mesh(S, new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10).rotateZ(Math.PI / 2), steel, 0.4, 0.075, 0);
  }, camera(30, [0.9, 1.5, 1.5], [0, 0.05, 0])),

  /* La dernière page du carnet de bord */
  logbook: () => still((S) => {
    mesh(S, new THREE.BoxGeometry(6, 0.2, 4), lam('#2c3336'), 0, -0.1, 0);
    const page = (text) => paper(512, 640, (k, w) => {
      k.strokeStyle = 'rgba(70,90,130,0.25)'; k.lineWidth = 1;
      for (let y = 70; y < 620; y += 38) { k.beginPath(); k.moveTo(24, y); k.lineTo(w - 24, y); k.stroke(); }
      text(k);
    });
    const left = page((k) => { for (let i = 0; i < 12; i++) hand(k, ['vérifié joints', 'batteries 80 %', 'mer 3, vent ouest', 'ballasts ok', 'phare ok', 'lest largué 2', 'remonté 17 h 05'][i % 7], 34, 100 + i * 38, 26, 'rgba(42,42,58,0.45)'); });
    const right = page((k) => {
      hand(k, '14 octobre 1984', 34, 100, 34);
      hand(k, 'Épave de la Marie-Morgane.', 34, 176, 30);
      hand(k, 'Descente à 15 h 50.', 34, 214, 30);
      hand(k, 'Fond annoncé : quarante mètres.', 34, 290, 28);
      hand(k, 'On verra bien.', 34, 328, 28);
      hand(k, 'Équipage : 2', 34, 590, 32);
    });
    const pg = (tex, x, tilt) => { const m = mesh(S, new THREE.PlaneGeometry(1.25, 1.56, 8, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }), x, 0.06, 0); m.rotation.z = tilt; return m; };
    pg(left, -0.63, 0.06); pg(right, 0.63, -0.06);
    mesh(S, new THREE.BoxGeometry(2.62, 0.05, 1.62), lam('#3a2416'), 0, 0.0, 0);
    const pencil = mesh(S, new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6).rotateZ(Math.PI / 2), lam('#c8a030'), 0.75, 0.1, 0.55);
    pencil.rotation.y = 0.5;
  }, camera(30, [0.95, 2.2, 1.9], [0.25, 0, 0.05]), { bg: '#101416' }),

  /* Les noms : la plaque du bord. Le second est rayé. */
  tag: () => still((S) => {
    mesh(S, new THREE.BoxGeometry(6, 4, 0.2), new THREE.MeshPhongMaterial({ color: '#39464a', shininess: 20 }), 0, 0, -0.12);
    const tex = paper(640, 320, (k, w, h) => {
      const g = k.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#a88a4a'); g.addColorStop(0.5, '#c8a860'); g.addColorStop(1, '#8a6e38');
      k.fillStyle = g; k.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { k.fillStyle = `rgba(60,40,10,${Math.random() * 0.12})`; k.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 30, 1); }
      k.fillStyle = 'rgba(40,28,10,0.85)'; k.textAlign = 'center';
      k.font = '600 30px serif'; k.fillText('NAUTILIAR — PORT-KERMOR', w / 2, 62);
      k.font = '600 52px serif'; k.fillText('LOÏC KERHERVÉ', w / 2, 152);
      k.fillStyle = 'rgba(40,28,10,0.28)'; k.fillText('Y███ KERHERVÉ'.replace(/█/g, '·'), w / 2, 240);
      // rayé au couteau : des dizaines de petits coups serrés, clairs (le métal mis à nu)
      for (let i = 0; i < 420; i++) { const x = 96 + Math.random() * 440, y = 198 + Math.random() * 54; k.strokeStyle = `rgba(${230 + Math.random() * 25},${205 + Math.random() * 30},${140 + Math.random() * 40},${0.55 + Math.random() * 0.45})`; k.lineWidth = 1 + Math.random() * 2.4; k.beginPath(); k.moveTo(x, y); k.lineTo(x + 18 + Math.random() * 34, y - 10 + Math.random() * 20); k.stroke(); }
    });
    mesh(S, new THREE.BoxGeometry(2.4, 1.2, 0.05), new THREE.MeshPhongMaterial({ map: tex, shininess: 60, specular: '#665533' }), 0, 0, 0);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) mesh(S, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#6a5a3a', shininess: 60 }), sx * 1.08, sy * 0.48, 0.035);
  }, camera(30, [0.7, 0.25, 2.9], [0, 0, 0]), { bg: '#101416', key: '#fff0d0' }),

  /* Les filets : par le hublot, une lampe, une main qui coupe */
  knife: () => {
    const S = new THREE.Scene();
    S.background = new THREE.Color('#06181c');
    S.fog = new THREE.FogExp2('#06181c', 0.07);
    S.add(new THREE.HemisphereLight('#3a6a6a', '#041014', 0.9));
    // mailles en premier plan (texture à trous)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const k = cv.getContext('2d');
    k.strokeStyle = '#fff'; k.lineWidth = 2.5; k.beginPath(); k.moveTo(0, 0); k.lineTo(64, 64); k.moveTo(64, 0); k.lineTo(0, 64); k.stroke();
    const nt = new THREE.CanvasTexture(cv);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    for (const [x, y, z, ry, rep] of [[-0.6, 0.2, 1.7, 0.25, 4], [1.2, -0.1, 2.4, -0.3, 5]]) {
      const t = nt.clone(); t.needsUpdate = true; t.repeat.set(rep, rep);
      const g = new THREE.PlaneGeometry(7, 6, 10, 10), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.4 + z) * 0.25 + Math.cos(p.getY(i) * 1.2) * 0.2);
      const m = mesh(S, g, new THREE.MeshLambertMaterial({ color: '#56675c', alphaMap: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), x, y, z);
      m.rotation.y = ry;
    }
    // le plongeur, derrière, sa lampe allumée
    const d = person(LOOK.diver, 0.45, -1.3, 3.3, 1);
    d.object.position.set(0.45, -1.1, 3.3);
    d.object.rotation.set(0.25, Math.PI + 0.3, 0.1);
    d.arms[1].rotation.set(-1.5, 0, -0.2);
    d.arms[0].rotation.set(-1.1, 0, 0.25);
    S.add(d.object);
    const lamp = new THREE.PointLight('#e8fff0', 60, 10, 1.3);
    lamp.position.set(0.3, 0.9, 2.5);
    S.add(lamp);
    mesh(S, new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#f4fff4' }), 0.42, 0.72, 3.05);
    // le cerclage du hublot, au bord du cadre
    mesh(S, new THREE.TorusGeometry(1.25, 0.16, 12, 48), lam('#3a2a1e'), 0, 0.1, 0.75);
    getRenderer().render(S, camera(62, [0, 0.1, 0], [0.1, 0.25, 3]));
  },

  /* Jour 112 : la feuille, au pied du lit */
  chart: () => still((S) => {
    S.background.set('#b9cdc4');
    mesh(S, new THREE.PlaneGeometry(12, 8), lam('#b9cdc4'), 0, 1, -2.2);
    const steel = new THREE.MeshPhongMaterial({ color: '#c2c8c6', shininess: 90 });
    // le pied du lit : deux montants, deux traverses, le drap derrière
    for (const x of [-1.5, 1.5]) mesh(S, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 12), steel, x, 0.2, 0);
    for (const y of [0.9, 0.1]) mesh(S, new THREE.CylinderGeometry(0.04, 0.04, 3, 12).rotateZ(Math.PI / 2), steel, 0, y, 0);
    for (let i = -3; i <= 3; i++) mesh(S, new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), steel, i * 0.4, 0.5, 0);
    mesh(S, new THREE.BoxGeometry(2.9, 0.5, 2), lam('#dfe6e0'), 0, -0.1, -1.05);
    const tex = paper(512, 720, (k, w) => {
      k.fillStyle = '#22303a'; k.font = '600 28px sans-serif'; k.fillText('HÔPITAL DE PORT-KERMOR', 30, 52);
      k.font = '400 20px sans-serif'; k.fillText('Chambre 112 — KERHERVÉ Loïc', 30, 86);
      k.strokeStyle = 'rgba(40,60,80,0.5)'; k.lineWidth = 1;
      for (let y = 130; y < 690; y += 30) { k.beginPath(); k.moveTo(30, y); k.lineTo(w - 30, y); k.stroke(); }
      k.font = '400 19px sans-serif';
      ['Arrêt cardiaque 4 h 12 — réanimé', 'Coma. Ventilation assistée.', 'J1   stable', 'J2   stable', 'J47  stable', 'J111 stable', 'J112 famille reçue ce jour'].forEach((t, i) => k.fillText(t, 36, 152 + i * 30 + (i > 2 ? 30 : 0) + (i > 4 ? 60 : 0)));
      // courbe qui ne bouge plus
      k.strokeStyle = '#a03a2a'; k.lineWidth = 2; k.beginPath(); k.moveTo(36, 560);
      for (let x = 36; x < w - 36; x += 6) k.lineTo(x, 560 + Math.sin(x * 0.05) * 3);
      k.stroke();
      hand(k, 'Je suis là.', 300, 660, 40, '#1a2a6a');
    }, '#f2f0e8');
    const board = mesh(S, new THREE.BoxGeometry(1.0, 1.4, 0.03), lam('#6a5236'), 0.2, 0.45, 0.14);
    board.rotation.set(-0.12, 0, -0.04);
    mesh(board, new THREE.PlaneGeometry(0.9, 1.27), new THREE.MeshLambertMaterial({ map: tex }), 0, -0.03, 0.02);
    mesh(board, new THREE.BoxGeometry(0.4, 0.09, 0.05), steel, 0, 0.64, 0.03);
  }, camera(32, [0.9, 0.75, 2.6], [0.2, 0.42, 0]), { bg: '#b9cdc4', key: '#ffffff' }),
};

/** Réglages du vieillissement, par image : sepia (0 couleur … 1 noir et blanc bistre), fade (noirs délavés) */
const AGE = { boat: { sepia: 1, fade: 0.14, gain: 2.3 }, photo: { sepia: 0.45, fade: 0.1 }, ring: { sepia: 0.4, fade: 0.1 }, knife: { sepia: 0.15, fade: 0.04 }, chart: { sepia: 0.25, fade: 0.08 } };

/** Tirage ancien : couleurs passées, grain, vignettage, poussières, rayures, coin brûlé de lumière */
function age(ctx, { sepia = 0.35, fade = 0.08, gain = 1 } = {}, seed = 1) {
  const w = PHOTO_W, h = PHOTO_H, img = ctx.getImageData(0, 0, w, h), d = img.data;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let r = Math.min(1, (d[i] / 255) * gain), g = Math.min(1, (d[i + 1] / 255) * gain), b = Math.min(1, (d[i + 2] / 255) * gain);
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    // vers le bistre ; les couleurs qui restent virent au jaune-magenta des tirages des années 80
    r += (l * 1.08 + 0.03 - r) * sepia; g += (l * 0.98 + 0.02 - g) * sepia; b += (l * 0.8 + 0.03 - b) * sepia;
    r = r * 1.04 + 0.02; b = b * 0.92 + 0.02;
    // noirs délavés, blancs éteints
    r = fade + r * (0.95 - fade); g = fade + g * (0.94 - fade); b = fade * 1.1 + b * (0.9 - fade);
    const u = x / w - 0.5, v = y / h - 0.5, vig = 1 - Math.pow(Math.hypot(u * 1.15, v * 1.3) * 1.45, 2.6) * 0.75;
    const n = (rnd() - 0.5) * 0.09;
    d[i] = Math.max(0, Math.min(255, (r * vig + n) * 255));
    d[i + 1] = Math.max(0, Math.min(255, (g * vig + n) * 255));
    d[i + 2] = Math.max(0, Math.min(255, (b * vig + n) * 255));
  }
  ctx.putImageData(img, 0, 0);
  // fuite de lumière dans un coin
  const leak = ctx.createRadialGradient(w * 0.98, h * 0.05, 0, w * 0.98, h * 0.05, w * 0.45);
  leak.addColorStop(0, 'rgba(255,190,110,0.28)'); leak.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = leak; ctx.fillRect(0, 0, w, h);
  // poussières et rayures
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 46; i++) { ctx.fillStyle = `rgba(245,240,225,${0.25 + rnd() * 0.5})`; ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 0.4 + rnd() * 1.4, 0, TAU); ctx.fill(); }
  for (let i = 0; i < 5; i++) { const x = rnd() * w; ctx.strokeStyle = `rgba(245,240,225,${0.12 + rnd() * 0.2})`; ctx.lineWidth = 0.6 + rnd(); ctx.beginPath(); ctx.moveTo(x, rnd() * h * 0.4); ctx.bezierCurveTo(x + rnd() * 8 - 4, h * 0.4, x + rnd() * 10 - 5, h * 0.7, x + rnd() * 14 - 7, h * (0.6 + rnd() * 0.4)); ctx.stroke(); }
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(30,22,14,${0.2 + rnd() * 0.2})`; ctx.lineWidth = 0.8; ctx.beginPath(); const x = rnd() * w, y = rnd() * h; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10 + rnd() * 20, y - 6 + rnd() * 12, x + 20 + rnd() * 30, y + rnd() * 8); ctx.stroke(); }
}

/**
 * Dessine l'image d'un souvenir dans un canvas.
 * @param {string} art identifiant (fragments.json)
 * @param {HTMLCanvasElement} canvas
 * @param {{port?: object}} ctx ce dont les prises de vue ont besoin (la scène du port)
 */
export function drawMemoryPhoto(art, canvas, ctx) {
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.fillStyle = '#16120e';
  c.fillRect(0, 0, PHOTO_W, PHOTO_H);
  try {
    const shoot = SCENES[art] ?? SCENES.watch;
    if (shoot(ctx) === null) SCENES.watch();
    // léger flou d'objectif, puis le vieillissement
    c.filter = 'blur(0.7px)';
    c.drawImage(getRenderer().domElement, 0, 0, PHOTO_W, PHOTO_H);
    c.filter = 'none';
    age(c, AGE[art], art.length * 7 + art.charCodeAt(0));
  } catch (e) {
    console.warn('souvenir : image non rendue', e);
  }
}
