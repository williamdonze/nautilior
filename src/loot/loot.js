import itemsData from './items.json';
import raritiesData from './rarities.json';
import lootTable from './lootTable.json';

/**
 * Accès aux données de loot et tirage pondéré par la profondeur.
 */
export const RARITIES = raritiesData.rarities;
export const ITEMS = itemsData.items;

const rarityById = new Map(RARITIES.map((r) => [r.id, r]));
const itemById = new Map(ITEMS.map((it) => [it.id, it]));

/** Pseudo-rareté des fragments de mémoire (jamais tirée au sort, aucune lueur : on les trouve à l'oreille et au radar) */
export const FRAGMENT_RARITY = { id: 'souvenir', name: 'Souvenir', level: 3, color: '#e8ece2', glow: 0, halo: 0, pillar: 0 };

export const getRarity = (id) => (id === 'souvenir' ? FRAGMENT_RARITY : rarityById.get(id) ?? RARITIES[0]);
export const getItem = (id) => itemById.get(id);

/** Poids de chaque rareté à une profondeur donnée (interpolation entre paliers) */
export function rarityWeightsAt(depth) {
  const bands = lootTable.bands;
  let a = bands[0];
  let b = bands[bands.length - 1];
  if (depth <= a.depth) b = a;
  else if (depth >= b.depth) a = b;
  else {
    for (let i = 0; i < bands.length - 1; i++) {
      if (depth >= bands[i].depth && depth <= bands[i + 1].depth) {
        a = bands[i];
        b = bands[i + 1];
        break;
      }
    }
  }
  const t = a === b ? 0 : (depth - a.depth) / (b.depth - a.depth);
  const out = {};
  for (const r of RARITIES) {
    const wa = a.weights[r.id] ?? 0;
    const wb = b.weights[r.id] ?? 0;
    out[r.id] = wa + (wb - wa) * t;
  }
  return out;
}

function weightedPick(entries, rand) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.v;
  }
  return entries[entries.length - 1].v;
}

/**
 * Tire un objet pour une profondeur donnée.
 * 1. on tire la rareté selon la table ;
 * 2. on choisit un objet de cette rareté accessible à cette profondeur ;
 * 3. s'il n'y en a pas, on redescend d'une rareté.
 */
export function rollItem(depth, rand) {
  const weights = rarityWeightsAt(depth);
  const rarityId = weightedPick(
    RARITIES.map((r) => ({ v: r.id, w: weights[r.id] })),
    rand
  );
  let level = getRarity(rarityId).level;
  while (level >= 0) {
    const rid = RARITIES[level].id;
    const candidates = ITEMS.filter((it) => it.rarity === rid && it.minDepth <= depth);
    if (candidates.length) {
      return weightedPick(candidates.map((it) => ({ v: it, w: it.spawnWeight ?? 1 })), rand);
    }
    level--;
  }
  return ITEMS[0];
}
