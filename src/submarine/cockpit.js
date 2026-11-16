import * as THREE from 'three';
import { gpuMode } from '../gpu/mode.js';
import { createNoise2D } from '../world/noise.js';

/**
 * Postes de pilotage en 3D, un par sous-marin (vue à la 1re personne).
 * La caméra est à l'origine du groupe, regard vers +Z. On construit autour :
 *  - une paroi avant percée du ou des hublots (forme propre à chaque modèle) ;
 *  - parois latérales, plafond et plancher, tuyaux, vannes, ampoule ;
 *  - un tableau de bord dont les instruments sont reliés au jeu :
 *    aiguilles (profondeur, oxygène, coque, compas), manette des gaz, voyants,
 *    et pour les modèles récents des écrans dont le texte se met à jour.
 */
const noise = createNoise2D(7);
const vmat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

/** Peinture irrégulière (taches, rouille), par sommet : les surfaces restent lisses */
function paint(geo, base, rust = 0.2, rustColor = '#4a2615') {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rustColor), c = new THREE.Color();
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const v = noise(x * 3 + z * 2, y * 3) * 0.5 + 0.5;
    const k = Math.max(0, Math.min(1, (v - (1 - rust) + 0.06) / 0.12));
    c.copy(b).lerp(r, k).multiplyScalar(0.9 + 0.1 * noise(x * 9, y * 9 + z * 7));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function add(group, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/** Couronne de boulons autour d'un hublot */
function bolts(group, x, y, z, r, count, color = '#878a85', size = 0.022) {
  const mat = lambert(color);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    add(group, new THREE.CylinderGeometry(size, size, 0.03, 6).rotateX(Math.PI / 2), mat, x + Math.cos(a) * r, y + Math.sin(a) * r, z);
  }
}

/** Cadran à aiguille : renvoie l'aiguille pour l'animer (angle en radians) */
function dial(group, x, y, z, r, face = '#e8ece2', rim = '#b07a47', tilt = -0.55) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  // Face tournée vers le pilote (−Z), puis inclinée vers le haut
  g.rotation.set(-tilt, Math.PI, 0);
  group.add(g);
  add(g, new THREE.CircleGeometry(r, 18), lambert(face));
  add(g, new THREE.TorusGeometry(r, r * 0.12, 4, 18), lambert(rim));
  // Graduations
  const tickMat = lambert('#26292b');
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 1.25 - (i / 8) * Math.PI * 1.5;
    const t = add(g, new THREE.BoxGeometry(r * 0.04, r * 0.16, 0.004), tickMat, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 0.004);
    t.rotation.z = a - Math.PI / 2;
  }
  const needle = new THREE.Group();
  needle.position.z = 0.008;
  g.add(needle);
  add(needle, new THREE.BoxGeometry(r * 0.06, r * 0.8, 0.004).translate(0, r * 0.35, 0), lambert('#8a2a1a'));
  add(g, new THREE.CircleGeometry(r * 0.1, 8), lambert('#26292b'), 0, 0, 0.012);
  return needle;
}

/** Valeur 0..1 → angle d'aiguille (balayage de 270°) */
const needleAngle = (v) => Math.PI * 0.75 - Math.max(0, Math.min(1, v)) * Math.PI * 1.5;

/** Écran à texte (CanvasTexture), mis à jour par draw(ctx, state) */
function screen(group, x, y, z, w, h, draw, tilt = -0.5, tint = '#7fd0c0') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round(512 * (h / w));
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = add(group, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), x, y, z);
  m.rotation.set(-tilt, Math.PI, 0); // face vers le pilote
  add(group, new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.02), lambert('#14181b'), x, y, z + 0.012).rotation.set(-tilt, Math.PI, 0);
  return {
    update(state) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#031210';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // liseré lumineux
      ctx.strokeStyle = 'rgba(159,242,226,0.28)';
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      ctx.fillStyle = tint;
      ctx.strokeStyle = tint;
      draw(ctx, canvas.width, canvas.height, state);
      tex.needsUpdate = true;
    },
  };
}

