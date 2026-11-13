import * as THREE from 'three';
import { paintFaces } from '../core/utils.js';
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
const vmat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

/** Peinture irrégulière (taches, rouille) */
function paint(geo, base, rust = 0.2, rustColor = '#4a2615') {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const b = new THREE.Color(base), r = new THREE.Color(rustColor), c = new THREE.Color();
  paintFaces(geo, (p, n, i) => {
    const v = noise(p.x * 3 + p.z * 2, p.y * 3) * 0.5 + 0.5;
    c.copy(v > 1 - rust ? r : b).multiplyScalar(0.85 + (i % 5) * 0.06);
    return c;
  });
  return geo;
}

/**
 * Paroi plane percée de trous, extrudée vers +Z.
 * holes : { type: 'circle', x, y, r } | { type: 'ellipse', x, y, rx, ry } | { type: 'poly', points: [[x, y]…] }
 */
function wallWithHoles(w, h, holes, depth = 0.08) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();
  for (const hole of holes) {
    const p = new THREE.Path();
    if (hole.type === 'circle') p.absarc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true);
    else if (hole.type === 'ellipse') p.absellipse(hole.x, hole.y, hole.rx, hole.ry, 0, Math.PI * 2, true);
    else {
      hole.points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
    }
    shape.holes.push(p);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 28 });
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

/* ================================================================== Cabines */

/**
 * Cabine commune : parois, plafond, plancher, tableau de bord, tuyaux.
 * cfg : couleurs et hublots propres au modèle.
 */
function cabin(cfg) {
  const g = new THREE.Group();
  const W = 2.4, H = 1.8;
  const zFront = cfg.frontZ ?? 0.75;

  // Paroi avant percée
  add(g, paint(wallWithHoles(W, H, cfg.holes, cfg.wallDepth ?? 0.08), cfg.wall, cfg.rust ?? 0.15, cfg.rustColor), vmat(), 0, -0.05, zFront);
  // Côtés, plafond, plancher (légèrement resserrés vers l'avant)
  for (const s of [-1, 1]) {
    const side = add(g, paint(new THREE.BoxGeometry(0.06, H, 1.8), cfg.wall, cfg.rust ?? 0.15, cfg.rustColor), vmat(), s * W / 2, -0.05, -0.1);
    side.rotation.y = s * 0.08;
  }
  add(g, paint(new THREE.BoxGeometry(W, 0.06, 1.8), cfg.ceiling ?? cfg.wall, 0.1, cfg.rustColor), vmat(), 0, H / 2 - 0.05, -0.1);
  add(g, paint(new THREE.BoxGeometry(W, 0.06, 1.8), cfg.floor ?? '#26292b', 0.05), vmat(), 0, -H / 2 - 0.05, -0.1);

  // Tableau de bord incliné sous le hublot
  const dash = add(g, paint(new THREE.BoxGeometry(W - 0.2, 0.06, 0.5), cfg.dash, 0.08), vmat(), 0, -0.52, 0.48);
  dash.rotation.x = -0.55;
  add(g, paint(new THREE.BoxGeometry(W - 0.2, 0.42, 0.06), cfg.dash, 0.05), vmat(), 0, -0.76, 0.66);

  // Tuyaux le long des parois et du plafond
  const pc = cfg.pipe ?? '#5f6564';
  for (const s of [-1, 1]) {
    pipe(g, new THREE.Vector3(s * 1.1, 0.75, 0.7), new THREE.Vector3(s * 1.1, 0.75, -0.9), 0.035, pc);
    pipe(g, new THREE.Vector3(s * 1.08, -0.85, 0.6), new THREE.Vector3(s * 1.08, 0.7, 0.6), 0.025, pc);
  }
  pipe(g, new THREE.Vector3(-0.9, 0.82, 0.3), new THREE.Vector3(0.9, 0.82, 0.3), 0.03, pc);
  return g;
}

