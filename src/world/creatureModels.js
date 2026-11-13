import * as THREE from 'three';
import { createHalo } from '../loot/glow.js';

/**
 * Modèles des créatures, face vers +Z.
 * Corps tournés (Lathe) pour des silhouettes plus organiques, peau ombrée
 * (dos sombre, ventre clair), mâchoires animables, yeux et organes lumineux.
 * Pas de lumières dynamiques : les parties lumineuses sont non éclairées, avec un halo.
 */
const vmat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

/**
 * Corps de révolution le long de Z à partir d'un profil [rayon, z].
 * @param {number} squash aplatissement latéral (poissons comprimés)
 */
function lathe(profile, segments = 8, squash = 1) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.001), z));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateX(Math.PI / 2); // l'axe du tour (Y) devient Z
  geo.scale(squash, 1, 1);
  return geo.toNonIndexed();
}

/** Peau ombrée : couleur du dos en haut, du ventre en bas, motifs optionnels */
function shade(geo, back, belly, pattern = null) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cb = new THREE.Color(back), cv = new THREE.Color(belly), c = new THREE.Color();
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = THREE.MathUtils.smoothstep((y - min.y) / (max.y - min.y || 1), 0.3, 0.7);
    c.copy(cv).lerp(cb, t);
    if (pattern) pattern(c, x, y, z, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Œil : globe pâle + pupille lumineuse (+ halo optionnel) */
function eye(parent, x, y, z, r, color = '#e0b050', halo = true) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), lambert('#1a1f1c')));
  const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.62, 1), glow(color));
  pupil.position.set(Math.sign(x) * r * 0.35, 0, r * 0.45);
  g.add(pupil);
  if (halo) {
    const h = createHalo(color, r * 10);
    h.material.opacity = 0.55;
    h.position.copy(pupil.position);
    g.add(h);
  }
  parent.add(g);
  return g;
}

/** Rangée de dents sur un arc */
function teeth(parent, count, rx, ry, y, z, size = 0.25, color = '#ccd8cc') {
  const mat = lambert(color);
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (0.1 + (i / (count - 1)) * 0.8);
    const t = new THREE.Mesh(new THREE.ConeGeometry(size * 0.25, size * (0.7 + Math.random() * 0.6), 4), mat);
    t.position.set(Math.cos(a) * rx, y, z + Math.sin(a) * ry);
    t.rotation.x = y > 0 ? Math.PI : 0;
    parent.add(t);
  }
}

/** Nageoire triangulaire fine (deux faces) */
function fin(points, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
}

/* ================================================================== Anguille mutée */

