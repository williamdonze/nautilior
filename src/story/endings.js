import * as THREE from 'three';
import * as cinema from './cinema.js';
import { createTunnel, createHospital } from './cinema3d.js';
import texts from './endings.json';
import { storyState } from './state.js';
import { gameState } from '../save/gameState.js';
import { markEnding, getEndings, clearSave } from '../save/save.js';
import { setRadiationScale } from '../world/radiation.js';
import { ITEMS } from '../loot/loot.js';
import fragmentsData from './fragments.json';

/**
 * Les deux fins, jouées comme de courtes cinématiques en jeu :
 *  - « close »  : le joueur ferme le portail et reste à jamais dans l'Envers ;
 *  - « cross »  : il traverse, l'Envers se dissout, il émerge dans le vrai Port-Kermor.
 */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Anime une valeur de 0 à 1 sur `duration` secondes */
export function tween(duration, fn) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / (duration * 1000));
      fn(t * t * (3 - 2 * t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Fondu plein écran vers une couleur (noir ou blanc), puis retour */
const veil = () => document.getElementById('veil');
export async function fadeOut(color, seconds) {
  const el = veil();
  el.style.background = color;
  el.style.transitionDuration = `${seconds}s`;
  el.classList.add('on');
  await wait(seconds * 1000);
}
export async function fadeIn(seconds) {
  const el = veil();
  el.style.transitionDuration = `${seconds}s`;
  el.classList.remove('on');
  await wait(seconds * 1000);
}

/** Joue une suite de lignes : { who, text } = réplique d'un personnage, sinon narration */
async function say(dialogue, lines) {
  for (const l of lines ?? []) {
    if (l.who) await dialogue.line(l.who, l.text);
    else await dialogue.narrate(l.text ?? l);
  }
}

export async function playEnding(game, kind) {
  const { dive, port, dialogue, sound } = game;
  // Traverser avec les huit souvenirs : Loïc se réveille en sachant (troisième fin)
  const complete = storyState.fragments.length >= fragmentsData.fragments.length;
  if (kind === 'cross' && complete) kind = 'depart';
  const T = texts[kind];
  // « Fermer » est définitif : la sauvegarde disparaît au moment du choix
  if (kind === 'close') clearSave();
  game.busy = true;
  game.paused = false;
  document.body.classList.add('cinema');
  dive.inventory.close();
  if (game.mode === 'dive') dive.setView('third'); // les cinématiques se voient de l'extérieur

  if (kind === 'close') {
    /* ---------- Fermer : la déchirure se referme, le vert s'éteint ---------- */
    // Le Nautiliar se place face à la plaie ; le bras télescopique sort, l'agrippe par le bas
    // et la referme en la tirant vers le haut, comme on recoud. À la fin, il casse.
    const P = dive.portal, C = P.center, sub = dive.sub, claw = dive.claw;
    const hold = new THREE.Vector3(C.x, C.y - 5, C.z + 17);
    const bottom = new THREE.Vector3(C.x, C.y - 13.5, C.z + 0.8), top = new THREE.Vector3(C.x, C.y + 14, C.z + 0.8);
    dive.creatures.calm = true;
    dive.autopilot = (dt) => {
      const to = new THREE.Vector3().subVectors(hold, sub.position);
      sub.yaw += Math.atan2(Math.sin(Math.atan2(C.x - sub.position.x, C.z - sub.position.z) - sub.yaw), Math.cos(Math.atan2(C.x - sub.position.x, C.z - sub.position.z) - sub.yaw)) * Math.min(1, dt * 2);
      sub.velocity.lerp(to.clampLength(0, 4), Math.min(1, dt * 2));
    };
    const narration = (async () => { for (const line of T.abyss) await dialogue.narrate(line); })();
    await wait(3000);
    claw.puppet(bottom, 1, 6); // le bras se déploie jusqu'au bas de la déchirure
    await wait(3600);
    claw.puppet(bottom, 0, 6); // la pince se referme sur la lumière
    sound.clank(1);
    dive.follow.shake(0.4);
    await wait(900);
    const goal = new THREE.Vector3();
    let creak = 0;
    await tween(8, (t) => {
      // il tire : la plaie se recoud derrière la pince, le vert faiblit, le bras tremble de plus en plus
      const e = t * t * (3 - 2 * t);
      P.setZip(e);
      setRadiationScale(1 - e * 0.85);
      goal.lerpVectors(bottom, top, e).add({ x: (Math.random() - 0.5) * 0.5 * t, y: (Math.random() - 0.5) * 0.3 * t, z: (Math.random() - 0.5) * 0.3 * t });
      claw.puppet(goal, 0, 14);
      dive.follow.shake(0.05 + t * 0.2);
      if (t > creak) { creak += 0.09; sound.creak(0.6 + t); sound.crackle?.(0.5 + t); }
    });
    // dernier effort : la plaie claque, le bras cède
    sound.boom(5);
    dive.follow.shake(1.2);
    P.setOpen(0);
    setRadiationScale(0);
    claw.shatter();
    game.hud.flash('#8fffb0');
    await narration;
    await wait(2200);
    dive.autopilot = null;
  } else {
    /* ---------- Traverser : le Nautiliar entre dans la lumière ---------- */
    // La plaie s'élargit, vient au-devant du Nautiliar et l'avale
    const P = dive.portal, target = P.center.clone();
    sound.whoosh(5);
    dive.sub.ghost = true; // seul ce choix permet de franchir la déchirure
    dive.creatures.calm = true;
    let pull = 5;
    dive.autopilot = (dt) => {
      const sub = dive.sub;
      const to = new THREE.Vector3().subVectors(target, sub.position);
      sub.yaw += Math.atan2(Math.sin(Math.atan2(to.x, to.z) - sub.yaw), Math.cos(Math.atan2(to.x, to.z) - sub.yaw)) * Math.min(1, dt * 2);
      pull += dt * 2.5; // elle aspire de plus en plus fort
      sub.velocity.lerp(to.normalize().multiplyScalar(pull), Math.min(1, dt * 2));
    };
    const narration = (async () => { for (const line of texts.cross.abyss) await dialogue.narrate(line); })();
    const growing = tween(5, (t) => {
      const e = t * t;
      P.group.scale.setScalar(1 + e * 3.2);
      P.setOpen(1 + e * 2.2);
      dive.follow.shake(0.05 + e * 0.5);
    });
    await wait(3800);
    await fadeOut('#e4ffec', 1.2);
    await growing;
    await narration;

    // Le tunnel de lumière, puis le noir, puis quelque chose qui se rallume
    game.paused = true;
    dive.autopilot = null;
    dive.sub.ghost = false;
    P.group.scale.setScalar(1);
    dive.leave();
    // Tunnel : une vraie scène 3D, le Nautiliar à contre-jour (voir cinema3d.js)
    const tunnel = createTunnel(gameState.upgrades.hull ?? 0, game.pixel.aspect);
    game.cine = tunnel;
    const t0 = performance.now();
    const drive = setInterval(() => {
      const el = (performance.now() - t0) / 1000;
      tunnel.update(1 / 60, Math.min(1, el / 10), el);
      if (Math.random() < 0.02 + el * 0.012) sound.crackle?.(0.3 + el * 0.06);
    }, 1000 / 60);
    await wait(200);
    await fadeIn(0.8);
    await wait(8600);
    await fadeOut('#f2fff6', 1.2); // tout se dissout dans le blanc
    clearInterval(drive);
    game.cine = { scene: new THREE.Scene(), camera: tunnel.camera, exposure: 1 };
    game.cine.scene.background = new THREE.Color('#000000');
    await cinema.blackout(0.1);
    await fadeIn(1.8);
    await wait(1200);
    // Dans le noir, les phrases du village reviennent — cette fois dans leur vrai sens
    const lightning = cinema.synapses(16, sound, true); // avec les correspondances (faille → moniteur…)
    await wait(2500);
    await say(dialogue, texts.cross.echo);
    await lightning;
    await wait(900);
    // Les paupières s'ouvrent sur la chambre (scène 3D) : le bip n'a pas cessé, mais ce n'est plus un sonar
    const room = createHospital(game.pixel.aspect);
    game.cine = room;
    const opening = cinema.eyelids(13, (t, el) => room.update(1 / 60, t, el), () => sound.sonarBeep(1.1));
    await opening;
    await wait(1200);
    // Les yeux ouverts, on est dans le vrai monde : ils parlent clairement
    await say(dialogue, T.awake);
    await wait(2000);
    await fadeOut('#020407', 3);
    cinema.close();
    game.cine = null;
  }

  /*
   * Épilogue de « Fermer » : écran noir, et le bip du sonar qui n'a jamais cessé…
   * il ralentit, puis ne retombe plus. (Pour « Traverser », le bip accompagne le réveil : voir plus haut.)
   */
  if (kind === 'close') {
  await fadeOut('#020407', 2.5);
  let alive = true, beats = 0;
  (async () => {
    while (alive) {
      sound.sonarBeep(1.2);
      beats++;
      await wait(kind === 'close' ? 1070 + beats * 160 : 1070);
    }
  })();
  for (const [i, line] of (T.pulse ?? []).entries()) {
    if (i === 2) { alive = false; sound.sonarFlat(9); }
    await say(dialogue, [line]);
  }
  alive = false;
  await wait(1500);
  }

  // Fin : on la note et on affiche l'écran de fin
  storyState.ending = kind;
  markEnding(kind);
  if (kind === 'close') clearSave(); // il n'y a plus personne à réveiller
  else game.persist();
  showEndScreen(kind);
  document.body.classList.remove('cinema');
}

/** Écran de fin : titre, bilan, et choix de revoir le moment décisif */
export function showEndScreen(kind) {
  const T = texts[kind];
  const el = document.getElementById('ending');
  const endings = getEndings();
  const stats = [
    `${gameState.day} jours`,
    `${storyState.deaths} alerte${storyState.deaths > 1 ? 's' : ''}`,
    `${storyState.fragments.length}/${fragmentsData.fragments.length} souvenirs`,
    `${gameState.collection.length}/${ITEMS.length} objets remontés`,
  ];
  el.innerHTML = `
    <div class="end-frame">
      <div class="end-kicker">FIN ${kind === 'close' ? '— FERMER' : kind === 'depart' ? '— TRAVERSER, EN SACHANT' : '— TRAVERSER'}</div>
      <h1>${T.title}</h1>
      <p class="end-sub">${T.subtitle}</p>
      <p class="end-stats">${stats.join(' · ')}</p>
      <p class="end-found">Fins découvertes : ${endings.length}/3</p>
      <div class="end-buttons">
        <button data-end="new">NOUVELLE PARTIE</button>
      </div>
    </div>`;
  el.classList.add('open');
  el.onclick = (e) => {
    const b = e.target.closest('[data-end]');
    if (!b) return;
    if (b.dataset.end === 'new') {
      clearSave();
      try {
        sessionStorage.setItem('nautiliar-autostart', '1');
      } catch {
        /* rien */
      }
      location.reload();
    }
  };
}
