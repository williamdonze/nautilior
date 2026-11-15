import * as THREE from 'three';

/**
 * Personnages du village : semi-réalistes, tête sculptée, corps articulé.
 * Pivot au sol, face vers +Z. Les membres sont des groupes animables (marche, respiration).
 */
const SKIN = '#b9917a';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const TAU = Math.PI * 2;
const gauss = (d, s) => Math.exp(-(d * d) / (s * s));

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Forme du crâne (sans les traits) : facteurs d'échelle en un point de la sphère. Partagée par la tête, les cheveux et la barbe. */
function skull(y, z, female) {
  const low = Math.max(0, -y - 0.15) / 0.85;
  return { sx: 0.78 * (1 - (female ? 0.4 : 0.3) * Math.pow(low, 1.3)), sz: 0.92 * (1 - 0.22 * Math.pow(low, 1.5) * (z < 0 ? 1.6 : 0.5)), low };
}

/**
 * Tête sculptée : une sphère fine modelée point par point — crâne, mâchoire, pommettes, arcades,
 * orbites, nez (arête, bout, ailes), deux lèvres, menton, plis. La couleur suit le relief : lèvres,
 * joues, ombres des creux, rides, barbe naissante. Regarde vers +Z, ~0,24 m du menton au sommet.
 * @param {object} o skin, female (traits plus doux), aged (creusé, ridé), stubble (couleur ou null)
 */
function headGeometry(o) {
  const geo = new THREE.SphereGeometry(1, 96, 72);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const skin = new THREE.Color(o.skin), lip = skin.clone().lerp(new THREE.Color('#8a3a34'), o.female ? 0.65 : 0.42), dark = skin.clone().multiplyScalar(0.5);
  const blush = skin.clone().lerp(new THREE.Color('#c0605a'), 0.35), stub = o.stubble ? new THREE.Color(o.stubble) : null, c = new THREE.Color();
  const M = o.female ? 0.75 : 1, A = o.aged ? 1 : 0; // force des traits, âge
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), f = Math.pow(Math.max(0, z), 0.8);
    const { sx, sz } = skull(y, z, o.female);
    let r = 1, shade = 0;
    r += 0.08 * gauss(y - 0.02, 0.2) * gauss(ax - 0.52, 0.22) * f; // pommettes
    r += 0.075 * M * gauss(y - 0.31, 0.07) * gauss(ax - 0.3, 0.26) * f; // arcades
    r += 0.03 * gauss(y - 0.6, 0.25) * gauss(ax, 0.5) * f; // front bombé
    const orbit = gauss(y - 0.17, 0.075) * gauss(ax - 0.33, 0.125) * f;
    r -= 0.07 * orbit; shade += 0.28 * orbit; // orbites
    r -= 0.035 * gauss(y - 0.2, 0.06) * gauss(ax, 0.1) * f; // racine du nez
    const bridge = gauss(ax, 0.065) * sstep(0.26, 0.1, y) * sstep(-0.16, -0.06, y);
    r += 0.17 * bridge * f; // arête
    r += 0.2 * gauss(ax, 0.105) * gauss(y + 0.1, 0.075) * f; // bout du nez
    r += 0.07 * gauss(ax - 0.115, 0.05) * gauss(y + 0.125, 0.045) * f; // ailes
    shade += 0.6 * gauss(ax - 0.06, 0.03) * gauss(y + 0.175, 0.02) * f + 0.35 * gauss(ax, 0.16) * gauss(y + 0.2, 0.03) * f; // narines, ombre sous le nez
    const fold = gauss(ax - (0.19 + (-y - 0.1) * 0.35), 0.03) * sstep(-0.48, -0.36, y) * sstep(-0.08, -0.16, y) * f; // pli du nez à la bouche
    r -= (0.012 + 0.02 * A) * fold; shade += (0.18 + 0.3 * A) * fold;
    const upper = gauss(ax, 0.2) * gauss(y + 0.325, 0.035), lower = gauss(ax, 0.16) * gauss(y + 0.415, 0.04), slit = gauss(ax, 0.23) * gauss(y + 0.368, 0.012);
    r += (0.05 * upper + 0.06 * lower + 0.03 * gauss(ax, 0.3) * gauss(y + 0.36, 0.1) - 0.04 * slit) * f; // lèvres sur le relief des dents
    r -= 0.035 * gauss(ax, 0.25) * gauss(y + 0.52, 0.045) * f; shade += 0.3 * gauss(ax, 0.22) * gauss(y + 0.52, 0.04) * f; // creux sous la lèvre
    r += 0.075 * M * gauss(ax, 0.2) * gauss(y + 0.68, 0.11) * f; // menton
    r += 0.03 * M * gauss(ax - 0.5, 0.15) * gauss(y + 0.45, 0.14); // angle de la mâchoire
    r -= (0.02 + 0.035 * A) * gauss(ax - 0.34, 0.13) * gauss(y + 0.22, 0.18) * f; // joues
    r -= 0.05 * gauss(y - 0.25, 0.3) * gauss(ax - 0.75, 0.2); // tempes
    // rides de l'âge : front, pattes d'oie, poches sous les yeux
    const lines = A * (Math.pow(Math.max(0, Math.sin(y * 62)), 6) * gauss(y - 0.52, 0.1) * gauss(ax, 0.42) * f + gauss(y - 0.13, 0.05 + ax * 0.08) * gauss(ax - 0.5, 0.06) * Math.pow(Math.abs(Math.sin((y - ax * 0.4) * 70)), 4) * f);
    const bag = A * gauss(y - 0.075, 0.03) * gauss(ax - 0.33, 0.11) * f;
    r -= 0.006 * lines; r += 0.012 * bag; shade += 0.3 * lines + 0.22 * gauss(y - 0.045, 0.02) * gauss(ax - 0.33, 0.12) * f * A;
    shade += 0.35 * sstep(-0.6, -0.95, y) * (1 - f * 0.4); // dessous de la mâchoire
    p.setXYZ(i, x * sx * r, y * r - 0.03, z * sz * r);
    c.copy(skin);
    c.lerp(blush, 0.5 * gauss(y + 0.05, 0.16) * gauss(ax - 0.45, 0.2) * f + 0.25 * gauss(ax, 0.1) * gauss(y + 0.1, 0.07) * f);
    c.lerp(lip, Math.min(1, 1.5 * (upper + lower) * f));
    c.lerp(dark, Math.min(0.85, shade + 0.9 * slit * f));
    if (stub) c.lerp(stub, 0.45 * sstep(-0.1, -0.4, y) * (0.4 + 0.6 * Math.max(0, z)) * (1 - Math.min(1, 2 * (upper + lower))));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.scale(0.12, 0.12, 0.12);
  return geo;
}

