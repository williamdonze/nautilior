import { Dive } from '../world/dive.js';
import { Port } from '../port/port.js';
import { Hold } from '../loot/hold.js';
import { ITEMS } from '../loot/loot.js';
import { renderThumbnails } from '../ui/thumbnails.js';
import { DialogueBox } from '../ui/dialogueBox.js';
import { Panels } from '../ui/panels.js';
import { WakeUp } from '../story/wakeup.js';
import { pickConversation } from '../story/dialogue.js';
import { storyState } from '../story/state.js';
import { gameState } from '../save/gameState.js';
import { save, load, clearSave, savePrechoice } from '../save/save.js';
import { playEnding, showEndScreen } from '../story/endings.js';
import { applyUpgrades, stats } from '../submarine/stats.js';
import { SURVIVAL } from '../config/settings.js';
import { MemoryView } from '../ui/memoryView.js';
import fragmentsData from '../story/fragments.json';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Le jeu : enchaîne le port et la plongée, gère les dialogues, les panneaux,
 * le réveil à l'hôpital et la sauvegarde automatique.
 */
export class Game {
  constructor({ pixel, input, pointer, sound, hud }) {
    Object.assign(this, { pixel, input, pointer, sound, hud });
    this.mode = 'port';
    this.busy = false; // transition ou séquence en cours : commandes bloquées

    this.loaded = load();
    applyUpgrades(gameState.upgrades);

    this.hold = new Hold();
    this.hold.fromIds(gameState.hold);
    this.hold.onChange(() => hud.updateCargo(this.hold));
    // Vignettes générées une fois, avant la première frame (pendant le fondu au noir)
    this.thumbnails = renderThumbnails(pixel.renderer, ITEMS);

    this.dive = new Dive({
      pixel, input, pointer, sound, hud,
      hold: this.hold,
      thumbnails: this.thumbnails,
      onCapture: (pickup) => (pickup.item.fragment ? this.foundFragment(pickup.item.fragmentId) : this.addToCollection(pickup.item)),
      onDeath: (cause) => this.death(cause),
      onReturn: () => this.goPort('quay', true),
      onPortal: () => this.facePortal(),
      canFacePortal: () => storyState.abyssalHull,
    });
    this.port = new Port({ sound });

    this.dialogue = new DialogueBox(sound);
    this.memoryView = new MemoryView(sound);
    this.paused = false; // plongée figée (souvenir affiché)
    this.panels = new Panels({
      gameState,
      hold: this.hold,
      thumbnails: this.thumbnails,
      sound,
      onChange: () => {
        this.persist();
        hud.setMoney(gameState.money);
      },
      onMemory: (id) => this.showMemory(id),
      onUpgrade: (catId, level) => {
        applyUpgrades(gameState.upgrades);
        if (level.abyssal) {
          storyState.abyssalHull = true;
          this.pendingAbyssalTalk = true; // le mécano parlera en fermant l'atelier
        }
      },
      onClose: () => {
        if (this.pendingAbyssalTalk) {
          this.pendingAbyssalTalk = false;
          this.talk('mechanic');
        }
      },
    });
    this.wakeUp = new WakeUp({
      sound,
      onRespawn: () => {
        // Dans le noir : la soute s'allège, on se réveille à l'hôpital
        const lost = this.hold.loseFraction(SURVIVAL.LOSS_FRACTION);
        this.dive.leave();
        this.enterPort('hospital', true);
        return lost;
      },
    });

    this.transitionEl = document.getElementById('transition');
    pixel.onResize = (aspect) => {
      this.dive.setAspect(aspect);
      this.port.setAspect(aspect);
    };
    this.port.setAspect(pixel.aspect);

    // Commandes
    input.onPress((code) => this.key(code));
    pointer.onClick(() => {
      if (this.mode === 'dive' && !this.busy) this.dive.click();
    });

    // Accès console : nautiliar.game.newGame() pour repartir de zéro
    this.newGame = () => {
      clearSave();
      location.reload();
    };
  }

  /* ------------------------------------------------------------ Démarrage */

  start() {
    this.hud.setMoney(gameState.money);
    this.hud.updateCargo(this.hold);
    if (storyState.ending) {
      // Partie terminée : écran de fin
      this.enterPort('quay', false);
      this.busy = true;
      this.hud.intro('');
      showEndScreen(storyState.ending);
      return;
    }
    if (gameState.resumeAt === 'portal') {
      // « Revenir devant le portail » : on reprend juste avant le choix
      delete gameState.resumeAt;
      this.setMode('dive');
      this.dive.enter(gameState.day, storyState.fragments);
      const c = this.dive.portal.center;
      this.dive.sub.teleport(c.x, c.y - 4, c.z + 26, Math.PI);
      this.dive.follow.snap(this.dive.sub);
      this.hud.intro('Devant le portail.');
      this.persist();
      return;
    }
    if (this.loaded && storyState.flags.introDone) {
      this.enterPort('quay', false);
      this.hud.intro('Port-Kerys, 1984.');
    } else {
      // Nouvelle partie : réveil à l'hôpital, le médecin parle le premier
      this.enterPort('hospital', false);
      this.busy = true;
      this.hud.intro('Port-Kerys, 1984.');
      wait(4200).then(async () => {
        this.busy = false;
        if (this.mode === 'port') await this.talk('doctor');
      });
    }
  }

