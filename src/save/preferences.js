/**
 * Réglages du joueur (conservés dans le localStorage, indépendants de la partie).
 * Chargés dès l'import du module : le renderer et la construction du monde en dépendent.
 */
const KEY = 'nautiliar-settings';

/**
 * Niveaux de détail (d'après Abyssal Garden : même monde, construit avec moins de choses).
 *  scale   : résolution maximale relative à l'écran (la résolution auto peut descendre en dessous)
 *  msaa    : antialiasing (échantillons)
 *  shadows : taille de la carte d'ombres du soleil (0 = pas d'ombres)
 *  raySun / raySpot : nombre de pas de la lumière volumétrique (0 = désactivée)
 *  flora   : densité de la flore et des petits éléments du fond (nécessite un rechargement)
 *  bloom   : niveaux du halo lumineux
 */
export const QUALITY_LEVELS = [
  { label: 'Basse', scale: 0.6, msaa: 0, shadows: 0, raySun: 0, raySpot: 8, flora: 0.35, bloom: 4 },
  { label: 'Moyenne', scale: 0.8, msaa: 2, shadows: 1024, raySun: 8, raySpot: 10, flora: 0.65, bloom: 5 },
  { label: 'Haute', scale: 1, msaa: 4, shadows: 2048, raySun: 14, raySpot: 16, flora: 1, bloom: 6 },
];

/** Niveau proposé à la première visite : selon la mémoire et le type d'appareil */
function defaultLevel() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '');
  const mem = navigator.deviceMemory ?? 8;
  if (mobile || mem <= 4) return 0;
  if (mem <= 6) return 1;
  return 2;
}

export const preferences = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  qualityLevel: defaultLevel(), // index dans QUALITY_LEVELS
  autoRes: true, // résolution adaptée en continu pour tenir 60 images/s
  showFps: false,
};

export function loadPreferences() {
  try {
    Object.assign(preferences, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    /* réglages par défaut */
  }
  preferences.qualityLevel = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, preferences.qualityLevel | 0));
  return preferences;
}

export function savePreferences() {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* rien */
  }
}

/** Le niveau de détail courant */
export const quality = () => QUALITY_LEVELS[preferences.qualityLevel] ?? QUALITY_LEVELS[2];

loadPreferences();
