/**
 * Réglages du joueur (conservés dans le localStorage, indépendants de la partie).
 */
const KEY = 'nautiliar-settings';

/** Qualité graphique : résolution de rendu relative à l'écran */
export const QUALITY_LEVELS = [
  { scale: 0.5, label: 'Basse' },
  { scale: 0.75, label: 'Moyenne' },
  { scale: 1, label: 'Haute' },
];

export const preferences = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  qualityLevel: 2, // index dans QUALITY_LEVELS
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
