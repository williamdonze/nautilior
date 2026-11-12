import { drawMemory } from './memoryArt.js';

/**
 * Écran de souvenir : image pixel, titre, puis le souvenir ligne par ligne.
 * E, Espace, Entrée ou clic pour continuer.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class MemoryView {
  constructor(sound) {
    this.sound = sound;
    this.root = document.getElementById('memory');
    this.canvas = this.root.querySelector('canvas');
    this.title = this.root.querySelector('.mem-title');
    this.lines = this.root.querySelector('.mem-lines');
    this.next = this.root.querySelector('.mem-next');
    this.isOpen = false;
  }

  /** @param {object} fragment entrée de fragments.json ; @param {number} index numéro du souvenir */
  async show(fragment, index) {
    this.isOpen = true;
    drawMemory(fragment.art, this.canvas);
    this.title.textContent = `Souvenir ${index} — ${fragment.title}`;
    this.lines.innerHTML = '';
    this.next.classList.remove('visible');
    this.root.classList.add('open');
    this.sound.memory();
    await wait(1600);
    for (const line of fragment.lines) {
      const p = document.createElement('p');
      p.textContent = line;
      this.lines.appendChild(p);
      void p.offsetWidth;
      p.classList.add('visible');
      await wait(1700);
    }
    this.next.classList.add('visible');
    await this.waitAdvance();
    this.root.classList.remove('open');
    await wait(600);
    this.isOpen = false;
  }

  waitAdvance() {
    return new Promise((resolve) => {
      const done = (e) => {
        if (e.type === 'keydown' && !['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code)) return;
        e.preventDefault?.();
        window.removeEventListener('keydown', done, true);
        this.root.removeEventListener('pointerdown', done);
        resolve();
      };
      window.addEventListener('keydown', done, true);
      this.root.addEventListener('pointerdown', done);
    });
  }
}
