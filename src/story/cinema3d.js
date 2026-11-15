import * as THREE from 'three';
import { createSubmarineModel, spinPropellers } from '../submarine/subModel.js';
import { createCharacter, LOOKS } from '../port/characters.js';
import { createNoise2D } from '../world/noise.js';

/**
 * Plans de cinéma en vraie 3D, rendus par le moteur du jeu (lumières, halo, exposition) :
 *  createTunnel(level) : le Nautiliar file dans un boyau de lumière, entre des débris à contre-jour ;
 *  createHospital()    : la chambre, vue du lit — plafond, néon, perfusion, moniteur, quelqu'un qui se penche.
 * Chaque plan fournit { scene, camera, exposure, update(dt, t) } ; le jeu les affiche via game.cine.
 */
const noise = createNoise2D(808);
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ Tunnel de lumière */

export function createTunnel(level, aspect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#010604');
  scene.fog = new THREE.FogExp2('#1c5a3c', 0.006);
  const camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 900);

  // Paroi : un long boyau dont la matière coule vers nous, de plus en plus claire vers le fond
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 700, 72, 1, true).rotateX(Math.PI / 2),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTime: { value: 0 }, uGlow: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGlow; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
        void main() {
          // u : autour du boyau (raccordé), v : le long (0 = loin devant, 1 = derrière nous)
          float ang = vUv.x * 6.2831853, z = vUv.y * 70.0 + uTime;
          vec2 q = vec2(cos(ang), sin(ang)) * 2.2;
          float cloud = fbm(vec2(q.x + q.y * 0.7, z * 0.55) + fbm(vec2(q.y, z * 0.3)) * 1.5);
          float vein = pow(1.0 - abs(fbm(vec2(q.x * 2.0 - q.y, z * 1.4)) * 2.0 - 1.0), 9.0);
          float streak = pow(n(vec2(ang * 9.0, z * 0.12)), 10.0);
          float far = pow(1.0 - vUv.y, 2.5);
          vec3 col = mix(vec3(0.0, 0.035, 0.022), vec3(0.10, 0.55, 0.30), cloud * cloud);
          col += vec3(0.45, 1.0, 0.65) * vein * 0.9 + vec3(1.0) * streak * 1.6;
          col *= 0.35 + far * (5.0 + uGlow * 22.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  wall.position.z = -300;
  scene.add(wall);
  // Le bout du tunnel : une lumière blanche qui grandit
  const end = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 11, 9.5), fog: false }));
  end.position.z = -640;
  scene.add(end);

  // Lumière : presque tout vient d'en face (contre-jour), un peu de vert ambiant, un soupçon par derrière
  const key = new THREE.DirectionalLight('#d8ffe6', 5.5);
  key.position.set(0, 2, -40);
  scene.add(key, new THREE.HemisphereLight('#4fd08a', '#02140c', 0.55));
  const fill = new THREE.DirectionalLight('#9fc8ff', 0.5);
  fill.position.set(4, 6, 30);
  scene.add(fill);

  // Le Nautiliar (son vrai modèle), l'avant vers la lumière
  const model = createSubmarineModel(level);
  const sub = new THREE.Group();
  model.group.rotation.y = Math.PI;
  sub.add(model.group);
  scene.add(sub);

  // Débris à contre-jour : pierres, planches, tôles — ce que la mer gardait
  const dummy = new THREE.Object3D();
  const rockGeo = new THREE.IcosahedronGeometry(1, 2), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), d = 1 + noise(x * 1.8 + y, z * 1.8) * 0.4; rp.setXYZ(i, x * d, y * d * 0.75, z * d); }
  rockGeo.computeVertexNormals();
  const kinds = [
    { mesh: new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: '#3a3f3c' }), 110), size: [0.2, 1.6] },
    { mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.09, 0.34), new THREE.MeshLambertMaterial({ color: '#4a3a28' }), 46), size: [0.5, 1.4] },
    { mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.03, 0.9), new THREE.MeshLambertMaterial({ color: '#3f3026' }), 30), size: [0.5, 1.6] },
  ];
  const debris = [];
  for (const k of kinds) {
    k.mesh.frustumCulled = false;
    scene.add(k.mesh);
    for (let i = 0; i < k.mesh.count; i++) debris.push({ k, i, a: rnd(0, TAU), r: rnd(2.5, 13.5), z: rnd(-420, 30), s: rnd(k.size[0], k.size[1]), v: rnd(0.7, 1.3), axis: new THREE.Vector3().randomDirection(), w: rnd(0.2, 1.5), drift: rnd(-0.15, 0.15) });
  }
  // Filaments de lumière qui filent
  const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.2, 2.2), fog: false }), 420);
  streaks.frustumCulled = false;
  scene.add(streaks);
  const lines = Array.from({ length: 420 }, () => ({ a: rnd(0, TAU), r: rnd(1.5, 14.5), z: rnd(-500, 30), v: rnd(1.5, 3.2), len: rnd(3, 14) }));

  const cine = {
    scene, camera, exposure: 0.9,
    /** @param {number} t avancement 0..1 */
    update(dt, t, time) {
      const speed = 26 + t * t * 150; // ça accélère jusqu'au bout
      wall.material.uniforms.uTime.value += dt * speed * 0.1;
      wall.material.uniforms.uGlow.value = t * t;
      for (const d of debris) {
        d.z += dt * speed * d.v;
        d.a += dt * d.drift;
        if (d.z > 30) { d.z = -420 - Math.random() * 60; d.a = rnd(0, TAU); d.r = rnd(2.5, 13.5); }
        dummy.position.set(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r, d.z);
        dummy.quaternion.setFromAxisAngle(d.axis, time * d.w + d.i);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        d.k.mesh.setMatrixAt(d.i, dummy.matrix);
      }
      for (const k of kinds) k.mesh.instanceMatrix.needsUpdate = true;
      lines.forEach((l, i) => {
        l.z += dt * speed * l.v;
        if (l.z > 30) { l.z = -500; l.a = rnd(0, TAU); l.r = rnd(1.5, 14.5); }
        dummy.position.set(Math.cos(l.a) * l.r, Math.sin(l.a) * l.r, l.z);
        dummy.quaternion.identity();
        dummy.scale.set(1, 1, l.len * (1 + t * 3));
        dummy.updateMatrix();
        streaks.setMatrixAt(i, dummy.matrix);
      });
      streaks.instanceMatrix.needsUpdate = true;
      // Le sous-marin tangue, roule, puis s'éloigne vers la lumière ; la caméra le suit de moins en moins bien
      const away = Math.pow(t, 2.2) * 150;
      sub.position.set(Math.sin(time * 0.7) * 1.2, Math.sin(time * 1.1) * 0.7 - 0.5, -8 - away);
      sub.rotation.set(Math.sin(time * 1.3) * 0.05, Math.sin(time * 0.5) * 0.08, Math.sin(time * 0.9) * 0.22 + t * 0.6);
      spinPropellers(model, dt, 1.6 + t * 3, 0.6);
      camera.position.set(3.2 - t * 2.4 + Math.sin(time * 0.6) * 0.4, 2.2 - t * 1.2 + Math.cos(time * 0.8) * 0.3, 7 - away * 0.35);
      camera.lookAt(sub.position.x * 0.5, sub.position.y * 0.5, sub.position.z - 20);
      camera.rotation.z += Math.sin(time * 0.4) * 0.08 + t * t * 0.5;
      camera.fov = 62 + t * t * 34;
      camera.updateProjectionMatrix();
      // secousses, de plus en plus fortes
      camera.position.x += (Math.random() - 0.5) * 0.12 * t;
      camera.position.y += (Math.random() - 0.5) * 0.12 * t;
      cine.exposure = 0.85 + Math.pow(t, 3) * 5; // tout finit dans le blanc
    },
  };
  return cine;
}

