import { gameState } from './gameState.js';
import { storyState } from '../story/state.js';
import { getItem } from '../loot/loot.js';

/**
 * Sauvegarde dans le localStorage.
 * Les accès sont protégés : en navigation privée, le stockage peut être indisponible.
 */
const KEY = 'nautiliar-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: Date.now(), game: gameState, story: storyState }));
    return true;
  } catch {
    return false;
  }
}

/** Charge la sauvegarde dans les objets d'état ; renvoie true si une sauvegarde existait */
/**
 * Migration des anciennes sauvegardes (lore v1) : les identifiants d'objets supprimés
 * sont convertis en objets de même rareté. Les id inconnus sont retirés.
 */
const ID_MIGRATION = {
  clochette_ys: 'clochette_chapelle',
  couronne_dahut: 'couronne_mariee',
  clef_gradlon: 'clochette_chapelle',
  larme_dahut: 'couronne_mariee', // jamais l'éclat vert : il ne se trouve qu'au fond
  statuette_ys: 'figure_proue',
  tesselle_ys: 'hublot_cargo',
};

function migrateIds(ids, dedupe = false) {
  if (!Array.isArray(ids)) return [];
  const out = ids.map((id) => ID_MIGRATION[id] ?? id).filter((id) => getItem(id));
  return dedupe ? [...new Set(out)] : out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.game) {
      data.game.hold = migrateIds(data.game.hold);
      data.game.collection = migrateIds(data.game.collection, true);
    }
    Object.assign(gameState, data.game, { upgrades: { ...gameState.upgrades, ...data.game?.upgrades } });
    Object.assign(storyState, data.story, { flags: { ...data.story?.flags } });
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PRECHOICE_KEY);
  } catch {
    /* rien */
  }
}

/* ---------- Sauvegarde « avant le choix final » ---------- */
const PRECHOICE_KEY = 'nautiliar-save-v1-prechoice';
const ENDINGS_KEY = 'nautiliar-endings'; // fins découvertes (conservées entre les parties)

/** Enregistre l'état juste avant le choix final ; au rechargement, on reprend devant le portail */
export function savePrechoice() {
  try {
    const game = { ...gameState, resumeAt: 'portal' };
    localStorage.setItem(PRECHOICE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), game, story: storyState }));
  } catch {
    /* rien */
  }
}

export function hasPrechoice() {
  try {
    return !!localStorage.getItem(PRECHOICE_KEY);
  } catch {
    return false;
  }
}

/** Remplace la sauvegarde courante par celle d'avant le choix */
export function restorePrechoice() {
  try {
    const raw = localStorage.getItem(PRECHOICE_KEY);
    if (!raw) return false;
    localStorage.setItem(KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function getEndings() {
  try {
    return JSON.parse(localStorage.getItem(ENDINGS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function markEnding(id) {
  try {
    const list = getEndings();
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(ENDINGS_KEY, JSON.stringify(list));
  } catch {
    /* rien */
  }
}
