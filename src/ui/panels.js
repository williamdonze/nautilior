import { getRarity, ITEMS, RARITIES } from '../loot/loot.js';
import { sellPrice } from '../port/market.js';
import { UPGRADES, stats } from '../submarine/stats.js';
import fragmentsData from '../story/fragments.json';
import { storyState } from '../story/state.js';

/**
 * Panneaux du port : boutique de la marchande, atelier du mécano, collection de la criée.
 * Un seul panneau ouvert à la fois, dans #panel. Échap ou ✕ pour fermer.
 */
const fmt = (n) => n.toLocaleString('fr-FR');

export class Panels {
  /**
   * @param {object} deps gameState, hold, thumbnails, sound, onChange() (sauvegarde), onClose()
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.root = document.getElementById('panel');
    this.current = null;
    this.selected = null;

    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      const arg = t.dataset.arg;
      if (act === 'close') this.close();
      else if (act === 'sell') this.sell(Number(arg));
      else if (act === 'sellAll') this.sellAll();
      else if (act === 'buy') this.buy(arg);
      else if (act === 'memory') this.onMemory?.(arg);
      else if (act === 'select') {
        this.selected = arg;
        this.render();
      }
    });
  }

  get isOpen() {
    return !!this.current;
  }

  open(kind) {
    this.current = kind;
    this.selected = null;
    this.render();
    this.root.classList.add('open');
  }

  close() {
    if (!this.current) return;
    this.current = null;
    this.root.classList.remove('open');
    this.onClose?.();
  }

  render() {
    const html = { shop: () => this.renderShop(), upgrades: () => this.renderUpgrades(), collection: () => this.renderCollection() }[this.current];
    if (html) this.root.innerHTML = `<div class="inv-panel port-panel">${html()}</div>`;
  }

  header(title, sub) {
    return `<div class="inv-header">
      <span class="inv-title">${title}</span><span id="inv-summary">${sub}</span>
      <button data-act="close">✕</button>
    </div>`;
  }

  /* ------------------------------------------------------------ Marchande */

  renderShop() {
    const { hold, gameState: g } = this;
    // Objets que la marchande refuse (cloche, éclat vert) : ils restent en soute
    const total = hold.items.reduce((s, it) => s + (it.noSale ? 0 : sellPrice(it, g.day)), 0);
    const rows = hold.items
      .map((it, i) => {
        const r = getRarity(it.rarity);
        const price = sellPrice(it, g.day);
        const trend = price > it.price ? '<span class="up">▲</span>' : price < it.price ? '<span class="down">▼</span>' : '';
        return `<div class="row">
          <img src="${this.thumbnails.get(it.id)}" alt="" style="border-color:${r.color}">
          <span class="row-name" style="color:${r.color}">${it.name}</span>
          ${it.noSale
            ? '<span class="row-price">—</span><button disabled>REFUSÉ</button>'
            : `<span class="row-price">${fmt(price)} F ${trend}</span><button data-act="sell" data-arg="${i}">VENDRE</button>`}
        </div>`;
      })
      .join('');
    return `${this.header('LA MARCHANDE', `Bourse : ${fmt(g.money)} F`)}
      <div class="panel-body">
        <p class="panel-quote">${hold.count ? '« Montre voir. »' : '« Tu n\'as rien à me vendre. Reviens quand la mer t\'aura donné quelque chose. »'}</p>
        <div class="rows">${rows}</div>
      </div>
      <div class="inv-footer panel-footer">
        <span>Prix du jour (jour ${g.day}) · ▲▼ par rapport à la valeur habituelle</span>
        ${total ? `<button data-act="sellAll">TOUT VENDRE · ${fmt(total)} F</button>` : ''}
      </div>`;
  }

  sell(index) {
    const item = this.hold.items[index];
    if (!item || item.noSale) return;
    this.gameState.money += sellPrice(item, this.gameState.day);
    this.hold.removeAt(index);
    this.sound.coin();
    this.onChange();
    this.render();
  }

  sellAll() {
    const kept = this.hold.items.filter((it) => it.noSale);
    const sold = this.hold.items.filter((it) => !it.noSale);
    this.hold.fromIds(kept.map((it) => it.id));
    for (const it of sold) this.gameState.money += sellPrice(it, this.gameState.day);
    if (sold.length) this.sound.coin(true);
    this.onChange();
    this.render();
  }

  /* ------------------------------------------------------------ Mécano */