export function createEel() {
  const root = new THREE.Group();
  const head = new THREE.Group();
  root.add(head);
  const skinBack = '#22282a', skinBelly = '#6b6e5c';

  // Crâne allongé et bosselé
  const skull = shade(lathe([[0.05, -0.9], [0.42, -0.6], [0.5, -0.1], [0.42, 0.4], [0.25, 0.85], [0.08, 1.05]], 8, 0.85), skinBack, skinBelly);
  head.add(new THREE.Mesh(skull, vmat()));
  // Mâchoire inférieure (s'ouvre à la charge)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.22, 0.1);
  head.add(jaw);
  const jawGeo = shade(lathe([[0.05, -0.4], [0.32, -0.1], [0.3, 0.4], [0.12, 0.85]], 6, 0.9), '#3e2f24', '#8a7a5c');
  jawGeo.scale(1, 0.45, 1);
  jaw.add(new THREE.Mesh(jawGeo, vmat()));
  teeth(head, 9, 0.3, 0.75, -0.18, 0.15, 0.24);
  teeth(jaw, 8, 0.26, 0.65, 0.08, 0.15, 0.2);
  // Yeux mal placés, un en trop
  eye(head, 0.33, 0.2, 0.45, 0.09);
  eye(head, -0.31, 0.24, 0.38, 0.08);
  eye(head, 0.14, 0.38, 0.05, 0.055, '#7fbf7a');
  // Fentes branchiales
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.04), lambert('#120c08'));
      slit.position.set(s * 0.4, 0, -0.25 - i * 0.12);
      head.add(slit);
    }
  }

  // Corps : segments qui se chevauchent, crête dorsale continue, taches lumineuses
  const segments = [];
  const N = 18;
  for (let i = 0; i < N; i++) {
    const r = 0.46 * (1 - (i / N) * 0.85);
    const seg = new THREE.Group();
    const bodyGeo = shade(lathe([[r * 0.6, -0.55], [r, -0.2], [r, 0.2], [r * 0.6, 0.55]], 7, 0.85), skinBack, skinBelly);
    seg.add(new THREE.Mesh(bodyGeo, vmat()));
    const crest = fin([[0, r * 0.8, -0.5], [0, r * 0.8, 0.5], [0, r * 1.9, 0.1]], '#3e2114');
    seg.add(crest);
    if (i % 3 === 1) {
      for (const s of [-1, 1]) {
        const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), glow('#7fbf7a'));
        spot.position.set(s * r * 0.82, -r * 0.2, 0);
        seg.add(spot);
      }
    }
    root.add(seg);
    segments.push(seg);
  }
  // Queue en lame
  const tailFin = fin([[0, 0.5, -0.4], [0, -0.5, -0.4], [0, 0, 0.5]], '#3e2114');
  segments[N - 1].add(tailFin);

  // Mutation : une deuxième tête atrophiée sort du flanc, gueule ouverte
  const twin = new THREE.Group();
  const twinSkull = shade(lathe([[0.04, -0.4], [0.26, -0.15], [0.24, 0.25], [0.06, 0.55]], 7, 0.85), skinBack, '#8a7a5c');
  twin.add(new THREE.Mesh(twinSkull, vmat()));
  teeth(twin, 6, 0.18, 0.4, -0.08, 0.1, 0.16);
  eye(twin, 0.16, 0.12, 0.25, 0.06, '#7fbf7a');
  twin.position.set(0.45, 0.2, 0);
  twin.rotation.y = 1.0;
  twin.rotation.z = -0.4;
  segments[4].add(twin);
  // Vertèbres qui percent la peau sur l'arrière du corps
  const boneMat = lambert('#d8d4c0');
  for (let i = 9; i < N; i += 2) {
    const r = 0.46 * (1 - (i / N) * 0.85);
    const bone = new THREE.Mesh(new THREE.ConeGeometry(0.06, r * 1.4, 4), boneMat);
    bone.position.y = r * 1.2;
    bone.rotation.x = -0.4;
    segments[i].add(bone);
  }
  // Grappe d'yeux sur le crâne
  for (let i = 0; i < 4; i++) eye(head, -0.12 + i * 0.09, 0.42, 0.15 - i * 0.12, 0.035, '#e0b050', false);

  const SCALE = 1.8;
  head.scale.setScalar(SCALE);
  for (const s of segments) s.scale.multiplyScalar(SCALE);
  return { root, head, jaw, segments, spacing: 0.62 * SCALE };
}

/* ================================================================== Poisson-lanterne */

