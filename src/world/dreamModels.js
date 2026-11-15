import * as THREE from 'three';
import { createHalo } from '../loot/glow.js';
import { applySkin } from './detail.js';

/**
 * Les trois bêtes des profondeurs, refaites. Elles ne ressemblent à aucun animal : le rêve les a
 * fabriquées avec ce qui entoure le dormeur. Un tuyau annelé qui cherche une bouche (La Sonde),
 * un œil qu'une lampe force à s'ouvrir (L'Œil), deux poches qui se gonflent et se vident (Le Soufflet).
 * Formes lisses, face vers +Z. Les champs renvoyés sont ceux qu'anime Mutant.animate (creatures.js).
 */
const skin = (color, o = {}) => applySkin(new THREE.MeshLambertMaterial({ color, vertexColors: true, ...o }), { rim: 0.7, translucent: 0.6, iridescent: 0.25 });
const plain = (color, o = {}) => applySkin(new THREE.MeshLambertMaterial({ color, ...o }), { rim: 0.5, translucent: 0.3, iridescent: 0.15 });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
const TAU = Math.PI * 2;

/** Corps de révolution lisse le long de Z ; paint(c, t, a) colore par sommet (t le long du profil, a l'angle) */
function turned(profile, seg = 28, paint = null) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0005), z)), seg);
  geo.rotateX(Math.PI / 2);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(), rows = profile.length;
  for (let i = 0; i < n; i++) {
    c.setRGB(1, 1, 1);
    if (paint) paint(c, (i % rows) / (rows - 1), Math.floor(i / rows) / seg);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

/* ====================================================================== La Sonde */

/**
 * Un tuyau annelé, pâle et translucide, long de quinze mètres. Pas d'yeux. Au bout, un pavillon
 * qui s'ouvre comme une corolle sur une couronne d'aiguilles. Une lueur descend le long du corps.
 */
export function createSonde() {
  const root = new THREE.Group(), N = 18, SP = 0.6, S = 1.8;
  const mat = skin('#c2d0cb'), dark = plain('#3a2226', { side: THREE.DoubleSide });
  const rib = (c, t) => c.setScalar(0.62 + 0.38 * Math.pow(Math.abs(Math.sin(t * Math.PI * 3.5)), 0.5));
  const cores = [];
  const segments = [];
  for (let i = 0; i < N; i++) {
    const r = 0.4 * (1 - Math.pow(i / N, 2) * 0.72);
    // chaque tronçon déborde largement sur ses voisins : aucun jour dans les virages serrés
    const prof = [];
    for (let k = 0; k <= 14; k++) { const u = k / 14, z = (u - 0.5) * SP * 1.9; prof.push([r * Math.pow(Math.sin(Math.PI * u), 0.35) * (0.9 + 0.1 * Math.cos(u * Math.PI * 7)), z]); }
    const seg = new THREE.Group();
    mesh(seg, turned(prof, 22, rib), mat);
    // la lueur qui voyage à l'intérieur
    const core = mesh(seg, new THREE.SphereGeometry(r * 0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#000000' }));
    cores.push(core);
    seg.position.z = -(i + 1) * SP;
    root.add(seg);
    segments.push(seg);
  }
  // Tête : un col annelé, puis le pavillon
  const head = new THREE.Group();
  root.add(head);
  mesh(head, turned([[0.4, -0.5], [0.44, -0.2], [0.4, 0.05], [0.46, 0.3], [0.42, 0.5], [0.6, 0.85], [0.86, 1.15], [0.9, 1.22], [0.84, 1.2]], 30, (c, t) => c.setScalar(0.7 + 0.3 * t)), mat);
  mesh(head, turned([[0.84, 1.2], [0.5, 0.9], [0.3, 0.55], [0.12, 0.2], [0.01, 0.1]], 30), dark); // la gorge
  // couronne d'aiguilles, tournées vers l'intérieur
  const needle = new THREE.ConeGeometry(0.03, 0.42, 6).rotateX(Math.PI / 2), bone = plain('#e4e8dc');
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + ring * 0.22, R = 0.74 - ring * 0.26, t = mesh(head, needle, bone, Math.cos(a) * R, Math.sin(a) * R, 1.05 - ring * 0.22);
    t.lookAt(0, 0, 1.5 - ring * 0.2);
  }
  // six points lumineux autour du col (pas des yeux : des voyants)
  const lamps = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; lamps.push(mesh(head, new THREE.SphereGeometry(0.035, 8, 6), glow('#9fe8c8'), Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.3)); }
  // La « mâchoire » : la lèvre basse du pavillon, qui s'abaisse quand elle charge
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.3, 0.6);
  head.add(jaw);
  const lip = turned([[0.62, 0.25], [0.9, 0.58], [0.98, 0.7], [0.9, 0.68]], 30, (c, t) => c.setScalar(0.75 + 0.25 * t));
  // on ne garde que le tiers inférieur de la corolle
  const idx = [], lp = lip.attributes.position, li = lip.index.array;
  for (let i = 0; i < li.length; i += 3) if (lp.getY(li[i]) < -0.25 && lp.getY(li[i + 1]) < -0.25 && lp.getY(li[i + 2]) < -0.25) idx.push(li[i], li[i + 1], li[i + 2]);
  lip.setIndex(idx);
  mesh(jaw, lip, skin('#c2d0cb', { side: THREE.DoubleSide }), 0, 0.3, 0);
  for (let i = 0; i < 5; i++) { const a = Math.PI * (1.2 + i * 0.15), t = mesh(jaw, needle, bone, Math.cos(a) * 0.85, Math.sin(a) * 0.85 + 0.3, 0.62); t.lookAt(0, 0.6, 1.3); }
  const halo = createHalo('#9fe8c8', 2.2);
  halo.material.opacity = 0.35;
  halo.position.z = 0.9;
  head.add(halo);

  head.scale.setScalar(S);
  for (const s of segments) s.scale.setScalar(S);
  return {
    root, head, jaw, segments, spacing: SP * S,
    /** La lueur descend le corps, tronçon après tronçon ; plus vite quand elle charge */
    tick(t, charging) {
      const sp = charging ? 9 : 2.2;
      for (let i = 0; i < N; i++) {
        const w = Math.max(0, Math.sin(t * sp - i * 0.7)) ** 6;
        cores[i].material.color.setRGB(0.5 * w, 1.4 * w, 1.0 * w);
      }
      const b = charging ? 1 : 0.5 + 0.3 * Math.sin(t * 2.2);
      for (const l of lamps) l.material.color.setRGB(0.6 * b, 1.3 * b, 1.0 * b);
    },
  };
}