  renderUpgrades() {
    const g = this.gameState;
    const rows = UPGRADES.map((cat) => {
      const level = g.upgrades[cat.id] ?? 0;
      const cur = cat.levels[level];
      const next = cat.levels[level + 1];
      let action;
      if (!next) action = `<span class="maxed">MAX</span>`;
      else {
        const afford = g.money >= next.cost;
        action = `<button data-act="buy" data-arg="${cat.id}" ${afford ? '' : 'disabled'} class="${next.abyssal ? 'abyssal' : ''}">${fmt(next.cost)} F</button>`;
      }
      const pips = cat.levels.map((_, i) => `<i class="${i <= level ? 'on' : ''}"></i>`).join('');
      return `<div class="row upgrade ${next?.abyssal ? 'is-abyssal' : ''}">
        <div class="up-info">
          <div class="row-name">${cat.name} <span class="pips">${pips}</span></div>
          <div class="up-cur">${cur.label} · ${describe(cat.id, cur.stats)}</div>
          ${next ? `<div class="up-next">→ ${next.label} · ${describe(cat.id, next.stats)}</div>` : ''}
        </div>
        ${action}
      </div>`;
    }).join('');
    return `${this.header('L\'ATELIER', `Bourse : ${fmt(g.money)} F`)}
      <div class="panel-body">
        <p class="panel-quote">« Ça va te coûter. Tout coûte. »</p>
        <div class="rows">${rows}</div>
      </div>
      <div class="inv-footer">La coque est réparée à chaque retour au port.</div>`;
  }

  buy(catId) {
    const g = this.gameState;
    const cat = UPGRADES.find((c) => c.id === catId);
    const next = cat?.levels[(g.upgrades[catId] ?? 0) + 1];
    if (!next || g.money < next.cost) {
      this.sound.deny();
      return;
    }
    g.money -= next.cost;
    g.upgrades[catId] = (g.upgrades[catId] ?? 0) + 1;
    this.sound.upgrade();
    this.onUpgrade?.(catId, next);
    this.onChange();
    this.render();
  }

  /* ------------------------------------------------------------ Collection */

  renderCollection() {
    const found = new Set(this.gameState.collection);
    const sorted = [...ITEMS].sort((a, b) => getRarity(a.rarity).level - getRarity(b.rarity).level);
    const cells = sorted
      .map((it) => {
        const r = getRarity(it.rarity);
        const known = found.has(it.id);
        const sel = this.selected === it.id ? ' selected' : '';
        return `<div class="slot${known ? '' : ' unknown'}${sel}" data-act="select" data-arg="${it.id}" style="--rarity:${known ? r.color : '#17323b'}">
          <img src="${this.thumbnails.get(it.id)}" alt="">
        </div>`;
      })
      .join('');
    const it = ITEMS.find((i) => i.id === this.selected);
    let details = '<p class="inv-empty">Choisis un objet.</p>';
    if (it) {
      const r = getRarity(it.rarity);
      details = found.has(it.id)
        ? `<div class="inv-name" style="color:${r.color}">${it.name}</div>
           <div class="inv-rarity" style="color:${r.color}">${r.name.toUpperCase()}</div>
           <p class="inv-desc">${it.description}</p>
           <div class="inv-stats"><span>${it.weight} kg</span><span>≈ ${fmt(it.price)} F</span></div>`
        : `<div class="inv-name">???</div>
           <div class="inv-rarity" style="color:${r.color}">${r.name.toUpperCase()}</div>
           <p class="inv-desc">Pas encore remonté. On le trouve à partir de ${it.minDepth} m.</p>`;
    }
    const byRarity = RARITIES.map((r) => {
      const all = ITEMS.filter((i) => i.rarity === r.id);
      const n = all.filter((i) => found.has(i.id)).length;
      return `<span style="color:${r.color}">${n}/${all.length}</span>`;
    }).join(' · ');
    // Souvenirs : on peut les relire
    const memories = fragmentsData.fragments
      .map((f, i) => {
        const known = storyState.fragments.includes(f.id);
        return known
          ? `<button class="memory-btn" data-act="memory" data-arg="${f.id}">${i + 1}. ${f.name}</button>`
          : `<span class="memory-btn locked">${i + 1}. ???</span>`;
      })
      .join('');
    return `${this.header('L\'ANCIENNE CRIÉE', `${found.size}/${ITEMS.length} · ${byRarity}`)}
      <div class="panel-body">
        <p class="panel-quote">Sur les étals vides, tu ranges ce que la mer t'a rendu.</p>
        <div class="inv-body collection">
          <div id="inv-grid" class="collection-grid">${cells}</div>
          <div id="inv-details">${details}</div>
        </div>
        <div class="memories">
          <div class="memories-title">SOUVENIRS · ${storyState.fragments.length}/${fragmentsData.fragments.length}</div>
          <div class="memories-list">${memories}</div>
        </div>
      </div>`;
  }
}

/** Description courte des caractéristiques d'un niveau */
function describe(catId, s) {
  switch (catId) {
    case 'oxygen': return `${Math.floor(s.oxygenMax / 60)} min ${String(s.oxygenMax % 60).padStart(2, '0')} d'air`;
    case 'hull': return `${s.crushDepth} m max`;
    case 'claw': return `portée ${s.clawRange} m, vitesse ×${s.clawSpeed}`;
    case 'hold': return `${s.holdCapacity} emplacements`;
    case 'light': return `phare ${s.lightRange} m, sonar ${s.radarRange} m`;
    default: return '';
  }
}

export { stats };
