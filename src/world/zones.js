import zonesData from '../config/zones.json';

/** Les 4 zones de profondeur (Récif, Épaves, Canyon, Abysses) */
export const ZONES = zonesData.zones;

export function zoneAtDepth(depth) {
  return ZONES.find((z) => depth >= z.minDepth && depth < z.maxDepth) ?? ZONES[ZONES.length - 1];
}
