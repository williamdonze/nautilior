/**
 * Carte 3D du monde sous-marin (outil de travail, hors du jeu) : carte.html
 * Le relief, les plafonds (voûtes, massifs), les épaves, les filets, la Chambre engloutie, la faille,
 * et des étiquettes sur tout ce qui compte (souvenirs, cloches à air, zones). On tourne autour à la souris ;
 * un double-clic pose un repère et donne ses coordonnées, pour demander une modification à un endroit précis.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { installWaterFog } from '../core/waterFog.js';
installWaterFog();
const { createDetailTexture } = await import('../world/detail.js');
const { getFloorHeight, canyonCenter } = await import('../world/seabed.js');
const { getRoof, createRoofs } = await import('../world/roof.js');
const { createLandmarks, WRECK_SPOTS, MARIE } = await import('../world/landmarks.js');
const { createFormations } = await import('../world/formations.js');
const { NetForest } = await import('../world/nets.js');
const { createSunkenRoom } = await import('../world/sunkenRoom.js');
const { AirBells } = await import('../world/airBells.js');
const { RADIATION, SUBMARINE, AIR_BELLS, ROOFS, WHALE, SEABED, stretchZ } = await import('../config/settings.js');
const fragments = (await import('../story/fragments.json')).default.fragments;
const zones = (await import('../config/zones.json')).default.zones;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);
createDetailTexture(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#061015');
scene.add(new THREE.HemisphereLight('#dfeee8', '#1a2a30', 1.7));
const sun = new THREE.DirectionalLight('#fff4dc', 2.2);
sun.position.set(-300, 500, 200);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 12000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.zoomToCursor = true;

const layers = {};
const layer = (id, label, on = true) => { const g = new THREE.Group(); g.visible = on; scene.add(g); layers[id] = { g, label }; return g; };

/* ---- Relief : une maille de 3 m, colorée par zone de profondeur, assombrie dans les pentes */
// ?pas=6 dans l'adresse : relief plus grossier (machines lentes)
const X0 = -200, X1 = 200, Z0 = SEABED.Z_END + 5, Z1 = 215, STEP = Number(new URLSearchParams(location.search).get('pas')) || 4;
const ZONE_COL = [[0, '#4f9a90'], [150, '#3f7f96'], [500, '#5a5f9a'], [1000, '#3d6a52'], [1250, '#2c4a3a']].map(([d, c]) => [d, new THREE.Color(c)]);
const colorAt = (depth, out) => { let k = 0; while (k < ZONE_COL.length - 2 && ZONE_COL[k + 1][0] < depth) k++; const a = ZONE_COL[k], b = ZONE_COL[k + 1]; return out.copy(a[1]).lerp(b[1], Math.max(0, Math.min(1, (depth - a[0]) / (b[0] - a[0])))); };
{
  const nx = Math.round((X1 - X0) / STEP), nz = Math.round((Z1 - Z0) / STEP);
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) p.setY(i, Math.min(2, getFloorHeight(p.getX(i), p.getZ(i))));
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    colorAt(-p.getY(i), c).multiplyScalar(0.45 + 0.75 * Math.pow(n.getY(i), 1.5));
    // courbes de niveau tous les 50 m
    if (Math.abs(((-p.getY(i) + 25) % 50) - 25) < 0.9) c.multiplyScalar(1.5);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.name = 'terrain';
  layer('relief', 'Relief').add(terrain);
}

/* ---- Plafonds : voûtes du Canyon et massifs percés (en ocre, pour les distinguer du sol) */
{
  const g = layer('roofs', 'Plafonds (voûtes, massifs)');
  const roofs = createRoofs();
  roofs.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: '#c79a5a', side: THREE.DoubleSide, transparent: true, opacity: 0.82 }); });
  g.add(roofs);
}