  /* ------------------------------------------------------------ Modes */

  setMode(mode) {
    this.mode = mode;
    document.body.classList.toggle('mode-port', mode === 'port');
    document.body.classList.toggle('mode-dive', mode === 'dive');
  }

  /** Passe au port immédiatement (sans fondu) */
  enterPort(spot, newDay) {
    if (newDay) gameState.day++;
    this.setMode('port');
    this.port.enter(spot);
    this.pixel.setDistortion(0, 0);
    this.persist();
  }

  /** Fondu au noir, action, puis retour de l'image */
  async transition(action, caption = '') {
    this.busy = true;
    this.transitionEl.querySelector('p').textContent = caption;
    this.transitionEl.classList.add('on');
    await wait(700);
    action();
    await wait(caption ? 1400 : 300);
    this.transitionEl.classList.remove('on');
    await wait(500);
    this.busy = false;
  }

  goDive() {
    this.transition(() => {
      this.setMode('dive');
      this.dive.enter(gameState.day, storyState.fragments);
      this.persist();
    }, 'Le Nautiliar s\'enfonce sous la surface.');
  }

  goPort(spot, newDay) {
    this.transition(() => {
      this.dive.leave();
      this.enterPort(spot, newDay);
    }, 'Retour à quai. Le mécano répare la coque.');
  }

  /** Mort (oxygène ou coque) : séquence de réveil, puis le médecin */
  async death(cause) {
    this.busy = true;
    await this.wakeUp.play(cause);
    this.busy = false;
    await this.talk('doctor');
  }

  /* ------------------------------------------------------------ Port : interactions */

  get portControls() {
    return !this.busy && !this.dialogue.isOpen && !this.panels.isOpen;
  }

  key(code) {
    if (this.mode === 'dive') {
      if (!this.busy) this.dive.key(code);
      return;
    }
    if (code === 'Escape') this.panels.close();
    if (code === 'KeyE' && this.portControls && this.port.focus) this.interact(this.port.focus);
  }

  async interact(it) {
    if (it.kind === 'npc') return this.talk(it.npcId);
    if (it.kind === 'house') return this.talk('house');
    if (it.action === 'openCollection') return this.panels.open('collection');
    if (it.action === 'dive') {
      if (!storyState.flags.subGiven) return this.talk('sub');
      this.goDive();
    }
  }

  /** Lance la conversation adaptée avec un personnage, puis l'action éventuelle */
  async talk(npcId) {
    const conv = pickConversation(npcId);
    if (!conv) return;
    const action = await this.dialogue.play(npcId, conv);
    this.persist();
    if (action === 'openShop') this.panels.open('shop');
    else if (action === 'openUpgrades') this.panels.open('upgrades');
    else if (action === 'openCollection') this.panels.open('collection');
  }

  /* ------------------------------------------------------------ Données */

  /** Devant le portail : sauvegarde « avant le choix », puis le choix final */
  async facePortal() {
    if (this.busy) return;
    this.busy = true;
    this.paused = true;
    savePrechoice();
    const action = await this.dialogue.play('portal', pickConversation('portal'));
    this.paused = false;
    if (action === 'ending_close') return playEnding(this, 'close');
    if (action === 'ending_cross') return playEnding(this, 'cross');
    this.busy = false;
  }

  /** Un fragment de mémoire est remonté : on le note, puis le souvenir s'affiche */
  foundFragment(id) {
    if (!storyState.fragments.includes(id)) storyState.fragments.push(id);
    this.persist();
    // Petit délai : on voit d'abord l'objet rentrer dans le sous-marin
    setTimeout(() => this.showMemory(id, true), 900);
    return true;
  }

  /** Affiche un souvenir ; en plongée, le temps s'arrête pendant ce temps */
  async showMemory(id, pause = false) {
    const index = fragmentsData.fragments.findIndex((f) => f.id === id);
    if (index < 0 || this.memoryView.isOpen) return;
    this.busy = true;
    if (pause) this.paused = true;
    await this.memoryView.show(fragmentsData.fragments[index], index + 1);
    this.paused = false;
    this.busy = false;
  }

  /** Ajoute un objet à la collection ; renvoie true s'il est nouveau */
  addToCollection(item) {
    if (gameState.collection.includes(item.id)) return false;
    gameState.collection.push(item.id);
    return true;
  }

  persist() {
    gameState.hold = this.hold.toIds();
    save();
  }

  /* ------------------------------------------------------------ Boucle */

  update(dt, time) {
    if (this.mode === 'dive') {
      if (!this.paused) this.dive.update(dt, time);
    } else {
      this.port.update(dt, time, this.input, this.portControls);
      const f = this.port.focus;
      this.hud.setPrompt(f && this.portControls ? f.label : '');
    }
  }

  render() {
    if (this.mode === 'dive') this.pixel.render(this.dive.scene, this.dive.camera);
    else this.pixel.render(this.port.scene, this.port.camera);
  }
}

export { stats };