/** Où poussent les cheveux (> 0 : cheveux) selon le style. Fonction continue : les bords sont nets. */
function hairMask(style, x, y, z) {
  const ax = Math.abs(x), back = Math.max(0, -z);
  if (style === 'bald') return Math.min(0.3 - z, 0.6 - 0.9 * Math.max(0, z) - y, y + 0.22 + 0.45 * back); // couronne
  const front = Math.max(y - (0.5 + 0.18 * ax + 0.1 * z), style === 'long' ? Math.min(ax - 0.72, y + 0.95) : -1); // front dégagé ; les cheveux longs encadrent le visage
  const rear = style === 'long' ? 1 : y + 0.14 + 0.5 * back;
  const t = sstep(0.08, 0.34, z);
  return rear * (1 - t) + front * t;
}

/**
 * Chevelure : une coque qui épouse le crâne. Là où il n'y a pas de cheveux, elle rentre sous la peau
 * (aucun triangle coupé : la ligne d'implantation est l'intersection des deux surfaces, donc lisse).
 */
function hairGeometry(style, female = false, lift = 0.07) {
  const geo = new THREE.SphereGeometry(1, 80, 60), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const { sx, sz } = skull(y, z, female);
    const m = sstep(-0.035, 0.035, hairMask(style, x, y, z));
    const strand = (Math.sin(a * 34 + y * 11) * 0.01 + Math.sin(a * 11 + y * 5) * 0.016) * m;
    const k = 0.88 + (0.12 + lift + strand) * m;
    // cheveux longs : sous le crâne, ils tombent droit au lieu de suivre la mâchoire
    const fall = style === 'long' ? m * sstep(0, -0.5, y) : 0;
    p.setXYZ(i, x * (sx * (1 - fall) + 0.8 * fall) * k, (y < 0 ? y * (1 + 0.5 * fall) : y) * k - 0.03, z * (sz * (1 - fall) + 0.9 * fall) * k);
  }
  geo.computeVertexNormals();
  geo.scale(0.12, 0.12, 0.12);
  return geo;
}