/* ---- Décor : épaves, aiguilles, arches, filets, cloches, Chambre engloutie */
{
  const g = layer('decor', 'Épaves, filets, cloches, Chambre');
  g.add(createLandmarks([], { uTime: { value: 0 } }));
  g.add(createFormations([]));
  new NetForest(g);
  createSunkenRoom(g, []);
  new AirBells(g, []);
  // la faille
  const S = RADIATION.SOURCE, fy = getFloorHeight(S.x, S.z);
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(5, 46), new THREE.MeshBasicMaterial({ color: '#7dffb0', side: THREE.DoubleSide }));
  rift.position.set(S.x, fy + 24, S.z);
  g.add(rift);
  g.traverse((o) => { if (o.isLight) o.intensity = 0; });
}

/* ---- Surface de l'eau */
{
  const w = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fd0e0', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  w.position.set(0, 0, (Z0 + Z1) / 2);
  layer('water', "Surface de l'eau", false).add(w);
}

/* ---- Repères et étiquettes */
const tags = [];
const marks = layer('marks', 'Repères');
const tagLayer = { g: { visible: true }, label: 'Étiquettes' };
layers.tags = tagLayer;
function mark(x, y, z, text, color = '#e2c98c', zone = false) {
  if (!zone) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 16, 6), new THREE.MeshBasicMaterial({ color }));
    pole.position.set(x, y + 8, z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), new THREE.MeshBasicMaterial({ color }));
    ball.position.set(x, y + 17, z);
    marks.add(pole, ball);
  }
  const el = document.createElement('div');
  el.className = `tag${zone ? ' zone' : ''}`;
  el.style.setProperty('--c', color);
  el.textContent = text;
  document.body.appendChild(el);
  tags.push({ el, p: new THREE.Vector3(x, y + (zone ? 0 : 19), z) });
}
const F = getFloorHeight;
mark(SUBMARINE.SPAWN.x, SUBMARINE.SPAWN.y, SUBMARINE.SPAWN.z, 'Départ (sous le port)', '#ffffff');
fragments.forEach((f, i) => { const x = f.inCanyon ? canyonCenter(f.z) + f.x : f.x; mark(x, F(x, f.z), f.z, `Souvenir ${i + 1} · ${f.name}`, '#bfe8d0'); });
AIR_BELLS.SPOTS.forEach(([x, z]) => mark(x, F(x, z) + 6, z, 'Cloche à air', '#f2e6b8'));
WRECK_SPOTS.forEach(([x, z]) => mark(x, F(x, z), z, 'Épave', '#c08850'));
mark(canyonCenter(MARIE.z) + MARIE.dx, F(canyonCenter(MARIE.z) + MARIE.dx, MARIE.z) + 14, MARIE.z, 'La Marie-Morgane', '#ff9a6a');
ROOFS.MASSIFS.forEach((m) => mark(m.x, F(m.x, m.z) + m.H, m.z, 'Massif percé (tunnel)', '#c79a5a'));
ROOFS.VAULTS.forEach((v, i) => { const z = (v.z0 + v.z1) / 2, x = canyonCenter(z); mark(x, F(x, z) + v.h + v.thick, z, ['Voûte : le Porche', 'Voûte : la Nef', 'Voûte'][i] ?? 'Voûte', '#c79a5a'); });
{
  const S = RADIATION.SOURCE;
  mark(S.x, F(S.x, S.z) + 46, S.z, 'La faille', '#7dffb0');
  mark(S.x - 58, F(S.x - 58, S.z + 62) + 20, S.z + 62, 'Chambre engloutie : le lit', '#cfd6d0');
  mark(S.x + 62, F(S.x + 62, S.z + 30) + 56, S.z + 30, 'La potence', '#cfd6d0');
  mark(S.x, F(S.x, S.z + 78) + 30, S.z + 78, 'La porte 112', '#cfd6d0');
  // le trajet de la baleine
  const pts = [];
  for (let z = WHALE.Z_START; z >= WHALE.Z_END; z -= 6) pts.push(new THREE.Vector3(canyonCenter(z), F(canyonCenter(z), z) + WHALE.HEIGHT, z));
  marks.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#f2d9a0' })));
  const mid = pts[Math.floor(pts.length / 2)];
  mark(mid.x, mid.y - 19, mid.z, 'Trajet de la baleine', '#f2d9a0', true);
}
// zones : un nom au bord, à la bonne profondeur
for (const zn of zones) { const z = ((zn.zMin ?? 0) + (zn.zMax ?? 0)) / 2; mark(X0 - 26, F(0, z) + 10, z, `${zn.name.toUpperCase()} · ${zn.maxDepth > 5000 ? `plus de ${zn.minDepth}` : `${zn.minDepth}–${zn.maxDepth}`} m`, '#ffffff', true); }

