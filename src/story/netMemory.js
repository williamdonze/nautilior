import * as THREE from 'three';
import { PaleDiver } from '../world/paleDiver.js';
import { netMaterial } from '../world/nets.js';
import { wait, tween, fadeOut, fadeIn } from './endings.js';
import fragmentsData from './fragments.json';

/**
 * Le souvenir jouable : en remontant le couteau, Loïc se retrouve une demi-minute dans le Nautiliar
 * d'alors, pris dans les filets. Dehors, une lampe. Une main coupe, maille après maille.
 * Rien n'est dit : on voit seulement celui qui coupe rester en bas quand le sous-marin se libère.
 */
export async function playNetMemory(game) {
  const dive = game.dive, sub = dive.sub, nets = dive.nets, sound = game.sound, scene = dive.scene;
  const line = fragmentsData.fragments.find((f) => f.id === 'couteau')?.lines[1] ?? '';
  game.busy = true;
  await fadeOut('#000', 0.9);

  // On prend la place du petit sous-marin pris dans les mailles
  const saved = { pos: sub.position.clone(), yaw: sub.yaw, view: dive.view, level: sub.model.level, calm: dive.creatures.calm };
  const L = nets.lostPose;
  nets.lost.visible = false;
  nets.lostCollider.r = 0; // on est à sa place : sa collision ne doit pas nous repousser
  dive.creatures.calm = true;
  dive.setHullLevel(0);
  sub.teleport(L.x, L.y + 0.6, L.z, L.yaw);
  dive.setView('first');
  let rise = 0, t0 = 0;
  dive.autopilot = (dt) => {
    t0 += dt;
    // la coque tire sur les mailles, sans avancer ; puis, d'un coup, elle remonte
    sub.velocity.set(Math.sin(t0 * 1.7) * 0.05, rise + Math.sin(t0 * 2.3) * 0.04, 0);
    sub.yawVelocity = Math.sin(t0 * 0.9) * 0.02;
  };

  // Des pans de filet plaqués sur la verrière : ils tiennent au sous-marin (repère de la coque, avant = +Z)
  const mat = netMaterial('#3c483f');
  const panes = [[-1.5, 0.5, 0.5], [1.4, 0.2, -0.45], [0, 1.1, 0]].map(([sx, sy, ry], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 7, 8, 8), mat.clone());
    const p = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
    for (let k = 0; k < p.count; k++) { p.setZ(k, Math.sin(p.getX(k) * 1.3 + i) * 0.25 + Math.cos(p.getY(k) * 1.1) * 0.2); uv.setXY(k, uv.getX(k) * 7.5, uv.getY(k) * 7); }
    m.material.userData.netScale = 2.4; // mailles serrées, vues de tout près
    m.position.set(sx * 1.3, 0.9 + sy, 5.6 + i * 0.3);
    m.rotation.y = ry;
    m.raycast = () => {};
    m.frustumCulled = false;
    sub.object.add(m);
    return m;
  });

  // Celui qui coupe : il nage devant la verrière, d'un pan à l'autre
  const yann = new PaleDiver(scene), yo = yann.object, c = yann.character;
  yo.visible = true;
  yo.userData.fade = 0;
  dive.memoryActor = yo; // (repère pour les tests)
  let alive = true, time = 0, last = performance.now(), cutting = 0, free = false;
  const local = new THREE.Vector3(-8, -0.7, 7.2), goal = new THREE.Vector3(-1.6, -0.5, 7.2), world = new THREE.Vector3();
  const loop = (now) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    yo.userData.fade = Math.min(1, yo.userData.fade + dt / 2.5);
    // tant que le Nautiliar est pris, il reste contre la coque ; ensuite, il reste où il est
    if (!free) {
      local.lerp(goal, Math.min(1, dt * 0.9));
      sub.object.updateMatrixWorld();
      yo.position.copy(sub.object.localToWorld(world.copy(local)));
    }
    yo.position.y += Math.sin(time * 1.1) * 0.003;
    yo.rotation.y = Math.atan2(sub.position.x - yo.position.x, sub.position.z - yo.position.z);
    c.object.rotation.x = 0.25;
    // le bras qui scie, à petits coups serrés
    if (!free) {
      c.arms[1].rotation.set(-1.5 + Math.sin(time * 11) * 0.3 * cutting, 0, -0.2);
      c.arms[0].rotation.set(-1.1, 0, 0.25);
    }
    yann.halo.material.opacity = 0.6 * yo.userData.fade * (0.85 + 0.15 * Math.sin(time * 5.8));
    yann.light.intensity = 9 * yo.userData.fade;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  sound.creak(0.8);
  await fadeIn(1.8);
  await wait(2200);
  sound.creak(1);
  dive.shake(0.2);
  await wait(1800);
  game.hud.voice(line);
  await wait(2600);
  // Trois pans, l'un après l'autre
  const where = [[-1.5, 0.3], [1.4, 0], [0, 0.9]];
  for (let i = 0; i < 3; i++) {
    goal.set(where[i][0] * 1.1, where[i][1] * 0.6 - 0.7, 7.2);
    await wait(2200);
    cutting = 1;
    for (let k = 0; k < 4; k++) { sound.clank?.(0.25); await wait(480); }
    cutting = 0;
    sound.release?.();
    dive.shake(0.15);
    const m = panes[i], y0 = m.position.y;
    tween(2.4, (t) => { m.position.y = y0 - t * 7; m.rotation.x = t * 0.9; m.userData.fade = 1 - t; });
    await wait(700);
  }
  // Libre. Le Nautiliar remonte d'un coup ; la lampe reste en bas.
  await wait(600);
  sound.creak(1.2);
  sound.impact?.(0.8);
  dive.shake(0.9);
  rise = 2.6;
  free = true;
  // il lève un bras, puis le filet qui retombe le recouvre
  const wave = tween(5, (t) => { c.arms[0].rotation.set(-2.6 + Math.sin(t * 14) * 0.25, 0, 0.3); });
  await wait(4200);
  await fadeOut('#000', 1.6);
  await wave;

  // Retour au présent
  alive = false;
  for (const m of panes) { sub.object.remove(m); m.geometry.dispose(); m.material.dispose(); }
  scene.remove(yo);
  dive.autopilot = null;
  nets.lost.visible = true;
  nets.lostCollider.r = 3.4;
  dive.creatures.calm = saved.calm;
  dive.setHullLevel(saved.level);
  sub.teleport(saved.pos.x, saved.pos.y, saved.pos.z, saved.yaw);
  dive.setView(saved.view);
  await wait(500);
  await fadeIn(1.2);
  game.busy = false;
}
