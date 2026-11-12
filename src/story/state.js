/**
 * État narratif (sauvegardé).
 *  - flags : drapeaux posés par les dialogues (introDone, subGiven…)
 *  - deaths : nombre de réveils à l'hôpital
 *  - fragments : fragments de mémoire trouvés (phase 6)
 *  - abyssalHull : la coque abyssale a été achetée (phase 7)
 *  - seen : conversations « une seule fois » déjà vues
 */
export const storyState = {
  flags: {},
  deaths: 0,
  fragments: [],
  abyssalHull: false,
  seen: [],
};

/** Valeur d'une variable narrative utilisable dans les conditions des dialogues */
export function storyValue(key) {
  if (key === 'fragments') return storyState.fragments.length;
  if (key in storyState) return storyState[key];
  return storyState.flags[key] ?? false;
}