/** Barbe : même principe — une coque sur la mâchoire, plus épaisse au menton, qui laisse la bouche libre */
function beardGeometry() {
  const geo = new THREE.SphereGeometry(1, 80, 60), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), a = Math.atan2(x, z);
    const { sx, sz, low } = skull(y, z, false);
    let mask = Math.min(z + 0.2, -0.24 + 0.4 * Math.max(0, 0.5 - z) - y); // mâchoire, pattes devant l'oreille
    mask = Math.max(mask, Math.min(0.21 - ax, y + 0.3, -0.2 - y, z - 0.5) * 2); // moustache
    mask = Math.min(mask, Math.max(ax - 0.17, Math.abs(y + 0.375) - 0.04) * 2 + 0.02 * (z < 0.5 ? 50 : 0)); // la bouche reste libre
    const m = sstep(-0.03, 0.03, mask);
    const k = 0.88 + (0.2 + 0.16 * low * sstep(0.2, 0.7, z) + Math.sin(a * 38 + y * 16) * 0.012) * m;
    p.setXYZ(i, x * sx * k, y * (1 + 0.14 * low * m) * k - 0.03, z * sz * k);
  }
  geo.computeVertexNormals();
  geo.scale(0.12, 0.12, 0.12);
  return geo;
}

/** Corps de révolution à section ovale : profil [rayon, y], épaisseur = part de la largeur */
function shell(profile, depth = 0.62, seg = 28) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(1, 1, depth);
  return g;
}

/**
 * Personnage semi-réaliste : proportions humaines (environ sept têtes et demie), tête sculptée,
 * yeux avec iris et paupières, épaules tombantes, bras et jambes articulés (coude, genou), mains.
 * @param {object} look couleurs et accessoires :
 *   coat, legs, skin, hair, hat ('cap' | 'scarf' | 'sowester' | null), hatColor, long (manteau long),
 *   beard (couleur), glasses, female, aged, hairStyle ('short' | 'bald' | 'long')
 */