/* ====================================================================== L'Œil */

/**
 * Un globe pâle, veiné, grand comme le sous-marin. Une seule pupille, qui se rétracte quand il
 * vous a vu. Derrière, un faisceau de nerfs qui traîne. Au-dessus, une petite lampe qui se balance
 * et le force à rester ouvert.
 */
export function createOeil() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  // Le globe : blanc sale, veines rouges qui convergent vers l'arrière
  const prof = [];
  for (let k = 0; k <= 26; k++) { const u = k / 26, a = u * Math.PI; prof.push([Math.sin(a) * (1 + 0.06 * Math.sin(a * 2)), -Math.cos(a) * 0.94]); }
  const white = turned(prof, 40, (c, t, a) => {
    const vein = Math.pow(Math.abs(Math.sin(a * TAU * 5 + Math.sin(t * 9) * 1.6 + hash(Math.floor(a * 10), 1) * 3)), 18) * (1 - t) * 1.4;
    c.setRGB(0.86, 0.84, 0.78).lerp(new THREE.Color(0.5, 0.1, 0.1), Math.min(0.85, vein)).multiplyScalar(0.75 + 0.25 * t);
  });
  mesh(body, white, skin('#ffffff'));
  // L'iris : anneau ambre strié, pupille noire, cornée bombée
  const iris = new THREE.RingGeometry(0.05, 0.5, 48, 6), ip = iris.attributes.position, ic = new Float32Array(ip.count * 3), c = new THREE.Color();
  for (let i = 0; i < ip.count; i++) {
    const r = Math.hypot(ip.getX(i), ip.getY(i)), a = Math.atan2(ip.getY(i), ip.getX(i));
    const k = 0.55 + 0.45 * Math.sin(a * 23 + r * 9) * Math.sin(a * 7);
    c.setRGB(1.1, 0.62, 0.16).multiplyScalar((0.3 + 0.7 * k) * (1.2 - r * 1.3));
    ic[i * 3] = c.r; ic[i * 3 + 1] = c.g; ic[i * 3 + 2] = c.b;
  }
  iris.setAttribute('color', new THREE.BufferAttribute(ic, 3));
  mesh(body, iris, new THREE.MeshBasicMaterial({ vertexColors: true }), 0, 0, 0.955);
  const pupil = mesh(body, new THREE.CircleGeometry(0.3, 40), glow('#020304'), 0, 0, 0.962);
  const cornea = mesh(body, new THREE.SphereGeometry(0.62, 32, 16, 0, TAU, 0, 0.95).rotateX(Math.PI / 2), applySkin(new THREE.MeshLambertMaterial({ color: '#cfe0dc', transparent: true, opacity: 0.22, depthWrite: false }), { rim: 1.6, translucent: 1, iridescent: 0.9 }), 0, 0, 0.5);
  cornea.renderOrder = 2;
  const front = createHalo('#e0b050', 2.4);
  front.material.opacity = 0.25;
  front.position.z = 1.2;
  body.add(front);

  // Paupière haute, figée à demi ; paupière basse = la « mâchoire » : elle s'abaisse sur une rangée de cils durs
  const lidMat = skin('#8f8a80', { side: THREE.DoubleSide });
  const lidGeo = (a0, a1) => new THREE.SphereGeometry(1.07, 40, 12, 0, Math.PI, a0, a1 - a0).rotateY(-Math.PI / 2).rotateZ(Math.PI / 2);
  const paintLid = (g) => { const n = g.attributes.position.count, col = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  const upper = mesh(body, paintLid(new THREE.SphereGeometry(1.07, 40, 12, 0, TAU, 0, 1.0)), lidMat);
  upper.rotation.x = 0.35; // calotte posée sur le haut du globe, penchée vers l'avant
  const jaw = new THREE.Group();
  body.add(jaw);
  const lower = mesh(jaw, paintLid(new THREE.SphereGeometry(1.07, 40, 12, 0, TAU, Math.PI - 0.95, 0.95)), lidMat);
  lower.rotation.x = -0.7;
  const lash = new THREE.ConeGeometry(0.035, 0.38, 6), bone = plain('#d8d4c0');
  for (let i = 0; i < 13; i++) {
    const a = (i / 12 - 0.5) * 1.9, t = mesh(jaw, lash, bone, Math.sin(a) * 0.82, -0.52 - Math.cos(a) * 0.1, 0.72 * Math.cos(a) + 0.12);
    t.rotation.x = 0.5;
  }
  void lidGeo;

  // Les nerfs : un faisceau qui traîne derrière et ondule
  const tail = new THREE.Group();
  tail.position.z = -0.85;
  body.add(tail);
  const nerveMat = skin('#b08a84');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU, L = 2.2 + hash(i, 3) * 1.8, pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push(new THREE.Vector3(Math.cos(a) * (0.25 + u * 0.35 * Math.sin(u * 4 + i)), Math.sin(a) * (0.25 + u * 0.3) - u * u * 0.6, -u * L)); }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.11, 8), tp = tube.attributes.position;
    // effilé vers le bout
    for (let k = 0; k < tp.count; k++) { const ring = Math.floor(k / 9), u = ring / 24, cp = pts[Math.min(8, Math.round(u * 8))]; tp.setXYZ(k, cp.x + (tp.getX(k) - cp.x) * (1 - u * 0.8), cp.y + (tp.getY(k) - cp.y) * (1 - u * 0.8), tp.getZ(k)); }
    tube.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tp.count * 3).fill(1), 3));
    tube.computeVertexNormals();
    mesh(tail, tube, nerveMat);
  }
  // Deux voiles latéraux
  const pect = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(s * 0.95, -0.1, -0.2);
    const g = new THREE.CircleGeometry(0.45, 20, 0, Math.PI).rotateX(-Math.PI / 2).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh(f, g, applySkin(new THREE.MeshLambertMaterial({ color: '#b08a84', side: THREE.DoubleSide, transparent: true, opacity: 0.7 }), { rim: 0.9, translucent: 1.2, iridescent: 0.4 }));
    body.add(f);
    pect.push(f);
  }
  // La lampe : une tige qui part du dessus, se recourbe devant la pupille
  const stalk = new THREE.Group();
  stalk.position.set(0, 0.95, 0.1);
  body.add(stalk);
  const sc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.7, 0.2), new THREE.Vector3(0, 0.95, 0.9), new THREE.Vector3(0, 0.55, 1.6)]);
  mesh(stalk, new THREE.TubeGeometry(sc, 20, 0.04, 8), plain('#5a5650'));
  mesh(stalk, new THREE.SphereGeometry(0.09, 12, 8), glow('#fff6d8'), 0, 0.55, 1.6);
  const lureHalo = createHalo('#fff0c0', 3.2);
  lureHalo.position.set(0, 0.55, 1.6);
  stalk.add(lureHalo);

  body.scale.setScalar(1.7);
  return {
    root, body, tail, jaw, pect, stalk, lureHalo, lures: [lureHalo, front],
    /** La pupille : large quand il cherche, une tête d'épingle quand il a trouvé */
    tick(t, charging) {
      const k = charging ? 0.35 : 1 + Math.sin(t * 0.8) * 0.12;
      pupil.scale.setScalar(pupil.scale.x + (k - pupil.scale.x) * 0.15);
    },
  };
}

