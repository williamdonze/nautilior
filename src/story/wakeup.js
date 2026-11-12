import texts from './wakeup.json';
import { storyState } from './state.js';

/**
 * Séquence de réveil à l'hôpital (oxygène épuisé ou coque brisée) :
 *   1. fondu au noir pendant que le cœur ralentit ;
 *   2. une phrase sur ce qui vient d'arriver ;
 *   3. dans le noir, on remet tout en place (respawn, perte d'une partie de la soute) ;
 *   4. la voix du médecin : « Encore toi… », puis une réplique évasive ;
 *   5. ce qui a été perdu ; retour au jeu.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class WakeUp {
  /**
   * @param {object} deps sound, onRespawn() → liste des objets perdus
   */
  constructor({ sound, onRespawn }) {
    this.sound = sound;
    this.onRespawn = onRespawn;
    this.el = document.getElementById('blackout');
    this.text = document.getElementById('blackout-text');
    this.playing = false;
  }

  async say(line, style = '', duration = 2600) {
    this.text.className = style;
    this.text.textContent = line;
    void this.text.offsetWidth;
    this.text.classList.add('visible');
    await wait(duration);
    this.text.classList.remove('visible');
    await wait(900);
  }

  async play(cause) {
    if (this.playing) return;
    this.playing = true;

    // 1. Le noir monte, le cœur ralentit
    this.el.classList.add('on');
    this.sound.heartbeat(1);
    await wait(1100);
    this.sound.heartbeat(0.7);
    await wait(1400);
    this.sound.heartbeat(0.4);
    this.sound.setMasterVolume(0.15, 1.5);
    await wait(800);

    // 2. Ce qui vient d'arriver
    await this.say(pick(texts.causes[cause] ?? texts.causes.oxygen), 'dim');

    // 3. Remise en place, invisible derrière l'écran noir
    storyState.deaths++;
    const lost = this.onRespawn();
    await wait(1200);
    this.sound.setMasterVolume(1, 3);

    // 4. La voix du médecin
    await this.say(texts.doctor, 'voice', 2400);
    await this.say(`« ${pick(texts.followUps)} »`, 'voice', 3200);

    // 5. Ce qui a été perdu
    // Regroupe les doublons : « Galet de granit rose ×2 »
    const counts = new Map();
    for (const it of lost) counts.set(it.name, (counts.get(it.name) ?? 0) + 1);
    const names = [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
    const lostLine = lost.length ? texts.lost.replace('{items}', names.join(', ')) : texts.nothingLost;
    await this.say(lostLine, 'dim', 3000);

    this.el.classList.remove('on');
    await wait(1500);
    this.playing = false;
  }
}