export function createLantern() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // Corps bouffi, asymétrique, peau verruqueuse
  const bulkGeo = shade(
    lathe([[0.1, -1.6], [0.8, -1.2], [1.3, -0.4], [1.4, 0.3], [1.15, 0.9], [0.5, 1.3], [0.1, 1.4]], 10, 0.9),
    '#1c1612',
    '#4a3a2c',
    (c, x, y, z) => {
      if (Math.sin(x * 9) * Math.sin(z * 7 + y * 5) > 0.75) c.multiplyScalar(1.6); // verrues
    }
  );
  const pos = bulkGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + Math.sin(pos.getZ(i) * 2 + pos.getX(i)) * 0.08);
  bulkGeo.computeVertexNormals();
  body.add(new THREE.Mesh(bulkGeo, vmat()));

  // Gueule : mâchoire inférieure énorme qui s'ouvre
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.35, 0.6);
  body.add(jaw);
  const jawGeo = shade(lathe([[0.1, -0.5], [1.0, -0.2], [1.05, 0.5], [0.7, 0.95]], 9, 1), '#22140d', '#5a4a3a');
  jawGeo.scale(1, 0.5, 1);
  jaw.add(new THREE.Mesh(jawGeo, vmat()));
  const gullet = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), new THREE.MeshBasicMaterial({ color: '#05090d' }));
  gullet.position.set(0, -0.1, 1.05);
  body.add(gullet);
  teeth(body, 13, 0.95, 1.0, -0.15, 0.4, 0.45, '#b9cbc2');
  teeth(jaw, 12, 0.9, 0.9, 0.18, 0.15, 0.4, '#b9cbc2');

  // Yeux : un énorme œil laiteux, un petit qui brille
  eye(body, 0.82, 0.55, 0.85, 0.22, '#b9cbc2', false);
  eye(body, -0.62, 0.72, 0.72, 0.1);
  eye(body, 0.25, 0.98, 0.55, 0.06, '#7fbf7a');
  // Épines dorsales
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 + (i % 2) * 0.3, 4), lambert('#3e2114'));
    sp.position.set(Math.sin(i) * 0.1, 1.3 - i * 0.06, 0.6 - i * 0.35);
    sp.rotation.x = -0.5;
    body.add(sp);
  }
  // Nageoires translucides
  const pect = [];
  for (const s of [-1, 1]) {
    const f = fin([[0, 0, -0.4], [0, 0, 0.4], [s * 1.1, -0.5, -0.2]], '#5a3a2a');
    f.position.set(s * 1.1, -0.3, -0.1);
    body.add(f);
    pect.push(f);
  }
  const tail = new THREE.Group();
  tail.position.z = -1.6;
  body.add(tail);
  tail.add(fin([[0, 0, 0], [0, 0.9, -1.1], [0, -0.9, -1.1]], '#3e2114'));

  // Leurre : tige articulée et bulbe lumineux
  const stalk = new THREE.Group();
  stalk.position.set(0, 1.3, 0.7);
  body.add(stalk);
  let prev = stalk;
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Group();
    s.position.y = i === 0 ? 0 : 0.42;
    s.rotation.x = 0.35;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.45, 4).translate(0, 0.22, 0), lambert('#26292b'));
    s.add(seg);
    prev.add(s);
    prev = s;
  }
  const lure = new THREE.Group();
  lure.position.y = 0.48;
  prev.add(lure);
  lure.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), glow('#ccd8cc')));
  const lureHalo = createHalo('#7fbf7a', 4);
  lure.add(lureHalo);

  // Mutation : une seconde bouche s'ouvre sur le flanc
  const side = new THREE.Group();
  side.position.set(-1.25, -0.1, -0.2);
  side.rotation.y = -Math.PI / 2;
  body.add(side);
  side.add(new THREE.Mesh(new THREE.CircleGeometry(0.32, 9), new THREE.MeshBasicMaterial({ color: '#05090d' })));
  teeth(side, 9, 0.3, 0.3, 0.05, -0.05, 0.22, '#b9cbc2');
  // Ventre translucide : on devine les organes qui luisent
  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 9, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    new THREE.MeshLambertMaterial({ color: '#5a6a5a', transparent: true, opacity: 0.45, flatShading: true, depthWrite: false })
  );
  belly.position.set(0, -0.55, -0.1);
  body.add(belly);
  for (let i = 0; i < 4; i++) {
    const organ = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + (i % 2) * 0.08, 0), glow(i % 2 ? '#7fbf7a' : '#a8955f'));
    organ.position.set(Math.sin(i * 2.3) * 0.35, -0.75 + (i % 2) * 0.1, Math.cos(i * 1.7) * 0.35 - 0.1);
    body.add(organ);
  }
  // Deux leurres supplémentaires, plus courts
  const lures = [lureHalo];
  for (const sgn of [-1, 1]) {
    const stalk2 = new THREE.Group();
    stalk2.position.set(sgn * 0.45, 1.15, 0.4);
    stalk2.rotation.set(0.6, 0, sgn * 0.5);
    stalk2.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 4).translate(0, 0.45, 0), lambert('#26292b')));
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), glow('#a8bdb2'));
    bulb.position.y = 0.95;
    stalk2.add(bulb);
    const h = createHalo('#7fbf7a', 2.4);
    h.position.y = 0.95;
    stalk2.add(h);
    lures.push(h);
    body.add(stalk2);
  }
  // Rangée de petits yeux sur le flanc droit
  for (let i = 0; i < 5; i++) eye(body, 1.18 - i * 0.04, 0.2 - i * 0.05, 0.4 - i * 0.3, 0.05, '#e0b050', false);

  body.scale.setScalar(1.6);
  return { root, body, tail, jaw, pect, stalk, lureHalo, lures };
}