/** Tuyau le long d'une paroi (de a vers b) */
function pipe(group, a, b, r, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, 7);
  const m = add(group, geo, lambert(color));
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Volant de vanne */
function valve(group, x, y, z, r, color, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  group.add(g);
  add(g, new THREE.TorusGeometry(r, r * 0.12, 4, 12), lambert(color));
  for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(r * 2, r * 0.1, r * 0.1), lambert(color)).rotation.z = (i / 3) * Math.PI;
  return g;
}

/** Manette (renvoie le pivot pour l'animer) */
function lever(group, x, y, z, color = '#26292b', knob = '#8a2a1a') {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  group.add(pivot);
  add(pivot, new THREE.CylinderGeometry(0.012, 0.015, 0.22, 6).translate(0, 0.11, 0), lambert(color));
  add(pivot, new THREE.SphereGeometry(0.03, 8, 6), lambert(knob), 0, 0.23, 0);
  add(group, new THREE.BoxGeometry(0.08, 0.03, 0.12), lambert('#26292b'), x, y - 0.01, z);
  return pivot;
}

/* ================================================================== Poste de pilotage */

/**
 * Styles par niveau de coque : même architecture (bulle de verre, console basse en arc),
 * mais matières, instruments et finitions propres à chaque sous-marin.
 */
const STYLES = [
  { frame: '#4a3424', rust: 0.4, desk: '#3a2a1e', trim: '#6b5a46', face: '#e8dcc0', bolt: '#7a6650', lamp: '#efe3bb', struts: 8, screens: 0 },
  { frame: '#5a4630', rust: 0.15, desk: '#3e2114', trim: '#b08a50', face: '#e8dcc0', bolt: '#c8a870', lamp: '#efe3bb', struts: 8, screens: 0 },
  { frame: '#3f4a54', rust: 0.05, desk: '#2f3840', trim: '#8a96a0', face: '#e8ece2', bolt: '#a8b0b2', lamp: '#ccd8cc', struts: 6, screens: 0, switches: true },
  { frame: '#3a4a4c', rust: 0.04, desk: '#24302f', trim: '#5f7072', face: '#ccd8cc', bolt: '#8a9a9c', lamp: '#ccd8cc', struts: 6, screens: 1, tint: '#7fbf7a' },
  { frame: '#b0902e', rust: 0.06, desk: '#45484a', trim: '#a8b0b2', face: '#e8ece2', bolt: '#d8d2b0', lamp: '#efe3bb', struts: 6, screens: 1, tint: '#e0b050' },
  { frame: '#8a9396', rust: 0.02, desk: '#3a4044', trim: '#c08850', face: '#e8ece2', bolt: '#d0d6d8', lamp: '#efe3bb', struts: 4, screens: 2, tint: '#e0b050' },
  { frame: '#1c2124', rust: 0, desk: '#14181b', trim: '#30363a', face: '#e8ece2', bolt: '#30363a', lamp: '#bfe8e0', struts: 4, screens: 3, tint: '#7fd0c0', led: '#7fd0c0' },
];
const DOME_R = 1.25; // rayon de la bulle
const DOME_ANGLE = 1.82; // ouverture de la bulle depuis l'axe avant (≈ 104°)
const DESK_R = 0.74; // rayon où sont posés les instruments
const DESK_Y = -0.55;

/** Verre de la bulle : presque invisible de face, reflets sur les bords (type « glass » du moteur WebGPU) */
function glassMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: '#cfe8e6', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
  m.userData.detail = 'glass';
  m.visible = gpuMode.active; // le rendu Three.js n'a pas de shader de verre : on ne le dessine pas
  return m;
}

/** Support orienté vers le pilote, posé sur l'arc de la console (angle a autour de la verticale) */
function mount(group, a, r = DESK_R, y = DESK_Y) {
  const h = new THREE.Group();
  h.rotation.y = a;
  group.add(h);
  const slot = new THREE.Group();
  slot.position.set(0, y, r);
  h.add(slot);
  return slot;
}

