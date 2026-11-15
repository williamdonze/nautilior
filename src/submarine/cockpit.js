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
  canvas.width = 256;
  canvas.height = Math.round(256 * (h / w));
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = add(group, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), x, y, z);
  m.rotation.set(-tilt, Math.PI, 0); // face vers le pilote
  add(group, new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.02), lambert('#14181b'), x, y, z + 0.012).rotation.set(-tilt, Math.PI, 0);
  return {
    update(state) {
      ctx.fillStyle = '#04100e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
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

function makeCockpit(level) {
  const st = STYLES[Math.max(0, Math.min(STYLES.length - 1, level))];
  const g = cabin(st);
  const needles = {};
  const screens = [];
  const gauge = (a, r, face = st.face) => {
    const slot = mount(g, a, DESK_R, DESK_Y + r * 0.9 + 0.02);
    pod(slot, r, st.trim);
    return dial(slot, 0, 0, 0, r, face, st.trim);
  };
  const display = (a, w, h, draw) => {
    const slot = mount(g, a, DESK_R + 0.02, DESK_Y + h * 0.5 + 0.03);
    return screen(slot, 0, 0, 0, w, h, draw, -0.5, st.tint);
  };
  const depthScreen = (c, w, h, s) => {
    c.font = '24px monospace';
    c.fillText('PROFONDEUR', 12, 30);
    c.font = '50px monospace';
    c.fillText(`${String(Math.round(s.depth)).padStart(4, '0')} m`, 12, 88);
    c.fillRect(12, 108, (w - 24) * Math.min(1, s.depth / s.crushDepth), 8);
  };
  const statusScreen = (c, w, h, s) => {
    c.font = '24px monospace';
    c.fillText(`O2    ${Math.round(s.oxygen * 100)} %`, 12, 36);
    c.fillText(`COQUE ${Math.round(s.hull * 100)} %`, 12, 74);
    c.fillText(`CAP   ${String(Math.round(s.heading)).padStart(3, '0')}°`, 12, 112);
  };
  const sonarScreen = (c, w, h, s) => {
    const cx = w / 2, cy = h / 2, r = h / 2 - 10;
    c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, r / 2, 0, Math.PI * 2); c.stroke();
    const a = s.time * 2.4;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
  };

  // Instruments : cadrans à aiguille sur les vieux modèles, écrans sur les derniers
  if (st.screens >= 3) {
    screens.push(display(-0.42, 0.34, 0.19, depthScreen), display(0, 0.26, 0.19, sonarScreen), display(0.42, 0.34, 0.19, statusScreen));
  } else {
    needles.depth = gauge(-0.5, 0.1);
    needles.oxygen = gauge(-0.22, 0.085);
    needles.hull = gauge(0.02, 0.085);
    if (st.screens >= 1) screens.push(display(st.screens >= 2 ? 0.34 : 0.4, 0.3, 0.17, depthScreen));
    if (st.screens >= 2) screens.push(display(0.72, 0.28, 0.17, statusScreen));
    if (st.screens === 0) needles.compass = gauge(0.28, 0.095, '#26292b');
  }
  // Manette des gaz à droite, manche à gauche, voyant d'alerte
  const tSlot = mount(g, st.screens >= 2 ? 1.0 : 0.62, 0.62, DESK_Y - 0.05);
  needles.throttle = lever(tSlot, 0, 0, 0, '#26292b', st.led ?? '#8a2a1a');
  lever(mount(g, -0.85, 0.62, DESK_Y - 0.05), 0, 0, 0, '#26292b', '#26292b');
  needles.warn = add(mount(g, -0.72, DESK_R + 0.12, DESK_Y + 0.07), new THREE.SphereGeometry(0.022, 10, 8), glow('#3a1a10'));
  if (st.switches) {
    for (let i = 0; i < 6; i++) {
      const sl = mount(g, 0.5 + i * 0.07, 0.6, DESK_Y - 0.04);
      add(sl, new THREE.BoxGeometry(0.02, 0.04, 0.02), lambert(i % 2 ? '#26292b' : '#a8b0b2'));
      add(sl, new THREE.SphereGeometry(0.008, 6, 4), glow(i < 4 ? '#7fbf7a' : '#3a1a10'), 0, 0.01, 0.04);
    }
  }
  if (st.led) for (let i = 0; i < 9; i++) add(mount(g, -0.5 + i * 0.125, 0.56, DESK_Y - 0.055), new THREE.BoxGeometry(0.03, 0.01, 0.03), glow(i % 3 ? '#2f4a66' : st.led));
  return { group: g, needles, screens };
}

/**
 * Crée le poste de pilotage du niveau de coque donné.
 * update(dt, state) anime les instruments ; state = { depth, crushDepth, oxygen, hull, heading, throttle, time }
 */
export function createCockpit(level) {
  const { group, needles, screens } = makeCockpit(level);
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
      const set = (n, v) => n && (n.rotation.z += (needleAngle(v) - n.rotation.z) * k);
      set(needles.depth, s.depth / Math.max(1, s.crushDepth * 1.2));
      set(needles.oxygen, s.oxygen);
      set(needles.hull, s.hull);
      if (needles.compass) needles.compass.rotation.z = -(s.heading * Math.PI) / 180;
      if (needles.throttle) needles.throttle.rotation.x += (s.throttle * 0.6 - needles.throttle.rotation.x) * k;
      if (needles.warn) needles.warn.material.color.copy(s.oxygen < 0.25 && Math.sin(s.time * 8) > 0 ? warnOn : warnOff);
      screenTimer -= dt;
      if (screenTimer <= 0) {
        screenTimer = 0.15;
        for (const sc of screens) sc.update(s);
      }
    },
  };
}