/* ================================================================== Méduse irradiée */

export function createJelly() {
  const root = new THREE.Group();
  const bellMat = new THREE.MeshBasicMaterial({
    color: '#7fbf7a', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // Cloche à collerette festonnée
  const profile = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 0.5;
    profile.push([Math.sin(a) * 1.4, -Math.cos(a) * 1.1 + 1.1]);
  }
  profile.push([1.55, -0.15], [1.45, -0.3]);
  const bellGeo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const bp = bellGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    if (bp.getY(i) < 0) {
      const a = Math.atan2(bp.getZ(i), bp.getX(i));
      bp.setY(i, bp.getY(i) - Math.abs(Math.sin(a * 8)) * 0.18); // festons
    }
  }
  bellGeo.computeVertexNormals();
  const bell = new THREE.Mesh(bellGeo, bellMat);
  bell.rotation.x = Math.PI; // dôme vers le haut
  bell.position.y = 1.1;
  root.add(bell);
  // Organes lumineux en croix
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 4, 8), glow('#ccd8cc'));
    g.position.set(Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45);
    g.rotation.x = Math.PI / 2;
    root.add(g);
  }
  const halo = createHalo('#7fbf7a', 7);
  halo.material.opacity = 0.5;
  halo.position.y = 0.4;
  root.add(halo);
  // Mutation : des yeux flottent à l'intérieur de la cloche et regardent dehors
  const innerEyes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const e = eye(root, Math.cos(a) * 0.75, 0.55 + (i % 2) * 0.25, Math.sin(a) * 0.75, 0.11, i % 3 ? '#e8ece2' : '#e0b050', false);
    e.lookAt(Math.cos(a) * 3, 0.5, Math.sin(a) * 3);
    innerEyes.push(e);
  }
  // Bras buccaux (rubans ondulants) et longs filaments
  const tendrils = [];
  const armMat = new THREE.MeshBasicMaterial({ color: '#a8bdb2', transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const a = (i / 4) * Math.PI * 2 + 0.4;
    pivot.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
    const geo = new THREE.PlaneGeometry(0.35, 3.2, 1, 8);
    geo.translate(0, -1.6, 0);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + Math.sin(p.getY(k) * 3) * 0.15);
    pivot.add(new THREE.Mesh(geo, armMat));
    pivot.rotation.y = a;
    root.add(pivot);
    tendrils.push(pivot);
  }
  const tMat = new THREE.MeshBasicMaterial({ color: '#83a39a', transparent: true, opacity: 0.5 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    // Filament en trois tronçons articulés
    let parent = new THREE.Group();
    parent.position.set(Math.cos(a) * 1.4, -0.2, Math.sin(a) * 1.4);
    root.add(parent);
    tendrils.push(parent);
    for (let k = 0; k < 3; k++) {
      const len = 1.4 + (i % 3) * 0.3;
      const seg = new THREE.Group();
      seg.position.y = k === 0 ? 0 : -len;
      seg.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, len, 0.03).translate(0, -len / 2, 0), tMat));
      parent.add(seg);
      if (k > 0) tendrils.push(seg);
      parent = seg;
    }
  }
  root.scale.setScalar(1.5);
  return { root, bell, tendrils, halo, innerEyes };
}

/* ================================================================== Poissons irradiés */

/**
 * Espèces des bancs. Même près de la surface, les poissons ont été touchés :
 * yeux en trop, bosses, double queue, côtes à nu, pustules lumineuses.
 * mutations : liste de difformités appliquées à la géométrie.
 */