/** La cabine : bulle de verre, cerclages, coque arrière et console en arc */
function cabin(st) {
  const g = new THREE.Group();
  const frameMat = vmat();
  const metal = lambert(st.trim);

  // Bulle de verre (calotte tournée vers l'avant) : le champ de vision reste entièrement dégagé
  add(g, new THREE.SphereGeometry(DOME_R, 56, 28, 0, Math.PI * 2, 0, DOME_ANGLE).rotateX(Math.PI / 2), glassMaterial());
  // Coque arrière, vue de l'intérieur
  add(g, paint(new THREE.SphereGeometry(DOME_R + 0.02, 32, 12, 0, Math.PI * 2, DOME_ANGLE, Math.PI - DOME_ANGLE).rotateX(Math.PI / 2), st.frame, st.rust), frameMat);

  // Cerclages : un à la base de la bulle, un à la limite du regard ; rien au centre
  const ring = (angle, tube, mat) => add(g, new THREE.TorusGeometry(DOME_R * Math.sin(angle), tube, 10, 72), mat, 0, 0, DOME_R * Math.cos(angle));
  add(g, paint(new THREE.TorusGeometry(DOME_R * Math.sin(DOME_ANGLE), 0.07, 10, 72), st.frame, st.rust), frameMat, 0, 0, DOME_R * Math.cos(DOME_ANGLE));
  ring(1.2, 0.022, metal);
  // Montants courts entre les deux cerclages, et leurs boulons
  for (let i = 0; i < st.struts; i++) {
    const a = ((i + 0.5) / st.struts) * Math.PI * 2;
    // arc de méridien, de l'angle 1.2 à la base de la bulle (angles mesurés depuis l'axe avant)
    const arc = new THREE.TorusGeometry(DOME_R, 0.018, 8, 16, DOME_ANGLE - 1.2).rotateZ(1.2);
    arc.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(a), Math.sin(a), 0), new THREE.Vector3(-Math.sin(a), Math.cos(a), 0)));
    add(g, arc, metal);
  }
  bolts(g, 0, 0, DOME_R * Math.cos(DOME_ANGLE) + 0.06, DOME_R * Math.sin(DOME_ANGLE) - 0.09, st.struts * 4, st.bolt, 0.02);
  if (st.led) {
    add(g, new THREE.TorusGeometry(DOME_R * Math.sin(1.2) - 0.03, 0.006, 6, 72), glow(st.led), 0, 0, DOME_R * Math.cos(1.2));
  }

  // Console basse en arc (profil tourné autour de la verticale), plancher
  const prof = [[0.42, -0.98], [0.42, -0.66], [0.47, -0.62], [1.0, -0.52], [1.04, -0.56], [1.04, -0.98]].map(([r, y]) => new THREE.Vector2(r, y));
  add(g, paint(new THREE.LatheGeometry(prof, 40, -1.25, 2.5), st.desk, st.rust * 0.3), vmat());
  add(g, new THREE.TorusGeometry(1.0, 0.014, 6, 40, 2.5).rotateX(Math.PI / 2).rotateY(Math.PI / 2 + 1.25), metal, 0, -0.52, 0);
  add(g, paint(new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2), '#1c1f21', 0.05), vmat(), 0, -0.97, 0);

  // Plafonnier
  add(g, new THREE.SphereGeometry(0.04, 12, 8), glow(st.lamp), 0, 0.95, -0.35);
  add(g, new THREE.CylinderGeometry(0.07, 0.05, 0.04, 12), metal, 0, 0.99, -0.35);
  return g;
}

/** Boîtier d'instrument posé sur la console */
function pod(slot, r, color) {
  const body = new THREE.CylinderGeometry(r * 1.12, r * 1.2, 0.09, 20).rotateX(Math.PI / 2);
  const m = add(slot, body, lambert(color), 0, 0, 0.05);
  m.rotation.x = 0.55;
}

/** Couleur d'une jauge selon son niveau : claire, puis ambre, puis rouge */
const levelColor = (v) => (v > 0.5 ? '#9ff2e2' : v > 0.25 ? '#ffc861' : '#ff5a44');

