/**
 * Réglages du joueur (conservés dans le localStorage, indépendants de la partie).
 */
const KEY = 'nautiliar-settings';

export const PIXEL_LEVELS = [
  { height: 160, label: 'Très gros' },
  { height: 200, label: 'Gros' },
  { height: 240, label: 'PS1' },
  { height: 300, label: 'Moyen' },
  { height: 360, label: 'Fin' },
  { height: 480, label: 'Très fin' },
];

export const preferences = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  pixelLevel: 2, // index dans PIXEL_LEVELS
  dither: 0.055,
  showFps: false,
};

export function loadPreferences() {
  try {
    Object.assign(preferences, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    /* réglages par défaut */
  }
  return preferences;
}

export function savePreferences() {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* rien */
  }
}