/* ---- Interface */
const S0 = RADIATION.SOURCE, sz = stretchZ;
const VIEWS = {
  'Tout': [[1900, 1000, -1500], [0, -560, -1500]],
  'Récif': [[330, 120, -120], [0, -60, -180]],
  'Épaves': [[360, -40, -870], [0, -300, -870]],
  'Canyon': [[380, -380, -1900], [0, -760, -1900]],
  'Marie-Morgane': [[70, -730, sz(-700) + 40], [-10, -785, sz(-700)]],
  'Abysses': [[380, -820, -2800], [0, -1130, -2800]],
  'Faille': [[90, -1070, S0.z + 110], [0, -1140, S0.z]],
  'Dessus': [[0, 2900, -1501], [0, -500, -1500]],
};

const go = ([pos, look]) => { camera.position.set(...pos); controls.target.set(...look); controls.update(); };
for (const [name, v] of Object.entries(VIEWS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => go(v); document.getElementById('views').appendChild(b); }
for (const [id, l] of Object.entries(layers)) {
  const lab = document.createElement('label'), cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = l.g.visible;
  cb.onchange = () => (l.g.visible = cb.checked);
  lab.append(cb, ` ${l.label}`);
  document.getElementById('layers').appendChild(lab);
}
go(VIEWS.Tout);

// Lecture de la position sous la souris ; double-clic : repère
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), read = document.getElementById('read'), pinsEl = document.getElementById('pins');
const terrain = scene.getObjectByName('terrain');
const pick = (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera); return ray.intersectObject(terrain)[0]?.point; };
let lastMove = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (performance.now() - lastMove < 60) return;
  lastMove = performance.now();
  const p = pick(e);
  if (!p) return;
  const r = getRoof(p.x, p.z), zn = zones.find((z) => -p.y >= z.minDepth && -p.y < z.maxDepth);
  read.innerHTML = `x <b>${Math.round(p.x)}</b> · z <b>${Math.round(p.z)}</b> · profondeur <b>${Math.round(-p.y)} m</b>${zn ? ` · ${zn.name}` : ''}${r ? ` · sous un plafond (${Math.round(r.c - p.y)} m de hauteur libre)` : ''}`;
});
let pins = 0;
renderer.domElement.addEventListener('dblclick', (e) => {
  const p = pick(e);
  if (!p) return;
  pins++;
  mark(p.x, p.y, p.z, `Repère ${pins}`, '#ff6a8a');
  if (pins === 1) pinsEl.textContent = '';
  const line = document.createElement('div');
  line.textContent = `Repère ${pins} : x ${Math.round(p.x)}, z ${Math.round(p.z)}, profondeur ${Math.round(-p.y)} m`;
  pinsEl.appendChild(line);
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const v = new THREE.Vector3();
function frame() {
  controls.update();
  renderer.render(scene, camera);
  for (const t of tags) {
    v.copy(t.p).project(camera);
    const on = tagLayer.g.visible && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    t.el.style.display = on ? '' : 'none';
    if (on) { t.el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; t.el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`; }
  }
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
void SEABED;