export function createCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tout sauf les jambes (respire, se penche)
  root.add(body);
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };

  const female = look.female ?? look.hat === 'scarf';
  const skinHex = look.skin ?? SKIN;
  const coat = mat(look.coat, { side: THREE.DoubleSide });
  const coatDark = mat(new THREE.Color(look.coat).multiplyScalar(0.6));
  const legsMat = mat(look.legs ?? '#26292b');
  const skin = mat(skinHex);
  const hair = mat(look.hair ?? '#3e2114');
  const dark = mat('#17191a');

  // Jambes (pivot à la hanche) : cuisse, genou, mollet, chaussure
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.095, 0.93, 0);
    add(hip, new THREE.CapsuleGeometry(0.075, 0.3, 6, 14), legsMat, 0, -0.2, 0);
    add(hip, new THREE.CapsuleGeometry(0.058, 0.32, 6, 14), legsMat, 0, -0.62, -0.005);
    // chaussure : empeigne arrondie, semelle
    add(hip, new THREE.SphereGeometry(0.062, 16, 12).scale(1, 0.8, 1.9), dark, 0, -0.865, 0.045);
    add(hip, new THREE.BoxGeometry(0.115, 0.022, 0.25), mat('#0d0e0f'), 0, -0.915, 0.04);
    root.add(hip);
    legs.push(hip);
  }

  // Bassin (les jambes ne pendent pas dans le vide)
  add(root, new THREE.SphereGeometry(1, 18, 12).scale(0.15, 0.11, 0.082), legsMat, 0, 0.92, 0);
  // Buste : épaules, poitrine, taille, hanches ; puis le pan du manteau
  const sh = female ? 0.185 : 0.215, waist = female ? 0.135 : 0.16, hipR = female ? 0.175 : 0.165;
  const hem = look.long ? 0.5 : 0.84;
  add(body, shell([[0.001, 1.5], [0.07, 1.495], [sh * 0.82, 1.46], [sh, 1.4], [sh * 0.93, 1.25], [waist, 1.08], [hipR, 0.94], [look.long ? hipR + 0.05 : hipR + 0.01, hem + 0.06], [look.long ? hipR + 0.07 : hipR + 0.012, hem]]), coat);
  // col, revers, boutons, ceinture
  add(body, new THREE.TorusGeometry(0.068, 0.022, 10, 24).rotateX(Math.PI / 2).scale(1, 1, 0.9), coat, 0, 1.49, 0);
  add(body, new THREE.CylinderGeometry(0.004, 0.004, 0.52, 6), coatDark, 0, 1.2, sh * 0.6 + 0.004); // boutonnage
  for (let i = 0; i < 4; i++) add(body, new THREE.SphereGeometry(0.011, 8, 6), dark, 0.018, 1.38 - i * 0.12, sh * 0.6 - i * 0.004 + (i > 1 ? -0.012 : 0));
  if (!look.long) add(body, new THREE.TorusGeometry(waist + 0.012, 0.012, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.64), dark, 0, 1.06, 0);

  // Bras (pivot à l'épaule) : bras, coude légèrement fléchi, avant-bras, main
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (sh - 0.03), 1.405, 0);
    add(shoulder, new THREE.SphereGeometry(0.052, 14, 10).scale(1.1, 0.9, 1), coat, side * 0.008, 0, 0);
    add(shoulder, new THREE.CapsuleGeometry(0.046, 0.2, 6, 12), coat, side * 0.012, -0.15, 0);
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.012, -0.29, 0);
    elbow.rotation.x = -0.22;
    shoulder.add(elbow);
    add(elbow, new THREE.CapsuleGeometry(0.04, 0.2, 6, 12), coat, 0, -0.13, 0);
    // main : paume, doigts joints, pouce
    add(elbow, new THREE.SphereGeometry(0.032, 12, 10).scale(0.62, 1.1, 1), skin, 0, -0.29, 0);
    add(elbow, new THREE.CapsuleGeometry(0.021, 0.045, 4, 8).scale(0.6, 1, 1.25), skin, 0, -0.345, 0.004);
    add(elbow, new THREE.CapsuleGeometry(0.009, 0.03, 4, 6), skin, -side * 0.006, -0.3, 0.034).rotation.x = 0.5;
    shoulder.rotation.z = side * 0.07;
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Cou et tête
  add(body, new THREE.CylinderGeometry(0.045, 0.055, 0.1, 14), skin, 0, 1.53, -0.005);
  const head = new THREE.Group();
  head.position.y = 1.67;
  head.scale.setScalar(1.08); // tête un rien plus grande que nature : les visages se lisent de loin
  body.add(head);
  const skinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  add(head, headGeometry({ skin: skinHex, female, aged: look.aged ?? !!look.glasses, stubble: look.beard ? null : female ? null : '#5a4a44' }), skinMat);
  // Yeux : globe, iris, paupière supérieure ; sourcils
  for (const side of [-1, 1]) {
    const ex = side * 0.031, ey = 0.0165, ez = 0.0905;
    add(head, new THREE.SphereGeometry(0.0112, 18, 14), mat('#e6e4dc'), ex, ey, ez);
    add(head, new THREE.SphereGeometry(0.0066, 14, 10), mat(look.eyes ?? '#4a3a2a'), ex, ey - 0.0006, ez + 0.0056);
    add(head, new THREE.SphereGeometry(0.0034, 10, 8), mat('#0a0a0a'), ex, ey - 0.0006, ez + 0.0092);
    // paupière supérieure : elle couvre le haut de l'œil (regard posé, pas écarquillé)
    add(head, new THREE.SphereGeometry(0.0124, 18, 8, 0, TAU, 0, Math.PI * 0.36), skin, ex, ey + 0.0004, ez - 0.0004).rotation.x = -0.5;
    // sourcil : fin, légèrement arqué, plaqué sur l'arcade
    const b = add(head, new THREE.TorusGeometry(0.03, 0.0036, 6, 14, 0.95).rotateZ(Math.PI / 2 - 0.475).scale(1, 0.45, 0.8), hair, ex + side * 0.001, ey + 0.0045, 0.1065);
    b.rotation.y = side * 0.3;
    // oreille
    add(head, new THREE.SphereGeometry(0.021, 14, 12).scale(0.35, 1, 0.7), skin, side * 0.092, -0.008, -0.006).rotation.y = side * 0.35;
  }
  // Cheveux
  const style = look.hairStyle ?? (look.hat === 'scarf' ? 'long' : look.glasses ? 'bald' : 'short');
  if (look.hat !== 'scarf') add(head, hairGeometry(style, female), hair);
  if (look.beard) add(head, beardGeometry(), mat(look.beard));
  if (look.glasses) {
    const wire = mat('#2a2622');
    for (const side of [-1, 1]) {
      add(head, new THREE.TorusGeometry(0.02, 0.0025, 6, 22), wire, side * 0.031, 0, 0.1);
      add(head, new THREE.CylinderGeometry(0.002, 0.002, 0.1, 5).rotateX(Math.PI / 2), wire, side * 0.052, 0.002, 0.052).rotation.y = side * 0.32;
    }
    add(head, new THREE.CylinderGeometry(0.002, 0.002, 0.022, 5).rotateZ(Math.PI / 2), wire, 0, 0.004, 0.102);
  }

  // Couvre-chef
  if (look.hat === 'cap') {
    const c = mat(look.hatColor ?? '#2a5056');
    add(head, new THREE.SphereGeometry(0.112, 26, 12, 0, TAU, 0, Math.PI * 0.44).scale(0.92, 0.82, 1.02), c, 0, 0.045, -0.006);
    add(head, new THREE.CylinderGeometry(0.103, 0.105, 0.03, 26).scale(0.92, 1, 1.02), c, 0, 0.058, -0.006);
    add(head, new THREE.SphereGeometry(0.075, 18, 6, 0, TAU, 0, Math.PI / 2).scale(1.1, 0.14, 1.05), dark, 0, 0.05, 0.092); // visière
  } else if (look.hat === 'sowester') {
    // Suroît : calotte ronde, bord qui descend loin sur la nuque
    add(head, new THREE.SphereGeometry(0.118, 26, 14, 0, TAU, 0, Math.PI / 2).scale(0.94, 0.95, 1.02), coat, 0, 0.04, -0.006);
    const brim = [[0.108, 0.012], [0.145, 0.0], [0.172, -0.022], [0.168, -0.028], [0.108, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
    const b = add(head, new THREE.LatheGeometry(brim, 30), coat, 0, 0.05, -0.03);
    b.scale.z = 1.3;
    b.rotation.x = -0.14;
  } else if (look.hat === 'scarf') {
    // Fichu noué sous le menton : il encadre le visage
    const c = new THREE.MeshLambertMaterial({ color: look.hatColor ?? '#3e2114', side: THREE.DoubleSide });
    add(head, hairGeometry('long', female, 0.1), c);
    add(head, new THREE.SphereGeometry(0.02, 10, 8), c, 0, -0.118, 0.07);
    add(head, new THREE.ConeGeometry(0.018, 0.07, 8), c, 0.016, -0.16, 0.07).rotation.z = 0.35;
    add(head, new THREE.ConeGeometry(0.016, 0.06, 8), c, -0.014, -0.155, 0.07).rotation.z = -0.4;
    // une mèche qui dépasse sur le front
    add(head, new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI * 0.4).scale(1.3, 0.5, 0.6), hair, 0, 0.062, 0.062);
  }

  root.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });

  let walkPhase = 0;
  return {
    object: root,
    head,
    body,
    arms,
    /**
     * @param {number} dt
     * @param {number} speed vitesse de marche (m/s)
     * @param {number} time
     */
    animate(dt, speed, time) {
      const moving = speed > 0.2;
      walkPhase += dt * (moving ? 2.2 + speed * 1.3 : 0);
      const swing = moving ? Math.sin(walkPhase) * Math.min(0.7, speed * 0.18) : 0;
      legs[0].rotation.x += (swing - legs[0].rotation.x) * 0.3;
      legs[1].rotation.x += (-swing - legs[1].rotation.x) * 0.3;
      arms[0].rotation.x += (-swing * 0.8 - arms[0].rotation.x) * 0.3;
      arms[1].rotation.x += (swing * 0.8 - arms[1].rotation.x) * 0.3;
      // Petit rebond de marche et respiration au repos
      body.position.y = moving ? Math.abs(Math.sin(walkPhase)) * 0.05 : Math.sin(time * 1.6) * 0.012;
    },
    /** Pas : true une fois par pas (pour le son) */
    stepped() {
      const s = Math.floor(walkPhase / Math.PI);
      if (s !== this._lastStep) {
        this._lastStep = s;
        return true;
      }
      return false;
    },
  };
}

/** Apparence des personnages */
export const LOOKS = {
  player: { coat: '#cdb57c', legs: '#2a2c2e', hat: 'sowester', hair: '#3e2114' }, // ciré jaune
  doctor: { coat: '#a8bdb2', legs: '#26292b', long: true, hair: '#9a9c98', glasses: true, aged: true, hairStyle: 'bald' },
  mechanic: { coat: '#2a5056', legs: '#2a5056', hat: 'cap', hatColor: '#3e2114', beard: '#8f918c', hair: '#8f918c', aged: true },
  merchant: { coat: '#63321b', legs: '#26292b', long: true, hat: 'scarf', hatColor: '#26292b', hair: '#6a6660', female: true, aged: true },
};