export const FISH_SPECIES = {
  sardine: { length: 0.75, back: '#3f5f6e', belly: '#ccd8cc', fins: '#83a39a', scale: 0.8, mutations: ['extraEyes', 'tumors'] },
  maquereau: { length: 0.95, back: '#2f5a4a', belly: '#d8e0d8', fins: '#4a6a5a', stripes: true, scale: 1, mutations: ['hump', 'glowStripes', 'spines'] },
  bar: { length: 1.1, back: '#5a6464', belly: '#d0d4cc', fins: '#6b6e6c', scale: 1.5, mutations: ['doubleTail', 'ribs', 'fangs'] },
  vieille: { length: 1, back: '#8a4f28', belly: '#c08850', fins: '#a8955f', spots: true, scale: 1.3, mutations: ['bigHead', 'pustules', 'raggedFins'] },
  squelette: { length: 1, back: '#b9cbc2', belly: '#e8ece2', fins: '#83a39a', scale: 1.4, mutations: ['skeleton', 'extraEyes'] },
};

/**
 * Géométrie d'un poisson (une seule géométrie pour tout le banc instancié).
 * Attributs ajoutés pour le shader :
 *  - aU    : 0 à la tête, 1 au bout de la queue (l'onde de nage part de la tête)
 *  - aGlow : 0..1, parties qui luisent dans le noir (yeux, pustules, rayures irradiées)
 */
