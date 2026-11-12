import { applySet, markSeen, resolveText, NPCS } from '../story/dialogue.js';

/**
 * Boîte de dialogue : nom du personnage, texte qui s'affiche lettre par lettre,
 * choix de réponses (clic, chiffres ou flèches + Entrée).
 * Avancer : E, Espace, Entrée ou clic. Un appui pendant l'écriture affiche tout le texte.
 */
const CHAR_DELAY = 26; // ms par lettre
const ADVANCE_KEYS = new Set(['KeyE', 'Space', 'Enter', 'NumpadEnter']);

export class DialogueBox {
  constructor(sound) {
    this.sound = sound;
    this.root = document.getElementById('dialogue');
    this.nameEl = this.root.querySelector('.dlg-name');
    this.textEl = this.root.querySelector('.dlg-text');
    this.choicesEl = this.root.querySelector('.dlg-choices');
    this.nextEl = this.root.querySelector('.dlg-next');
    this.isOpen = false;
    this.onKey = null; // gestionnaire courant (écriture, attente, choix)
    this.onClick = null;

    window.addEventListener('keydown', (e) => {
      // Ignore la touche qui a ouvert le dialogue (même événement clavier)
      if (!this.isOpen || e.repeat || e.timeStamp <= this.openedAt) return;
      if (ADVANCE_KEYS.has(e.code) || e.code.startsWith('Digit') || e.code.startsWith('Arrow')) e.preventDefault();
      this.onKey?.(e.code);
    });
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!this.isOpen) return;
      const choice = e.target.closest('.dlg-choice');
      this.onClick?.(choice ? Number(choice.dataset.index) : -1);
    });
  }

  /**
   * Joue une conversation.
   * @returns {Promise<string|null>} action demandée (openShop, openUpgrades…) ou null
   */
  async play(npcId, conv) {
    const name = NPCS[npcId]?.name ?? '';
    this.open(name);
    let nodeId = conv.start;
    let action = null;
    while (nodeId) {
      const node = conv.nodes[nodeId];
      if (!node) break;
      applySet(node.set);
      if (node.action) action = node.action;
      await this.type(resolveText(node.text));
      if (node.choices?.length) {
        const choice = await this.choose(node.choices);
        applySet(choice.set);
        if (choice.action) action = choice.action;
        nodeId = choice.end ? null : choice.next;
      } else {
        await this.waitAdvance();
        nodeId = node.end ? null : node.next;
      }
    }
    markSeen(conv);
    this.close();
    return action;
  }

  /** Une simple ligne de narration (sans personnage) */
  async narrate(text) {
    this.open('');
    await this.type(text);
    await this.waitAdvance();
    this.close();
  }

  open(name) {
    this.isOpen = true;
    this.openedAt = performance.now();
    this.nameEl.textContent = name;
    this.nameEl.style.display = name ? '' : 'none';
    this.root.classList.add('open');
  }

  close() {
    this.isOpen = false;
    this.onKey = this.onClick = null;
    this.root.classList.remove('open');
  }

  /** Écrit le texte lettre par lettre ; se termine à la fin ou si le joueur appuie */
  type(text) {
    this.choicesEl.innerHTML = '';
    this.nextEl.classList.remove('visible');
    // Une réplique entre parenthèses est une didascalie (narration)
    this.textEl.classList.toggle('narration', text.startsWith('('));
    this.textEl.textContent = '';
    return new Promise((resolve) => {
      let i = 0;
      let timer = null;
      const finish = () => {
        clearInterval(timer);
        this.textEl.textContent = text;
        this.onKey = this.onClick = null;
        resolve();
      };
      timer = setInterval(() => {
        i++;
        this.textEl.textContent = text.slice(0, i);
        if (i % 3 === 0 && text[i - 1] !== ' ') this.sound.blip();
        if (i >= text.length) finish();
      }, CHAR_DELAY);
      this.onKey = (code) => ADVANCE_KEYS.has(code) && finish();
      this.onClick = () => finish();
    });
  }

  waitAdvance() {
    this.nextEl.classList.add('visible');
    return new Promise((resolve) => {
      const done = () => {
        this.onKey = this.onClick = null;
        this.nextEl.classList.remove('visible');
        resolve();
      };
      this.onKey = (code) => ADVANCE_KEYS.has(code) && done();
      this.onClick = () => done();
    });
  }

  choose(choices) {
    let selected = 0;
    const render = () => {
      this.choicesEl.innerHTML = choices
        .map((c, i) => `<div class="dlg-choice${i === selected ? ' selected' : ''}" data-index="${i}">${i + 1}. ${c.text}</div>`)
        .join('');
    };
    render();
    return new Promise((resolve) => {
      const pick = (i) => {
        if (i < 0 || i >= choices.length) return;
        this.onKey = this.onClick = null;
        this.sound.blip(1.5);
        resolve(choices[i]);
      };
      this.onKey = (code) => {
        if (code.startsWith('Digit')) pick(Number(code.slice(5)) - 1);
        else if (code === 'ArrowDown' || code === 'KeyS') { selected = (selected + 1) % choices.length; render(); }
        else if (code === 'ArrowUp' || code === 'KeyW') { selected = (selected - 1 + choices.length) % choices.length; render(); }
        else if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyE' || code === 'Space') pick(selected);
      };
      this.onClick = (i) => pick(i);
    });
  }
}