/* ====================================================================== Le Soufflet */

/**
 * Deux poches plissées, accolées, qui se gonflent et se vident lentement. Elles dérivent, et ce
 * qui pend dessous brûle. On l'entend respirer avant de le voir.
 */
export function createSoufflet() {
  const root = new THREE.Group(), bell = new THREE.Group();
  root.add(bell);
  const mat = applySkin(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 0.86 }), { rim: 1, translucent: 1.1, iridescent: 0.3 });
  // une poche : ovoïde plissé dans le sens de la hauteur, pâle, rosé vers le bas
  const lobe = () => {
    const prof = [];
    for (let k = 0; k <= 22; k++) { const u = k / 22, a = u * Math.PI; prof.push([Math.sin(a) * (0.62 + 0.14 * Math.sin(a)) * (0.75 + 0.25 * u), -Math.cos(a) * 1.05]); }
    const g = turned(prof, 36, (c, t, a) => c.setRGB(0.78, 0.74, 0.72).lerp(new THREE.Color(0.62, 0.42, 0.42), (1 - t) * 0.6).multiplyScalar(0.72 + 0.28 * Math.pow(Math.abs(Math.sin(a * TAU * 9)), 0.6)));
    g.rotateX(-Math.PI / 2); // l'axe du tour redevient vertical
    return g;
  };
  for (const s of [-1, 1]) { const m = mesh(bell, lobe(), mat, s * 0.52, 0, 0); m.rotation.z = s * 0.2; }
  // le conduit qui les réunit, annelé, coupé net en haut
  const duct = turned(Array.from({ length: 14 }, (_, k) => [0.16 + 0.03 * Math.cos(k * 2.1), k * 0.09]), 20, (c, t) => c.setScalar(0.6 + 0.3 * Math.abs(Math.sin(t * 20))));
  duct.rotateX(-Math.PI / 2);
  mesh(bell, duct, plain('#b9b0a8', { vertexColors: true }), 0, 0.75, 0);
  for (const s of [-1, 1]) { const b = mesh(bell, new THREE.CylinderGeometry(0.1, 0.13, 0.7, 14), plain('#b9b0a8'), s * 0.26, 0.7, 0); b.rotation.z = s * 0.9; }
  // dedans : une lueur, et trois clapets qui battent
  const halo = createHalo('#a8e0c0', 4.5);
  halo.material.opacity = 0.35;
  bell.add(halo);
  const innerEyes = [];
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Group();
    v.position.set((i - 1) * 0.5, -0.15 + (i % 2) * 0.3, 0.42);
    mesh(v, new THREE.TorusGeometry(0.11, 0.03, 8, 20), plain('#2a2024'));
    mesh(v, new THREE.CircleGeometry(0.1, 16, 0, Math.PI), glow('#3a1418'));
    bell.add(v);
    innerEyes.push(v);
  }
  // Ce qui pend : des bronches, par touffes, de plus en plus fines
  const tendrils = [], tmat = skin('#c79a98', { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, R = 0.25 + (i % 3) * 0.22;
    let parent = new THREE.Group();
    parent.position.set(Math.cos(a) * R * 1.6, -0.85, Math.sin(a) * R * 0.7);
    root.add(parent);
    const n = 8 + (i % 3) * 2;
    for (let k = 0; k < n; k++) {
      const seg = new THREE.Group(), r0 = 0.055 * (1 - k / n) + 0.008, r1 = 0.055 * (1 - (k + 1) / n) + 0.008, L = 0.48;
      seg.position.y = k === 0 ? 0 : -L;
      seg.rotation.set(Math.sin(i * 2.1 + k * 0.9) * 0.12, 0, Math.cos(i * 1.3 + k * 0.7) * 0.12); // pose au repos : ça pend, ça ne tombe pas droit
      const g = new THREE.CylinderGeometry(r0, r1, L * 1.06, 10, 1);
      g.translate(0, -L / 2, 0);
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      mesh(seg, g, tmat);
      // une ramification sur deux
      if (k > 1 && (k + i) % 3 === 0) { const b = mesh(seg, g.clone().scale(0.5, 0.9, 0.5), tmat, 0, -L * 0.4, 0); b.rotation.z = ((k + i) % 2 ? 1 : -1) * 0.55; }
      parent.add(seg);
      if (k > 0) tendrils.push(seg);
      parent = seg;
    }
  }
  root.scale.setScalar(1.6);
  return { root, bell, tendrils, halo, innerEyes };
}
