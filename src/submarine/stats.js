import upgradesData from '../config/upgrades.json';

/**
 * Caractéristiques actuelles du Nautiliar, partagées par tous les systèmes
 * (survie, pince, soute, phare). Elles découlent des niveaux d'amélioration achetés.
 */
export const UPGRADES = upgradesData.categories;

export const stats = {};

/** Recalcule les caractéristiques à partir des niveaux { oxygen: 2, hull: 0, … } */
export function applyUpgrades(levels) {
  for (const cat of UPGRADES) {
    const level = Math.min(levels[cat.id] ?? 0, cat.levels.length - 1);
    // On applique tous les niveaux jusqu'au niveau courant (les suivants écrasent les précédents)
    for (let i = 0; i <= level; i++) Object.assign(stats, cat.levels[i].stats);
  }
  return stats;
}

applyUpgrades({});
