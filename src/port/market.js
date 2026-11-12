/**
 * Prix de la marchande : chaque jour (= chaque retour au port), le prix de chaque objet
 * varie de ±15 % autour de sa valeur. Le tirage est déterministe : même jour, même prix.
 */
const VARIATION = 0.15;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function marketFactor(itemId, day) {
  return 1 - VARIATION + hash(`${itemId}#${day}`) * VARIATION * 2;
}

export function sellPrice(item, day) {
  return Math.max(1, Math.round(item.price * marketFactor(item.id, day)));
}
