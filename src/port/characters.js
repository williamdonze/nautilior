import * as THREE from 'three';

/**
 * Personnages du village : semi-réalistes, tête sculptée, corps articulé.
 * Pivot au sol, face vers +Z. Les membres sont des groupes animables (marche, respiration).
 */
const SKIN = '#b9917a';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const TAU = Math.PI * 2;
const gauss = (d, s) => Math.exp(-(d * d) / (s * s));

/**
 * Tête sculptée : une sphère fine que l'on modèle point par point — crâne, mâchoire qui s'affine,
 * pommettes, arcades, orbites, nez, lèvres, menton. La couleur suit le relief (lèvres, joues,
 * ombre des orbites, barbe naissante). Regarde vers +Z, mesure ~0,24 m du menton au sommet.
 * @param {object} o skin, female (traits plus doux), aged (creusé), stubble (couleur de barbe ou null)
 */
function headGeometry(o) {
  const geo = new THREE.SphereGeometry(1, 56, 44);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const skin = new THREE.Color(o.skin), lip = skin.clone().lerp(new THREE.Color('#8a3a34'), o.female ? 0.6 : 0.4), dark = skin.clone().multiplyScalar(0.62);
  const blush = skin.clone().lerp(new THREE.Color('#c0605a'), 0.35), stub = o.stubble ? new THREE.Color(o.stubble) : null, c = new THREE.Color();
  const jaw = o.female ? 0.4 : 0.3, brow = o.female ? 0.035 : 0.06;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), front = Math.max(0, z);
    // crâne : plus haut que large, l'arrière bombé, les tempes rentrées
    let sx = 0.78, sy = 1.0, sz = 0.92;
    // la mâchoire s'affine vers le menton
    const low = Math.max(0, -y - 0.15) / 0.85;
    sx *= 1 - jaw * Math.pow(low, 1.3);
    sz *= 1 - 0.22 * Math.pow(low, 1.5) * (z < 0 ? 1.6 : 0.5);
    let r = 1;
    // relief du visage (seulement à l'avant)
    const f = Math.pow(front, 0.8);
    r += 0.075 * gauss(y - 0.02, 0.2) * gauss(ax - 0.52, 0.22) * f; // pommettes
    r += brow * gauss(y - 0.3, 0.09) * gauss(ax - 0.3, 0.3) * f; // arcades
    r -= 0.06 * gauss(y - 0.17, 0.08) * gauss(ax - 0.33, 0.13) * f; // orbites
    r += 0.24 * gauss(ax, 0.075 + 0.055 * gauss(y + 0.1, 0.07)) * gauss(y + 0.02, 0.17) * (0.4 + 0.6 * gauss(y + 0.09, 0.09)) * f; // nez : arête puis bout
    r += 0.03 * gauss(ax - 0.1, 0.05) * gauss(y + 0.12, 0.045) * f; // ailes du nez
    r += 0.055 * gauss(ax, 0.2) * gauss(y + 0.36, 0.075) * f; // lèvres
    r -= 0.028 * gauss(ax, 0.22) * gauss(y + 0.365, 0.014) * f; // fente de la bouche
    r -= 0.03 * gauss(ax, 0.3) * gauss(y + 0.5, 0.05) * f; // creux sous la lèvre
    r += 0.06 * gauss(ax, 0.2) * gauss(y + 0.66, 0.12) * f; // menton
    if (o.aged) r -= 0.03 * gauss(ax - 0.3, 0.12) * gauss(y + 0.2, 0.2) * f; // joues creusées
    r -= 0.05 * gauss(y - 0.25, 0.3) * gauss(ax - 0.75, 0.2); // tempes
    p.setXYZ(i, x * sx * r, y * sy * r - 0.03, z * sz * r);
    // couleur
    c.copy(skin);
    c.lerp(blush, 0.5 * gauss(y + 0.05, 0.16) * gauss(ax - 0.45, 0.2) * f);
    c.lerp(dark, 0.5 * gauss(y - 0.17, 0.08) * gauss(ax - 0.33, 0.14) * f + 0.25 * gauss(y + 0.5, 0.05) * gauss(ax, 0.3) * f);
    c.lerp(lip, Math.min(1, 1.6 * gauss(ax, 0.17) * gauss(y + 0.36, 0.05) * f));
    if (stub) c.lerp(stub, 0.5 * Math.min(1, Math.max(0, (-y - 0.12) * 3)) * (0.5 + 0.5 * front) * (1 - gauss(ax, 0.16) * gauss(y + 0.36, 0.06)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.scale(0.12, 0.12, 0.12);
  return geo;
}

/** Calotte de cheveux : épouse le crâne, s'arrête à la ligne du front et des tempes, mèches en relief */
function hairGeometry(style) {
  const geo = new THREE.SphereGeometry(1, 72, 54);
  const p = geo.attributes.position, keep = [];
  // garde-t-on ce point du crâne ? (devant : au-dessus du front ; derrière l'oreille : jusqu'à la nuque)
  const has = (x, y, z) => {
    const back = Math.max(0, -z), ax = Math.abs(x);
    if (style === 'bald') return z < 0.35 && y < 0.62 - 0.9 * Math.max(0, z) && y > -0.2 - 0.45 * back; // couronne : le dessus est nu
    if (style === 'long') return z > 0.25 ? y > 0.5 + 0.2 * ax || (ax > 0.74 && y > -0.9) : true; // encadre le visage, tombe aux épaules
    return z > 0.2 ? y > 0.47 + 0.12 * z + 0.1 * ax : y > -0.12 - 0.5 * back;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const strand = Math.sin(Math.atan2(x, z) * 26 + y * 9) * 0.012 + Math.sin(Math.atan2(x, z) * 9 + y * 4) * 0.02;
    const k = 1.06 + strand + (style === 'long' && y < -0.2 ? 0.05 : 0);
    // les cheveux longs tombent droit sous le crâne au lieu de suivre la sphère
    const fall = style === 'long' && y < -0.1 ? 1 + (-y - 0.1) * 0.25 : 1;
    p.setXYZ(i, x * 0.8 * k * fall, y * 1.02 * k * (style === 'long' && y < 0 ? 1.45 : 1) - 0.03, z * 0.95 * k * fall - (style === 'long' && y < 0 ? 0.03 : 0));
  }
  const idx = geo.index.array, o = new THREE.SphereGeometry(1, 72, 54).attributes.position;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (!has(o.getX(a), o.getY(a), o.getZ(a)) || !has(o.getX(b), o.getY(b), o.getZ(b)) || !has(o.getX(c), o.getY(c), o.getZ(c))) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(keep);
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
    add(head, new THREE.SphereGeometry(0.0112, 16, 12), mat('#e4e2da'), ex, ey, ez);
    add(head, new THREE.SphereGeometry(0.0068, 12, 8), mat(look.eyes ?? '#4a3a2a'), ex, ey - 0.0005, ez + 0.0072);
    add(head, new THREE.SphereGeometry(0.0032, 8, 6), mat('#0a0a0a'), ex, ey - 0.0005, ez + 0.0112);
    add(head, new THREE.SphereGeometry(0.0126, 16, 8, 0, TAU, 0, Math.PI * 0.46), skin, ex, ey + 0.0005, ez - 0.0005).rotation.x = -0.18; // paupière : regard posé, pas écarquillé
    add(head, new THREE.SphereGeometry(0.0122, 16, 6, 0, TAU, Math.PI * 0.72, Math.PI * 0.28), skin, ex, ey, ez - 0.0003).rotation.x = -0.25;
    const b = add(head, new THREE.CapsuleGeometry(0.0034, 0.024, 4, 8).rotateZ(Math.PI / 2), hair, ex, ey + 0.021, ez + 0.012);
    b.rotation.z = side * 0.07; // sourcils droits, à peine froncés
    // oreille
    add(head, new THREE.SphereGeometry(0.02, 12, 10).scale(0.4, 1, 0.7), skin, side * 0.088, -0.012, -0.004);
  }
  // Cheveux
  const style = look.hairStyle ?? (look.hat === 'scarf' ? 'long' : look.glasses ? 'bald' : 'short');
  if (look.hat !== 'scarf') add(head, hairGeometry(style), new THREE.MeshLambertMaterial({ color: look.hair ?? '#3e2114', side: THREE.DoubleSide }));
  if (look.beard) {
    // barbe : une coque sur la mâchoire, plus épaisse au menton, et la moustache
    const g = new THREE.SphereGeometry(1, 60, 44), p = g.attributes.position, keep = [], o = g.index.array;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), low = Math.max(0, -y - 0.15) / 0.85;
      const k = 1.05 + 0.1 * low + Math.sin(Math.atan2(x, z) * 30 + y * 12) * 0.012;
      p.setXYZ(i, x * 0.78 * (1 - 0.3 * Math.pow(low, 1.3)) * k, y * (1 + 0.16 * low) * k - 0.03, z * 0.92 * (1 - 0.1 * low) * k + 0.01);
    }
    const q = new THREE.SphereGeometry(1, 60, 44).attributes.position;
    // la barbe couvre la mâchoire et le menton, monte en pattes devant l'oreille, laisse la bouche libre
    const inBeard = (x, y, z) => { const ax = Math.abs(x); return z > -0.25 && y < -0.2 + 0.35 * Math.max(0, 0.55 - z) && !(ax < 0.19 && y > -0.45 && y < -0.3 && z > 0.5); };
    for (let i = 0; i < o.length; i += 3) {
      const a = o[i], b = o[i + 1], c2 = o[i + 2];
      if (!inBeard(q.getX(a), q.getY(a), q.getZ(a)) || !inBeard(q.getX(b), q.getY(b), q.getZ(b)) || !inBeard(q.getX(c2), q.getY(c2), q.getZ(c2))) continue;
      keep.push(a, b, c2);
    }
    g.setIndex(keep);
    g.computeVertexNormals();
    g.scale(0.12, 0.12, 0.12);
    const bm = new THREE.MeshLambertMaterial({ color: look.beard, side: THREE.DoubleSide });
    add(head, g, bm);
    add(head, new THREE.CapsuleGeometry(0.0065, 0.036, 4, 8).rotateZ(Math.PI / 2).scale(1, 1, 0.8), bm, 0, -0.034, 0.104);
  }
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
    const g = hairGeometry('long');
    g.scale(1.04, 0.98, 1.05);
    add(head, g, c, 0, 0.004, -0.004);
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
