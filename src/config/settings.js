/**
 * Réglages globaux du jeu.
 * Tout ce qui est « réglable » sans toucher à la logique est ici.
 */

/* ---------- Rendu pixelisé ---------- */
export const RENDER = {
  // Hauteur (en pixels) de l'image interne. La largeur suit le ratio de l'écran.
  // 180 = très gros pixels, 240 = façon PS1, 360 = plus fin.
  PIXEL_HEIGHT: 240,
  // Force du dithering (0 = aucun, 0.1 = marqué)
  DITHER: 0.055,
  // 1 = palette stricte, 0 = couleurs libres
  PALETTE_MIX: 1.0,
  // Désaturation globale avant quantification (1 = couleurs d'origine)
  SATURATION: 0.85,
  FOV: 62,
};

/* ---------- Monde ---------- */
export const WORLD = {
  SEED: 1984,
  // Zone navigable (en mètres, 1 unité = 1 m)
  BOUNDS: { minX: -200, maxX: 200, minZ: -350, maxZ: 150 },
  // Surface de l'eau
  SURFACE_Y: 0,
};

export const SEABED = {
  WIDTH: 520,
  LENGTH: 640,
  CENTER_Z: -100,
  SEGMENTS_X: 104,
  SEGMENTS_Z: 128,
  BASE_DEPTH: 30, // profondeur du plateau de départ
  SLOPE_START: 30, // z à partir duquel le fond plonge (vers -z)
  SLOPE: 0.55, // mètres de descente par mètre parcouru
  AMPLITUDE: 9, // relief du bruit
  RIDGE_AMPLITUDE: 7, // crêtes rocheuses
};

export const DECOR = {
  ROCKS: 260,
  ALGAE_CLUMPS: 140,
  ALGAE_PER_CLUMP: [5, 14],
  ALGAE_MAX_DEPTH: 110, // pas d'algues trop profond (plus de lumière)
  MARINE_SNOW: 1800,
  MARINE_SNOW_BOX: 60, // taille du cube de particules autour de la caméra
};

/* ---------- Sous-marin ---------- */
export const SUBMARINE = {
  SPAWN: { x: 0, y: -8, z: 60, yaw: Math.PI },
  FORWARD_ACCEL: 4.2, // m/s²
  REVERSE_ACCEL: 2.0,
  FORWARD_DRAG: 0.55, // freinage longitudinal (inertie)
  SIDE_DRAG: 2.6, // freinage latéral (effet de quille)
  VERTICAL_ACCEL: 3.0,
  VERTICAL_DRAG: 0.9,
  TURN_ACCEL: 2.2, // rad/s²
  TURN_DRAG: 2.4,
  HULL_RADIUS: 1.6, // rayon de collision
  SURFACE_MARGIN: 1.1, // la coque ne dépasse pas la surface
};

export const CAMERA = {
  DISTANCE: 11,
  HEIGHT: 6,
  LOOK_AHEAD: 10,
  LOOK_DOWN: 3, // vise légèrement sous le sous-marin pour voir le fond éclairé
  POS_SMOOTH: 3.2, // plus grand = suit plus vite
  LOOK_SMOOTH: 6,
  SPEED_FOV_BOOST: 6, // degrés de FOV en plus à pleine vitesse
};
