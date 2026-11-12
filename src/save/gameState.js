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