function makeCockpit(level) {
  const st = STYLES[Math.max(0, Math.min(STYLES.length - 1, level))];
  const g = cabin(st);
  const needles = {};
  const screens = [];
  const FONT = '"Barlow Condensed", "Segoe UI", sans-serif';
  const display = (a, w, h, draw) => {
    const slot = mount(g, a, DESK_R + 0.02, DESK_Y + h * 0.5 + 0.12);
    return screen(slot, 0, 0, 0, w, h, draw, -0.5, '#9ff2e2');
  };
  const lit = (c, color, blur = 14) => { c.fillStyle = color; c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = blur; };
  const label = (c, text, x, y, size = 30) => { lit(c, 'rgba(159,242,226,0.6)', 6); c.font = `500 ${size}px ${FONT}`; c.fillText(text, x, y); };

  /* Tous les sous-marins ont les mêmes instruments : trois écrans lumineux, lisibles dans le noir. */
  // Profondeur : grands chiffres, barre jusqu'à la limite de la coque
  const depthScreen = (c, w, h, s) => {
    const k = Math.min(1, s.depth / Math.max(1, s.crushDepth)), col = k > 1 - 1e-3 ? '#ff5a44' : k > 0.85 ? '#ffc861' : '#9ff2e2';
    label(c, 'PROFONDEUR', 28, 52);
    lit(c, col, 22);
    c.font = `300 150px ${FONT}`;
    c.textAlign = 'right';
    c.fillText(String(Math.round(s.depth)), w - 96, 198);
    c.font = `400 56px ${FONT}`;
    c.textAlign = 'left';
    c.fillText('m', w - 84, 198);
    // barre : où l'on en est par rapport à ce que la coque supporte
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(159,242,226,0.16)';
    c.fillRect(28, h - 62, w - 56, 14);
    lit(c, col, 12);
    c.fillRect(28, h - 62, (w - 56) * k, 14);
    label(c, `LIMITE ${Math.round(s.crushDepth)} m`, 28, h - 14, 24);
  };
  // Air et coque : deux anneaux qui se vident, pourcentage au centre
  const ring = (c, cx, cy, r, v, name, time) => {
    const col = levelColor(v), blink = v < 0.25 && Math.sin(time * 9) < 0 ? 0.35 : 1;
    c.lineCap = 'round';
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(159,242,226,0.16)';
    c.lineWidth = 20;
    c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
    c.globalAlpha = blink;
    lit(c, col, 20);
    c.lineWidth = 20;
    c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * Math.max(0.004, v))); c.stroke();
    c.textAlign = 'center';
    c.font = `400 78px ${FONT}`;
    c.fillText(String(Math.round(v * 100)), cx, cy + 24);
    c.globalAlpha = 1;
    label(c, name, cx, cy + r + 26, 30);
    c.textAlign = 'left';
  };
  const lifeScreen = (c, w, h, s) => {
    ring(c, w * 0.26, h * 0.44, h * 0.3, s.oxygen, 'AIR', s.time);
    ring(c, w * 0.74, h * 0.44, h * 0.3, s.hull, 'COQUE', s.time);
  };
  // Cap, soute, vitesse
  const navScreen = (c, w, h, s) => {
    label(c, 'CAP', 28, 52);
    lit(c, '#9ff2e2', 16);
    c.font = `300 96px ${FONT}`;
    c.fillText(`${String(Math.round(s.heading)).padStart(3, '0')}°`, 28, 142);
    // rose des vents réduite à une réglette
    c.shadowBlur = 0;
    for (let i = -6; i <= 6; i++) {
      const deg = Math.round(s.heading / 15) * 15 + i * 15, x = w * 0.72 + (deg - s.heading) * 2.1;
      if (x < w * 0.5 || x > w - 20) continue;
      c.fillStyle = (((deg % 360) + 360) % 360) % 90 === 0 ? '#9ff2e2' : 'rgba(159,242,226,0.45)';
      c.fillRect(x, 96, 3, (((deg % 360) + 360) % 360) % 90 === 0 ? 40 : 22);
    }
    lit(c, '#ffc861', 10);
    c.fillRect(w * 0.72 - 2, 84, 5, 12);
    const full = s.cargo && s.cargo.count >= s.cargo.max;
    label(c, 'SOUTE', 28, h - 78);
    lit(c, full ? '#ffc861' : '#9ff2e2', 14);
    c.font = `400 70px ${FONT}`;
    c.fillText(s.cargo ? `${s.cargo.count} / ${s.cargo.max}` : '—', 28, h - 18);
    label(c, 'VITESSE', w * 0.56, h - 78);
    lit(c, '#9ff2e2', 14);
    c.font = `400 70px ${FONT}`;
    c.fillText(`${(s.speed ?? 0).toFixed(1)}`, w * 0.56, h - 18);
  };
  screens.push(display(0.47, 0.36, 0.2, depthScreen), display(0, 0.36, 0.2, lifeScreen), display(-0.47, 0.36, 0.2, navScreen)); // profondeur à gauche du pilote

  /* Boutons d'action : des touches rondes, éclairées, chacune sa couleur et son étiquette */
  const buttons = {};
  const button = (id, a, color, text) => {
    const slot = mount(g, a, 0.64, DESK_Y + 0.055);
    slot.rotation.x = -0.75; // inclinés vers le pilote
    add(slot, new THREE.CylinderGeometry(0.036, 0.04, 0.014, 24), lambert('#14181b'));
    const cap = add(slot, new THREE.CylinderGeometry(0.028, 0.03, 0.02, 24), new THREE.MeshBasicMaterial({ color }), 0, 0.012, 0);
    // étiquette lumineuse, juste derrière la touche
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const k = cv.getContext('2d');
    k.fillStyle = '#04100e'; k.fillRect(0, 0, 256, 64);
    k.fillStyle = color; k.shadowColor = color; k.shadowBlur = 8;
    k.font = `600 38px ${FONT}`; k.textAlign = 'center'; k.fillText(text, 128, 45);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plate = add(slot, new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ map: tex }), 0, 0.006, -0.055);
    plate.rotation.set(-Math.PI / 2, 0, Math.PI);
    buttons[id] = { cap, base: new THREE.Color(color) };
  };
  button('claw', 0.27, '#ffd27a', 'BRAS · CLIC');
  button('echo', 0.09, '#6fe0ff', 'ÉCHO · R');
  button('pulse', -0.09, '#7dffb0', 'IMPULSION · F');
  button('hold', -0.27, '#ff9a6a', 'SOUTE · I');

  // Manette des gaz à droite, manche à gauche, voyant d'alerte
  const tSlot = mount(g, 1.0, 0.62, DESK_Y - 0.05);
  needles.throttle = lever(tSlot, 0, 0, 0, '#26292b', st.led ?? '#8a2a1a');
  lever(mount(g, -0.95, 0.62, DESK_Y - 0.05), 0, 0, 0, '#26292b', '#26292b');
  needles.warn = add(mount(g, -0.78, DESK_R + 0.12, DESK_Y + 0.07), new THREE.SphereGeometry(0.022, 10, 8), glow('#3a1a10'));
  return { group: g, needles, screens, buttons };
}

