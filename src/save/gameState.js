/**
 * État de la partie (sauvegardé) : argent, jour, améliorations, collection, soute.
 */
export const gameState = {
  money: 0,
  day: 1, // chaque retour au port est un nouveau jour (les prix de la marchande changent)
  upgrades: { oxygen: 0, hull: 0, claw: 0, hold: 0, light: 0 },
  collection: [], // identifiants des objets déjà remontés au moins une fois
  hold: [], // identifiants des objets dans la soute
};

const DEFAULTS = JSON.stringify(gameState);

/** Remet l'état de la partie à zéro (nouvelle partie) */
export function resetGameState() {
  for (const k of Object.keys(gameState)) delete gameState[k];
  Object.assign(gameState, JSON.parse(DEFAULTS));
}