export function createFishGeometry(speciesId = 'sardine') {
  const sp = FISH_SPECIES[speciesId];
  const L = sp.length;
  const mut = new Set(sp.mutations ?? []);
  const parts = []; // { geo, color, glow }

  // --- Corps (ou squelette)
  if (mut.has('skeleton')) {
    // Colonne et côtes : on voit à travers
    const spine = new THREE.CylinderGeometry(0.025, 0.02, L * 0.9, 4);
    spine.rotateX(Math.PI / 2);
    parts.push({ geo: spine, color: sp.back });
    for (let i = 0; i < 7; i++) {
      const z = L * 0.3 - i * L * 0.09;
      const r = 0.15 * Math.sin(((i + 1) / 8) * Math.PI);
      const rib = new THREE.TorusGeometry(r, 0.012, 3, 8, Math.PI * 1.4);
      rib.rotateY(Math.PI / 2);
      rib.rotateX(-Math.PI * 0.2);
      rib.translate(0, 0, z);
      parts.push({ geo: rib, color: sp.belly });
    }
    const skull = lathe([[0.01, L * 0.3], [0.12, L * 0.36], [0.1, L * 0.46], [0.01, L * 0.52]], 6, 0.7);
    parts.push({ geo: skull, color: sp.belly });
  } else {
    const profile = [[0.01, -L * 0.5], [0.09, -L * 0.36], [0.16, -L * 0.1], [0.17, L * 0.12], [0.12, L * 0.34], [0.01, L * 0.5]];
    if (mut.has('bigHead')) {
      profile[4] = [0.2, L * 0.3];
      profile[3] = [0.2, L * 0.12];
    }
    const body = shade(lathe(profile, 7, 0.55), sp.back, sp.belly, (c, x, y, z, t) => {
      if (sp.stripes && t > 0.5 && Math.sin(z * 26 + Math.sin(x * 40) * 2) > 0.3) c.multiplyScalar(0.45);
      if (sp.spots && Math.sin(z * 30) * Math.sin(y * 40) > 0.6) c.offsetHSL(0, 0, 0.12);
      if (mut.has('ribs') && Math.sin(z * 34) > 0.55 && Math.abs(x) > 0.05) c.multiplyScalar(0.35);
    });
    if (mut.has('hump')) {
      // Bosse difforme sur le dos
      const p = body.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), z = p.getZ(i);
        if (y > 0.05) p.setY(i, y + Math.max(0, 0.16 - Math.abs(z + 0.05)) * 1.6);
      }
      body.computeVertexNormals();
    }
    parts.push({ geo: body, color: null, glowFn: mut.has('glowStripes') ? (x, y, z) => (y > 0.04 && Math.sin(z * 26) > 0.6 ? 0.7 : 0) : null });
  }

  // --- Yeux (un de plus pour les mutants), pupilles lumineuses
  const eyes = [[0.07, 0.04, L * 0.32], [-0.07, 0.04, L * 0.32]];
  if (mut.has('extraEyes')) eyes.push([0.05, 0.1, L * 0.22], [-0.02, 0.12, L * 0.28]);
  for (const [x, y, z] of eyes) {
    const e = new THREE.IcosahedronGeometry(0.035, 0);
    e.translate(x, y, z);
    parts.push({ geo: e, color: '#e8ece2', glow: speciesId === 'squelette' ? 1 : 0.6 });
  }
  // --- Tumeurs et pustules
  if (mut.has('tumors') || mut.has('pustules')) {
    const n = mut.has('pustules') ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(0.03 + (i % 3) * 0.015, 0);
      const a = i * 2.4;
      g.translate(Math.cos(a) * 0.09, Math.sin(a) * 0.1, L * (0.25 - i * 0.07));
      parts.push({ geo: g, color: mut.has('pustules') ? '#c8e8a0' : '#9a9282', glow: mut.has('pustules') ? 0.9 : 0 });
    }
  }
  // --- Crocs
  if (mut.has('fangs')) {
    for (const s of [-1, 1]) {
      const f = new THREE.ConeGeometry(0.015, 0.08, 3);
      f.rotateX(Math.PI);
      f.translate(s * 0.03, -0.04, L * 0.47);
      parts.push({ geo: f, color: '#e8ece2' });
    }
  }

  // --- Nageoires
  const tri = (pts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    return g;
  };
  const ragged = mut.has('raggedFins') ? 0.6 : 1;
  const tail = (zOff, yOff) =>
    tri([[0, yOff, -L * 0.45 + zOff], [0, yOff + 0.2 * ragged, -L * 0.75 + zOff], [0, yOff + 0.02, -L * 0.6 + zOff],
      [0, yOff, -L * 0.45 + zOff], [0, yOff - 0.02, -L * 0.6 + zOff], [0, yOff - 0.2, -L * 0.75 + zOff]]);
  if (mut.has('doubleTail')) {
    parts.push({ geo: tail(0, 0.07), color: sp.fins }, { geo: tail(0, -0.07), color: sp.fins });
  } else parts.push({ geo: tail(0, 0), color: sp.fins });
  parts.push({ geo: tri([[0, 0.14, L * 0.05], [0, 0.14, -L * 0.25], [0, 0.14 + 0.16 * ragged, -L * 0.15]]), color: sp.fins });
  parts.push({ geo: tri([[0.08, -0.05, L * 0.15], [0.2, -0.12, -L * 0.02], [0.08, -0.06, 0]]), color: sp.fins });
  parts.push({ geo: tri([[-0.08, -0.05, L * 0.15], [-0.2 * ragged, -0.12, -L * 0.02], [-0.08, -0.06, 0]]), color: sp.fins });
  if (mut.has('spines')) {
    for (let i = 0; i < 4; i++) {
      const sp2 = new THREE.ConeGeometry(0.012, 0.12, 3);
      sp2.translate(0, 0.2, L * (0.1 - i * 0.08));
      parts.push({ geo: sp2, color: '#22140d' });
    }
  }

  // --- Fusion : position, couleur, aU (tête → queue), aGlow
  let count = 0;
  const prepared = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    count += g.attributes.position.count;
    return { ...p, geo: g };
  });
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const uArr = new Float32Array(count), glowArr = new Float32Array(count);
  const c = new THREE.Color();
  let o = 0;
  for (const p of prepared) {
    const g = p.geo, n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    for (let i = 0; i < n; i++) {
      const x = g.attributes.position.getX(i), y = g.attributes.position.getY(i), z = g.attributes.position.getZ(i);
      if (p.color) c.set(p.color);
      else c.setRGB(g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i));
      col.set([c.r, c.g, c.b], (o + i) * 3);
      uArr[o + i] = THREE.MathUtils.clamp((L * 0.5 - z) / (L * 1.25), 0, 1);
      glowArr[o + i] = p.glowFn ? p.glowFn(x, y, z) : p.glow ?? 0;
    }
    o += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('aU', new THREE.BufferAttribute(uArr, 1));
  merged.setAttribute('aGlow', new THREE.BufferAttribute(glowArr, 1));
  merged.computeVertexNormals();
  merged.scale(sp.scale, sp.scale, sp.scale);
  merged.userData.length = L * sp.scale;
  return merged;
}
