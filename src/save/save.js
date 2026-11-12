import { gameState } from './gameState.js';
import { storyState } from '../story/state.js';

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
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
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
  } catch {
    /* rien */
  }
}