/**
 * Crée le poste de pilotage du niveau de coque donné.
 * update(dt, state) anime les instruments ; state = { depth, crushDepth, oxygen, hull, heading, throttle, time }
 */
export function createCockpit(level) {
  const { group, needles, screens, buttons } = makeCockpit(level);
  // L'œil est un peu en retrait et au-dessus du tableau de bord : on voit hublot ET instruments
  group.position.set(0, -0.04, 0.12);
  group.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });
  let screenTimer = 0;
  const warnOn = new THREE.Color('#e04a2a'), warnOff = new THREE.Color('#3a1a10');
  return {
    group,
    update(dt, s) {
      const k = Math.min(1, dt * 6);
      // Touches : pleine lumière quand l'action est possible, veilleuse sinon
      const glowOf = (id, k) => buttons[id].cap.material.color.copy(buttons[id].base).multiplyScalar(k);
      glowOf('claw', s.clawBusy ? 0.25 : s.aim ? 1.5 + Math.sin(s.time * 9) * 0.5 : 0.8);
      glowOf('echo', s.echo == null ? 0.12 : s.echo ? 1.3 : 0.3);
      glowOf('pulse', (s.pulseReady ?? 1) >= 1 ? 1.2 + Math.sin(s.time * 3) * 0.15 : 0.15 + 0.3 * (s.pulseReady ?? 0));
      glowOf('hold', s.cargo && s.cargo.count >= s.cargo.max ? 1.2 + Math.sin(s.time * 6) * 0.5 : 0.8);
      if (needles.throttle) needles.throttle.rotation.x += (s.throttle * 0.6 - needles.throttle.rotation.x) * k;
      if (needles.warn) needles.warn.material.color.copy(s.oxygen < 0.25 && Math.sin(s.time * 8) > 0 ? warnOn : warnOff);
      screenTimer -= dt;
      if (screenTimer <= 0) {
        screenTimer = 0.12;
        for (const sc of screens) sc.update(s);
      }
    },
  };
}