/* ------------------------------------------------------------------ Chambre d'hôpital */

/** Forme d'un battement sur le moniteur */
const ecg = (p) => 0.12 * Math.exp(-(((p - 0.12) / 0.03) ** 2)) - 0.15 * Math.exp(-(((p - 0.28) / 0.008) ** 2)) + Math.exp(-(((p - 0.3) / 0.01) ** 2)) - 0.3 * Math.exp(-(((p - 0.32) / 0.01) ** 2)) + 0.22 * Math.exp(-(((p - 0.52) / 0.05) ** 2));

export function createHospital(aspect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9d4ce');
  scene.fog = new THREE.FogExp2('#c9d4ce', 0.012);
  // On est couché : la tête sur l'oreiller, le regard vers le plafond et le pied du lit (−Z)
  const camera = new THREE.PerspectiveCamera(82, aspect, 0.05, 60);
  const eye = new THREE.Vector3(0, 0.98, 0.1);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

  // Plafond en dalles (texture dessinée : joints, taches, bouches d'aération)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const k = cv.getContext('2d');
  k.fillStyle = '#e9ede8'; k.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { k.fillStyle = `rgba(120,130,125,${Math.random() * 0.12})`; k.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  k.strokeStyle = '#9aa39e'; k.lineWidth = 5; k.strokeRect(0, 0, 256, 256);
  const tiles = new THREE.CanvasTexture(cv);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(12, 12);
  tiles.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.PlaneGeometry(7.2, 7.2).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ map: tiles }), 0, 2.85, -1.6);
  // Murs vert d'eau, plinthe, sol
  const wallMat = lam('#b9cdc4');
  add(new THREE.PlaneGeometry(7.2, 2.9), wallMat, 0, 1.45, -5.2);
  add(new THREE.PlaneGeometry(7.2, 2.9).rotateY(Math.PI / 2), wallMat, -3.0, 1.45, -1.6);
  add(new THREE.PlaneGeometry(7.2, 2.9).rotateY(-Math.PI / 2), wallMat, 3.0, 1.45, -1.6);
  add(new THREE.PlaneGeometry(7.2, 7.2).rotateX(-Math.PI / 2), lam('#8c9a96'), 0, 0, -1.6);
  // Néons : deux tubes dans un caisson (ils brûlent l'image au réveil)
  add(new THREE.BoxGeometry(1.5, 0.06, 0.5), lam('#dfe5e1'), 0, 2.82, -1.5);
  const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 7.4, 7), fog: false });
  for (const z of [-1.4, -1.6]) add(new THREE.CylinderGeometry(0.022, 0.022, 1.36, 10).rotateZ(Math.PI / 2), tube, 0, 2.77, z);
  const neon = new THREE.PointLight('#f2fff6', 5, 12, 1.4);
  neon.position.set(0, 2.6, -1.5);
  scene.add(neon);
  // Fenêtre à gauche : le jour, derrière des stores
  add(new THREE.PlaneGeometry(1.7, 1.3).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 3.0), fog: false }), -2.98, 1.7, -1.9);
  for (let i = 0; i < 13; i++) add(new THREE.BoxGeometry(0.02, 0.045, 1.74), lam('#e4e8e2'), -2.94, 1.1 + i * 0.1, -1.9).rotation.z = 0.5;
  add(new THREE.BoxGeometry(0.06, 1.42, 1.86), lam('#c8d2cc'), -3.0, 1.7, -1.9);
  const day = new THREE.DirectionalLight('#fff1dc', 2.2);
  day.position.set(-6, 3.5, -2.2);
  scene.add(day, new THREE.HemisphereLight('#f4fff8', '#7d8b86', 1.25));
  // Rideau de séparation, à droite au fond : un drap qui ondule
  const cur = new THREE.PlaneGeometry(2.6, 2.3, 40, 1), cp = cur.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 13) * 0.07);
  cur.computeVertexNormals();
  add(cur, lam('#8fb0a8', { side: THREE.DoubleSide }), 1.9, 1.5, -3.6).rotation.y = -0.5;
  add(new THREE.CylinderGeometry(0.012, 0.012, 3, 6).rotateZ(Math.PI / 2), lam('#9aa5a2'), 1.7, 2.66, -3.5).rotation.y = -0.5;

  // Potence, poche de perfusion, tubulure qui descend vers le bras
  const steel = lam('#aab4b2');
  add(new THREE.CylinderGeometry(0.014, 0.014, 2.1, 8), steel, -0.95, 1.05, -0.5);
  add(new THREE.TorusGeometry(0.09, 0.008, 6, 16, Math.PI), steel, -0.86, 2.1, -0.5);
  add(new THREE.CapsuleGeometry(0.07, 0.17, 6, 14), new THREE.MeshLambertMaterial({ color: '#eef6f2', transparent: true, opacity: 0.72 }), -0.77, 1.9, -0.5).scale.z = 0.45;
  add(new THREE.CapsuleGeometry(0.05, 0.08, 6, 12), new THREE.MeshLambertMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.8 }), -0.77, 1.85, -0.5).scale.z = 0.4;
  const drip = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.77, 1.76, -0.5), new THREE.Vector3(-0.78, 1.45, -0.5), new THREE.Vector3(-0.66, 1.05, -0.56), new THREE.Vector3(-0.44, 0.86, -0.66), new THREE.Vector3(-0.3, 0.8, -0.74)]);
  add(new THREE.TubeGeometry(drip, 30, 0.005, 6), new THREE.MeshLambertMaterial({ color: '#e8f2ee', transparent: true, opacity: 0.85 }));

  // Moniteur cardiaque sur son bras articulé : le tracé défile vraiment
  const mc = document.createElement('canvas');
  mc.width = 384; mc.height = 256;
  const mk = mc.getContext('2d');
  const screenTex = new THREE.CanvasTexture(mc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const mon = new THREE.Group();
  mon.position.set(0.62, 1.72, -1.5);
  mon.rotation.set(0.3, -0.3, 0);
  scene.add(mon);
  add(new THREE.BoxGeometry(0.46, 0.34, 0.09), lam('#d9dedb'), 0, 0, 0, mon);
  add(new THREE.PlaneGeometry(0.4, 0.27), new THREE.MeshBasicMaterial({ map: screenTex, fog: false }), 0, 0.005, 0.047, mon);
  add(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 8), steel, 0.62, 2.32, -1.56);
  for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.008, 6, 6), new THREE.MeshBasicMaterial({ color: i ? '#3a4a44' : '#7fff9a' }), -0.17 + i * 0.03, -0.15, 0.047, mon);
  const drawMonitor = (time) => {
    mk.fillStyle = '#050f0b'; mk.fillRect(0, 0, 384, 256);
    mk.strokeStyle = 'rgba(60,120,90,0.25)'; mk.lineWidth = 1;
    for (let i = 1; i < 8; i++) { mk.beginPath(); mk.moveTo(i * 48, 0); mk.lineTo(i * 48, 256); mk.moveTo(0, i * 32); mk.lineTo(384, i * 32); mk.stroke(); }
    mk.strokeStyle = '#5dff8a'; mk.lineWidth = 4; mk.shadowColor = '#5dff8a'; mk.shadowBlur = 12;
    mk.beginPath();
    for (let i = 0; i <= 140; i++) { const u = i / 140, ph = (((time * 0.93 - (1 - u) * 2.4) % 1) + 1) % 1, y = 118 - ecg(ph) * 80; if (i) mk.lineTo(12 + u * 260, y); else mk.moveTo(12 + u * 260, y); }
    mk.stroke();
    mk.strokeStyle = '#6fc8ff'; mk.shadowColor = '#6fc8ff'; mk.lineWidth = 3;
    mk.beginPath();
    for (let i = 0; i <= 140; i++) { const u = i / 140, y = 200 - Math.sin((u * 3 - time * 0.3) * TAU) * 16 - Math.sin((u * 6 - time * 0.6) * TAU) * 5; if (i) mk.lineTo(12 + u * 260, y); else mk.moveTo(12 + u * 260, y); }
    mk.stroke();
    mk.shadowBlur = 0;
    mk.fillStyle = '#5dff8a'; mk.font = '600 62px sans-serif'; mk.fillText('56', 290, 120);
    mk.fillStyle = '#6fc8ff'; mk.font = '600 40px sans-serif'; mk.fillText('97', 296, 210);
    screenTex.needsUpdate = true;
  };

  // Le lit : drap aux plis doux, barrière, et notre bras posé dessus
  const sheet = new THREE.PlaneGeometry(1.1, 2.3, 30, 50).rotateX(-Math.PI / 2), sp = sheet.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i);
    // le corps sous le drap : un renflement le long du lit, les pieds au bout
    sp.setY(i, Math.exp(-((x / 0.3) ** 2)) * (0.13 + 0.06 * Math.exp(-(((z + 0.95) / 0.16) ** 2))) + noise(x * 5, z * 4) * 0.018 + Math.sin(z * 9 + x * 4) * 0.008);
  }
  sheet.computeVertexNormals();
  add(sheet, lam('#edf1ee'), 0, 0.74, -1.25);
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(0.016, 0.016, 1.5, 8).rotateX(Math.PI / 2), steel, s * 0.6, 0.98, -1.1); for (const z of [-0.4, -1.8]) add(new THREE.CylinderGeometry(0.014, 0.014, 0.28, 8), steel, s * 0.6, 0.85, z); }
  const skin = lam('#d6b09a');
  const arm = add(new THREE.CapsuleGeometry(0.038, 0.34, 6, 14), skin, 0.33, 0.83, -0.62);
  arm.rotation.set(Math.PI / 2 - 0.05, 0, -0.18);
  add(new THREE.SphereGeometry(0.045, 14, 10).scale(1, 0.5, 1.35), skin, 0.37, 0.835, -0.86);
  add(new THREE.BoxGeometry(0.05, 0.004, 0.035), lam('#f4f6f2'), 0.33, 0.866, -0.68); // sparadrap du cathéter

  // Quelqu'un est assis au bord du lit. Elle se penche quand on ouvre les yeux, sa main sur la nôtre.
  const anna = createCharacter({ coat: '#6f8a99', legs: '#3a3f46', skin: '#e2c0aa', hair: '#4a2e22', long: true, female: true, hairStyle: 'long', eyes: '#5a4632' });
  // (au bord du champ, à contre-jour du néon : une présence plus qu'un portrait)
  anna.object.position.set(1.32, -0.28, -1.2);
  anna.object.rotation.y = Math.atan2(eye.x - 1.32, eye.z + 1.2); // tournée vers notre visage
  scene.add(anna.object);
  // son bras se tend vers notre main
  for (const a of anna.arms) { a.rotation.x = -1.0; a.rotation.z *= -2.5; }

  // Les trois autres : les mêmes visages que dans le village (c'est là qu'on comprend qui ils étaient)
  const stand = (look, x, z, lean = 0.06) => {
    const c = createCharacter(look);
    c.object.position.set(x, 0, z);
    c.object.rotation.y = Math.atan2(eye.x - x, eye.z - z);
    c.body.rotation.x = lean;
    c.head.rotation.x = 0.22; // ils nous regardent, de haut
    scene.add(c.object);
    return c;
  };
  const mother = stand(LOOKS.merchant, 1.55, -2.0, 0.1);
  const father = stand({ ...LOOKS.mechanic, hat: null }, 0.15, -2.75);
  const doctor = stand(LOOKS.doctor, -0.95, -1.75);
  // Marcel tient sa casquette dans ses mains
  for (const a of father.arms) { a.rotation.x = -0.75; a.rotation.z *= -3; }
  add(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1, 0.7, 1.05), lam(LOOKS.mechanic.hatColor), 0.15, 1.02, -2.52);
  // La chaise vide près de la fenêtre, et la photo posée dessus : deux garçons sur une barque
  const wood = lam('#6a4e36');
  add(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood, -2.2, 0.46, -2.3);
  add(new THREE.BoxGeometry(0.42, 0.5, 0.04), wood, -2.2, 0.72, -2.5);
  for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), wood, -2.2 + dx, 0.23, -2.3 + dz);
  const pc = document.createElement('canvas');
  pc.width = 128; pc.height = 96;
  const pk = pc.getContext('2d');
  pk.fillStyle = '#efe6c8'; pk.fillRect(0, 0, 128, 96);
  pk.fillStyle = '#7fb0d0'; pk.fillRect(6, 40, 116, 50);
  pk.fillStyle = '#e8dcae'; pk.fillRect(6, 6, 116, 34);
  pk.fillStyle = '#5a3a22'; pk.fillRect(34, 62, 62, 10);
  pk.fillStyle = '#b9917a'; pk.fillRect(48, 40, 9, 22); pk.fillRect(74, 47, 7, 15);
  pk.beginPath(); pk.arc(52, 36, 6, 0, TAU); pk.arc(77, 44, 5, 0, TAU); pk.fill();
  const photo = new THREE.CanvasTexture(pc);
  photo.colorSpace = THREE.SRGBColorSpace;
  const frame = add(new THREE.BoxGeometry(0.2, 0.16, 0.012), lam('#2a2622'), -2.2, 0.58, -2.34);
  frame.rotation.x = -0.35;
  add(new THREE.PlaneGeometry(0.17, 0.13), new THREE.MeshLambertMaterial({ map: photo }), 0, 0, 0.007, frame);
  // Table de chevet : la maquette du Nautiliar, les lettres d'Anna, la montre arrêtée
  add(new THREE.BoxGeometry(0.45, 0.72, 0.4), lam('#d8ddd8'), -0.85, 0.36, -0.1);
  const toy = createSubmarineModel(0).group;
  toy.scale.setScalar(0.035);
  toy.position.set(-0.86, 0.79, -0.18);
  toy.rotation.y = 0.9;
  scene.add(toy);
  for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.16, 0.004, 0.11), lam(i % 2 ? '#f2efe4' : '#e6e0cc'), -0.74, 0.722 + i * 0.004, 0.02).rotation.y = 0.2 + i * 0.13;
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 18), lam('#c8ccc8'), -0.96, 0.725, 0.03);

  const look = new THREE.Vector3();
  const cine = {
    scene, camera, exposure: 1,
    /** @param {number} t avancement du réveil 0..1 */
    update(dt, t, time) {
      drawMonitor(time);
      // elle se redresse, se penche vers nous
      const lean = Math.max(0, Math.min(1, (t - 0.55) / 0.35)), e = lean * lean * (3 - 2 * lean);
      anna.body.rotation.x = 0.06 + e * 0.2;
      anna.head.rotation.x = -0.12 + e * 0.1 + Math.sin(time * 0.8) * 0.02;
      anna.head.rotation.z = Math.sin(time * 0.5) * 0.04;
      anna.body.position.y = Math.sin(time * 1.4) * 0.006;
      // les autres se penchent à leur tour ; chacun respire
      [mother, father, doctor].forEach((c, i) => { c.body.rotation.x = 0.06 + e * (i === 0 ? 0.16 : 0.07); c.body.position.y = Math.sin(time * 1.3 + i * 2) * 0.005; c.head.rotation.y = Math.sin(time * 0.4 + i) * 0.05; });
      // le regard : d'abord perdu au plafond, il dérive, puis trouve son visage
      const drift = 1 - e;
      look.set(Math.sin(time * 0.31) * 0.5 * drift + 0.3 * e, 2.6 - e * 0.95 + Math.sin(time * 0.23) * 0.25 * drift, -1.5 - e * 0.3);
      camera.position.copy(eye).add({ x: Math.sin(time * 0.9) * 0.004, y: Math.sin(time * 1.4) * 0.003, z: 0 }); // on respire
      camera.lookAt(look);
      camera.rotation.z += Math.sin(time * 0.27) * 0.03 * drift;
      // l'œil s'habitue à la lumière
      cine.exposure = 2.6 - Math.min(1, t * 1.25) * 1.65;
    },
  };
  return cine;
}