/** Ampoule de cabine (lumière chaude, non éclairée) */
function bulb(group, x, y, z, color = '#efe3bb') {
  add(group, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), lambert('#26292b'), x, y + 0.06, z);
  add(group, new THREE.SphereGeometry(0.035, 8, 6), glow(color), x, y, z);
}

/** Instruments analogiques classiques : cadrans + manette + voyant */
function analogPanel(g, cfg, needles, extra = {}) {
  const y = -0.48, z = 0.52;
  needles.depth = dial(g, -0.42, y, z, 0.11, cfg.face, cfg.rim);
  needles.oxygen = dial(g, -0.15, y, z, 0.09, cfg.face, cfg.rim);
  needles.hull = dial(g, 0.12, y, z, 0.09, cfg.face, cfg.rim);
  if (extra.compass !== false) {
    const comp = dial(g, 0.4, y, z, 0.1, '#26292b', cfg.rim);
    needles.compass = comp;
  }
  needles.throttle = lever(g, 0.75, -0.55, 0.42);
  // Voyant d'alerte (oxygène)
  needles.warn = add(g, new THREE.SphereGeometry(0.025, 8, 6), glow('#3a1a10'), -0.7, -0.44, 0.5);
}

function makeCockpit(level) {
  const needles = {};
  let screens = [];
  let g;
  switch (level) {
    case 0:
    case 1: {
      const brass = level === 1;
      g = cabin({
        wall: brass ? '#4a3a28' : '#3a2a20', rust: brass ? 0.15 : 0.35, rustColor: '#63321b',
        dash: '#3e2114', pipe: brass ? '#8a6a3a' : '#5a4a3a',
        holes: [{ type: 'circle', x: 0, y: 0.1, r: 0.46 }],
      });
      add(g, new THREE.TorusGeometry(0.47, 0.045, 6, 28), lambert(brass ? '#b08a50' : '#5a3a22'), 0, 0.05, 0.74);
      add(g, new THREE.TorusGeometry(0.53, 0.025, 4, 28), lambert(brass ? '#8a6a3a' : '#3e2a1a'), 0, 0.05, 0.73);
      bolts(g, 0, 0.05, 0.72, 0.53, brass ? 20 : 14, brass ? '#c8a870' : '#7a6650');
      if (brass) {
        // Plaques de réparation boulonnées sur la paroi
        for (const [x, y] of [[-0.85, 0.45], [0.8, -0.2]]) {
          add(g, paint(new THREE.BoxGeometry(0.32, 0.26, 0.02), '#6b6e6c', 0.1), vmat(), x, y, 0.69);
          bolts(g, x, y, 0.68, 0.17, 6, '#a8b0b2', 0.012);
        }
      }
      analogPanel(g, { face: '#e8dcc0', rim: brass ? '#b08a50' : '#6b5a46' }, needles);
      valve(g, -1.05, 0.2, 0.2, 0.12, '#8a2a1a', Math.PI / 2);
      bulb(g, 0.35, 0.68, 0.2);
      break;
    }
    case 2: {
      g = cabin({
        wall: '#3f4a54', rust: 0.05, dash: '#2f3840', pipe: '#6b7680',
        holes: [{ type: 'circle', x: -0.38, y: 0.08, r: 0.32 }, { type: 'circle', x: 0.38, y: 0.08, r: 0.32 }],
      });
      for (const x of [-0.38, 0.38]) {
        add(g, new THREE.TorusGeometry(0.33, 0.04, 6, 24), lambert('#6b7680'), x, 0.03, 0.74);
        bolts(g, x, 0.03, 0.72, 0.38, 12, '#a8b0b2');
      }
      analogPanel(g, { face: '#e8ece2', rim: '#6b7680' }, needles);
      // Rangée d'interrupteurs
      for (let i = 0; i < 6; i++) {
        add(g, new THREE.BoxGeometry(0.03, 0.05, 0.03), lambert(i % 2 ? '#26292b' : '#a8b0b2'), -0.3 + i * 0.12, -0.66, 0.62).rotation.x = 0.4;
        add(g, new THREE.SphereGeometry(0.012, 6, 4), glow(i < 4 ? '#7fbf7a' : '#3a1a10'), -0.3 + i * 0.12, -0.6, 0.6);
      }
      bulb(g, 0, 0.7, 0.15, '#ccd8cc');
      valve(g, 1.05, 0.25, 0.1, 0.1, '#3f4a54', Math.PI / 2);
      break;
    }
    case 3: {
      g = cabin({
        wall: '#2f3d40', rust: 0.05, dash: '#24302f', pipe: '#5f6564',
        holes: [{ type: 'ellipse', x: 0, y: 0.08, rx: 0.82, ry: 0.42 }],
      });
      add(g, new THREE.BoxGeometry(0.05, 0.86, 0.05), lambert('#4a5658'), 0, 0.08, 0.77); // montant central
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32), lambert('#4a5658'));
      frame.scale.set(0.83, 0.43, 1);
      frame.position.set(0, 0.08, 0.74);
      g.add(frame);
      analogPanel(g, { face: '#ccd8cc', rim: '#4a5658' }, needles, { compass: false });
      screens.push(
        screen(g, 0.42, -0.5, 0.5, 0.26, 0.16, (c, w, h, s) => {
          c.font = '26px monospace';
          c.fillText(`PROF ${String(Math.round(s.depth)).padStart(4, '0')} m`, 10, 40);
          c.fillText(`CAP  ${String(Math.round(s.heading)).padStart(3, '0')}°`, 10, 80);
          c.fillText(`O2   ${Math.round(s.oxygen * 100)} %`, 10, 120);
        }, -0.55, '#7fbf7a')
      );
      bulb(g, 0, 0.72, 0.1, '#ccd8cc');
      break;
    }
    case 4: {
      g = cabin({
        wall: '#5f6564', rust: 0.04, dash: '#45484a', pipe: '#878a85', wallDepth: 0.18,
        holes: [{ type: 'circle', x: 0, y: 0.1, r: 0.32 }],
      });
      // Hublot épais du bathyscaphe : cône de verre et grosse couronne boulonnée
      add(g, new THREE.CylinderGeometry(0.42, 0.33, 0.2, 24, 1, true).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#45484a', side: THREE.DoubleSide, flatShading: true }), 0, 0.05, 0.78);
      add(g, new THREE.TorusGeometry(0.44, 0.06, 6, 28), lambert('#878a85'), 0, 0.05, 0.72);
      bolts(g, 0, 0.05, 0.69, 0.52, 16, '#a8b0b2', 0.03);
      analogPanel(g, { face: '#e8ece2', rim: '#878a85' }, needles);
      // Instruments entassés autour du hublot
      for (const [x, y] of [[-0.7, 0.35], [0.7, 0.35], [-0.72, -0.05], [0.72, -0.05]]) {
        const n = dial(g, x, y, 0.69, 0.08, '#e8ece2', '#878a85', 0);
        n.rotation.z = Math.random() * 3;
      }
      valve(g, -1.05, -0.2, 0.3, 0.13, '#b8963a', Math.PI / 2);
      bulb(g, 0.4, 0.7, 0.1);
      break;
    }
    case 5: {
      g = cabin({
        wall: '#8a9396', rust: 0.02, dash: '#45484a', pipe: '#c08850', floor: '#3f4446',
        holes: [{ type: 'circle', x: 0, y: 0.15, r: 0.62 }],
      });
      add(g, new THREE.TorusGeometry(0.63, 0.03, 5, 36), lambert('#45484a'), 0, 0.1, 0.74);
      analogPanel(g, { face: '#e8ece2', rim: '#45484a' }, needles, { compass: false });
      screens.push(
        screen(g, 0.45, -0.5, 0.5, 0.3, 0.18, (c, w, h, s) => {
          c.font = '24px monospace';
          c.fillText(`PROFONDEUR`, 10, 30);
          c.font = '44px monospace';
          c.fillText(`${String(Math.round(s.depth)).padStart(4, '0')} m`, 10, 80);
          c.font = '20px monospace';
          c.fillText(`LIMITE ${Math.round(s.crushDepth)} m`, 10, 115);
        }, -0.55, '#e0b050')
      );
      bulb(g, 0, 0.72, 0.0, '#efe3bb');
      break;
    }
    default: {
      // 6 : coque abyssale — baie panoramique anguleuse, écrans, liserés lumineux
      const pts = [[-0.95, -0.12], [-0.8, 0.42], [-0.5, 0.52], [0.5, 0.52], [0.8, 0.42], [0.95, -0.12], [0.7, -0.3], [-0.7, -0.3]];
      g = cabin({ wall: '#24292c', rust: 0, dash: '#1a1e21', pipe: '#30363a', floor: '#14181b', ceiling: '#1a1e21', holes: [{ type: 'poly', points: pts }] });
      // Liserés autour de la baie et le long des parois
      for (let i = 0; i < pts.length; i++) {
        const a = new THREE.Vector3(pts[i][0], pts[i][1] - 0.05, 0.73);
        const b = new THREE.Vector3(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1] - 0.05, 0.73);
        const strip = pipe(g, a, b, 0.008, '#000');
        strip.material = glow('#7fd0c0');
      }
      for (const s of [-1, 1]) {
        const led = pipe(g, new THREE.Vector3(s * 1.08, 0.55, 0.65), new THREE.Vector3(s * 1.08, 0.55, -0.9), 0.008, '#000');
        led.material = glow('#7fd0c0');
      }
      needles.throttle = lever(g, 0.8, -0.55, 0.42, '#30363a', '#7fd0c0');
      needles.warn = add(g, new THREE.SphereGeometry(0.02, 8, 6), glow('#3a1a10'), -0.8, -0.46, 0.5);
      screens.push(
        screen(g, -0.45, -0.5, 0.5, 0.36, 0.2, (c, w, h, s) => {
          c.font = '22px monospace';
          c.fillText('PROFONDEUR', 12, 30);
          c.font = '50px monospace';
          c.fillText(`${String(Math.round(s.depth)).padStart(4, '0')}`, 12, 90);
          c.fillRect(12, 110, (w - 24) * Math.min(1, s.depth / s.crushDepth), 8);
        }),
        screen(g, 0, -0.5, 0.52, 0.3, 0.2, (c, w, h, s) => {
          // Mini sonar
          const cx = w / 2, cy = h / 2 + 6, r = h / 2 - 12;
          c.lineWidth = 2;
          c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.arc(cx, cy, r / 2, 0, Math.PI * 2); c.stroke();
          const a = s.time * 2.4;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
        }),
        screen(g, 0.45, -0.5, 0.5, 0.36, 0.2, (c, w, h, s) => {
          c.font = '22px monospace';
          c.fillText(`O2    ${Math.round(s.oxygen * 100)} %`, 12, 36);
          c.fillText(`COQUE ${Math.round(s.hull * 100)} %`, 12, 72);
          c.fillText(`CAP   ${String(Math.round(s.heading)).padStart(3, '0')}°`, 12, 108);
        })
      );
      // Boutons lumineux
      for (let i = 0; i < 8; i++) add(g, new THREE.BoxGeometry(0.035, 0.012, 0.035), glow(i % 3 ? '#2f4a66' : '#7fd0c0'), -0.42 + i * 0.12, -0.66, 0.6).rotation.x = -0.55;
      break;
    }
  }
  return { group: g, needles, screens };
}

/**
 * Crée le poste de pilotage du niveau de coque donné.
 * update(dt, state) anime les instruments ; state = { depth, crushDepth, oxygen, hull, heading, throttle, time }
 */
export function createCockpit(level) {
  const { group, needles, screens } = makeCockpit(level);
  // L'œil est un peu en retrait et au-dessus du tableau de bord : on voit hublot ET instruments
  group.position.set(0, -0.04, 0.15);
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
