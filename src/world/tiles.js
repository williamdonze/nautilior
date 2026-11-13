/**
 * Découpage des éléments instanciés en tuiles carrées (x, z), pour deux optimisations :
 *  - le culling hors champ de Three.js (une tuile hors de l'écran n'est pas dessinée) ;
 *  - un culling à distance pour les petits éléments, que le brouillard rend invisibles
 *    bien avant la portée de la caméra.
 */
export const TILE = 50;

export const tileKey = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;

/** Petits éléments enregistrés : { mesh, x, z, maxDist } */
const small = [];

/** Déclare une tuile de petits éléments, masquée au-delà de maxDist de la caméra */
export function registerSmall(mesh, maxDist = 65) {
  mesh.computeBoundingSphere();
  const c = mesh.boundingSphere.center;
  small.push({ mesh, x: c.x, z: c.z, max2: (maxDist + TILE * 0.71) ** 2 });
}

/** À appeler à chaque image avec la position de la caméra */
export function updateTileCulling(camPos) {
  for (const s of small) {
    const dx = s.x - camPos.x, dz = s.z - camPos.z;
    s.mesh.visible = dx * dx + dz * dz < s.max2;
  }
}
