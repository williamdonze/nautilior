import * as THREE from 'three';
import texts from './endings.json';
import { storyState } from './state.js';
import { gameState } from '../save/gameState.js';
import { markEnding, getEndings, hasPrechoice, restorePrechoice, clearSave } from '../save/save.js';
import { setRadiationScale } from '../world/radiation.js';
import { ITEMS } from '../loot/loot.js';
import fragmentsData from './fragments.json';

/**
 * Les deux fins, jouées comme de courtes cinématiques en jeu :
 *  - « close »  : le joueur ferme le portail et reste à jamais dans l'Envers ;
 *  - « cross »  : il traverse, l'Envers se dissout, il émerge dans le vrai Port-Kerys.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Anime une valeur de 0 à 1 sur `duration` secondes */
function tween(duration, fn) {
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
async function fadeOut(color, seconds) {
  const el = veil();
  el.style.background = color;
  el.style.transitionDuration = `${seconds}s`;
  el.classList.add('on');
  await wait(seconds * 1000);
}
async function fadeIn(seconds) {
  const el = veil();
  el.style.transitionDuration = `${seconds}s`;
  el.classList.remove('on');
  await wait(seconds * 1000);
}

export async function playEnding(game, kind) {
  const { dive, port, dialogue, sound } = game;
  const T = texts[kind];
  game.busy = true;
  game.paused = false;
  document.body.classList.add('cinema');
  dive.inventory.close();
  if (game.mode === 'dive') dive.setView('third'); // les cinématiques se voient de l'extérieur

  if (kind === 'close') {
    /* ---------- Fermer : la déchirure se referme, le vert s'éteint ---------- */
    dive.autopilot = () => dive.sub.velocity.multiplyScalar(0.95);
    sound.boom(5);
    dive.follow.shake(0.6);
    const closing = tween(6, (t) => {
      dive.portal.setOpen(1 - t);
      setRadiationScale(1 - t);
    });
    dive.creatures.calm = true;
    for (const line of T.abyss) await dialogue.narrate(line);
    await closing;
    await fadeOut('#020407', 2);

    // Retour au port : ils attendent tous les trois sur le quai
    dive.autopilot = null;
    dive.leave();
    game.setMode('port');
    port.enter('quay');
    port.gatherVillagers();
    port.holdCamera = true; // la caméra reste où le script la laisse
    port.player.place(13.6, 2.6, Math.PI * 1.08);
    port.cameraMove([10, 2.2, 9], [10.8, 2.4, 6.2], [12, 1.5, -2], [12, 1.6, -2], 6);
    await fadeIn(2);
    for (const l of T.port) {
      if (l.who === 'doctor') {
        // Plan rapproché sur le médecin pour la dernière réplique
        await port.cameraMove(port.camera.position.clone(), [11.6, 1.9, 1.0], port.lookAt.clone(), [12, 1.75, -2.2], 3);
      }
      if (l.who) await dialogue.line(l.who, l.text);
      else await dialogue.narrate(l.text);
    }
    await wait(800);
    await fadeOut('#020407', 3);
  } else {
    /* ---------- Traverser : le Nautiliar entre dans la lumière ---------- */
    const target = dive.portal.center.clone();
    sound.whoosh(5);
    dive.autopilot = (dt) => {
      const sub = dive.sub;
      const to = new THREE.Vector3().subVectors(target, sub.position);
      sub.yaw += (Math.atan2(to.x, to.z) - sub.yaw) * Math.min(1, dt * 2);
      sub.velocity.lerp(to.normalize().multiplyScalar(6), Math.min(1, dt * 2));
    };
    const narration = (async () => {
      for (const line of T.abyss) await dialogue.narrate(line);
    })();
    await wait(2500);
    await fadeOut('#e8ece2', 3);
    await narration;

    // Le village des morts se dissout
    dive.autopilot = null;
    dive.leave();
    game.setMode('port');
    port.enter('quay');
    port.gatherVillagers();
    port.holdCamera = true;
    port.player.object.visible = false;
    port.cameraMove([12, 2, 8], [12, 2.6, 5], [12, 1.5, -2], [12, 1.8, -2], 10);
    await fadeIn(2.5);
    const dissolving = tween(9, (t) => port.dissolve(t));
    for (const line of T.dissolve) await dialogue.narrate(line);
    await dissolving;
    await fadeOut('#e8ece2', 1.5);

    // Le vrai Port-Kerys
    port.dissolve(0);
    port.makeAlive();
    port.player.object.visible = true;
    port.player.place(12, 4.6, Math.PI);
    sound.crowd(26);
    port.cameraMove([12, 9, 18], [12, 3.2, 10], [12, 0, 0], [12, 1.4, 2], 9);
    await fadeIn(3);
    for (const line of T.alive) await dialogue.narrate(line);
    await wait(1000);
    await fadeOut('#e8ece2', 3);
  }

  // Fin : on la note et on affiche l'écran de fin
  storyState.ending = kind;
  markEnding(kind);
  game.persist();
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
    `${storyState.deaths} réveil${storyState.deaths > 1 ? 's' : ''} à l'hôpital`,
    `${storyState.fragments.length}/${fragmentsData.fragments.length} souvenirs`,
    `${gameState.collection.length}/${ITEMS.length} objets remontés`,
  ];
  el.innerHTML = `
    <div class="end-frame">
      <div class="end-kicker">FIN ${kind === 'close' ? '— FERMER' : '— TRAVERSER'}</div>
      <h1>${T.title}</h1>
      <p class="end-sub">${T.subtitle}</p>
      <p class="end-stats">${stats.join(' · ')}</p>
      <p class="end-found">Fins découvertes : ${endings.length}/2</p>
      <div class="end-buttons">
        ${hasPrechoice() ? '<button data-end="retry">REVENIR DEVANT LE PORTAIL</button>' : ''}
        <button data-end="new">NOUVELLE PARTIE</button>
      </div>
    </div>`;
  el.classList.add('open');
  el.onclick = (e) => {
    const b = e.target.closest('[data-end]');
    if (!b) return;
    if (b.dataset.end === 'retry' && restorePrechoice()) location.reload();
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
