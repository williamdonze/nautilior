import { getRarity } from '../loot/loot.js';

/**
 * Inventaire (touche I ou Tab) : grille des emplacements de la soute,
 * détails de l'objet sélectionné et possibilité de le larguer.
 */
export class Inventory {
  /**
   * @param {object} deps hold, thumbnails (Map id → image), onDrop(index)
   */
  constructor({ hold, thumbnails, onDrop }) {
    this.hold = hold;
    this.thumbnails = thumbnails;
    this.onDrop = onDrop;
    this.isOpen = false;
    this.selected = -1;

    this.root = document.getElementById('inventory');
    this.grid = document.getElementById('inv-grid');
    this.summary = document.getElementById('inv-summary');
    this.details = document.getElementById('inv-details');

    hold.onChange(() => this.isOpen && this.render());

    // Clics : on les arrête ici pour qu'ils ne déclenchent pas la pince
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const slot = e.target.closest('.slot');
      if (slot && slot.dataset.index !== undefined) {
        this.selected = Number(slot.dataset.index);
        this.render();
      }
      if (e.target.closest('#inv-drop') && this.selected >= 0) {
        this.onDrop(this.selected);
        this.selected = Math.min(this.selected, this.hold.count - 1);
        this.render();
      }
      if (e.target.closest('#inv-close')) this.close();
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    if (this.selected >= this.hold.count) this.selected = this.hold.count - 1;
    if (this.selected < 0 && this.hold.count) this.selected = 0;
    this.render();
    this.root.classList.add('open');
    document.body.classList.add('inventory-open');
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('open');
    document.body.classList.remove('inventory-open');
  }

  render() {
    const { hold } = this;
    this.summary.textContent = `${hold.count}/${hold.capacity}  ·  ${hold.weight} kg  ·  ≈ ${hold.value} F`;

    let html = '';
    for (let i = 0; i < hold.capacity; i++) {
      const item = hold.items[i];
      if (!item) {
        html += `<div class="slot empty"></div>`;
        continue;
      }
      const r = getRarity(item.rarity);
      const sel = i === this.selected ? ' selected' : '';
      html += `<div class="slot${sel}" data-index="${i}" style="--rarity:${r.color}">
        <img src="${this.thumbnails.get(item.id)}" alt="">
      </div>`;
    }
    this.grid.innerHTML = html;

    const item = hold.items[this.selected];
    if (!item) {
      this.details.innerHTML = `<p class="inv-empty">${hold.count ? '' : 'La soute est vide.'}</p>`;
      return;
    }
    const r = getRarity(item.rarity);
    this.details.innerHTML = `
      <div class="inv-name" style="color:${r.color}">${item.name}</div>
      <div class="inv-rarity" style="color:${r.color}">${r.name.toUpperCase()}</div>
      <p class="inv-desc">${item.description}</p>
      <div class="inv-stats">
        <span>${item.weight} kg</span>
        <span>≈ ${item.price} F</span>
      </div>
      <button id="inv-drop">LARGUER</button>`;
  }
}
