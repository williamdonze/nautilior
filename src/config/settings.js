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
  DISTANCE: 11, // distance par défaut (molette pour zoomer)
  ZOOM_MIN: 0.65, // facteur de zoom (×distance et ×hauteur)
  ZOOM_MAX: 1.4,
  HEIGHT: 6.5,
  SIDE: 3.2, // décalage latéral (vue par-dessus l'épaule) : on voit la pince travailler devant le nez
  LOOK_AHEAD: 10,
  LOOK_DOWN: 3, // vise légèrement sous le sous-marin pour voir le fond éclairé
  POS_SMOOTH: 3.2, // plus grand = suit plus vite
  LOOK_SMOOTH: 6,
  SPEED_FOV_BOOST: 6, // degrés de FOV en plus à pleine vitesse
};

/* ---------- Pince ---------- */
export const CLAW = {
  RANGE: 12, // portée maximale (m), mesurée depuis l'épaule du bras
  // Points dans le repère du sous-marin (avant = +Z)
  ROOT: { x: 0, y: -0.95, z: 2.3 }, // épaule, sous le nez
  REST: { x: 0, y: -1.55, z: 3.5 }, // poignet replié au repos
  POLE: { x: 0, y: -0.5, z: -1 }, // le coude plie vers le bas / l'arrière
  SEGMENT_MIN: 0.85, // longueur minimale d'un segment (bras replié)
  SLEEVE_LENGTH: 1.1, // gaine fixe ; au-delà, la tige télescopique sort
  GRAB_OFFSET: 0.95, // distance poignet → centre de la prise
  EXTEND_SPEED: 17,
  EXTEND_ACCEL: 45,
  RETRACT_SPEED: 10,
  RETRACT_ACCEL: 30,
  WEIGHT_REF: 25, // kg : à ce poids, le retour est deux fois plus lent
  CLOSE_TIME: 0.22, // fermeture des mâchoires
  HOLD_TIME: 0.32, // petite pause après la prise
  STOW_TIME: 0.45, // rangement dans la soute
};

/* ---------- Objets posés au fond (test de la pince, enrichi en phase 3) ---------- */
export const PICKUPS = {
  COUNT: 140,
  NEAR_SPAWN: 28, // nombre d'objets placés près du point de départ
  NEAR_RADIUS: 60,
};

/* ---------- Soute ---------- */
export const HOLD = {
  CAPACITY: 8, // emplacements (augmentera avec les améliorations en phase 5)
};

/* ---------- Survie ---------- */
export const SURVIVAL = {
  // Caractéristiques de base du Nautiliar (les améliorations de la phase 5 les modifieront)
  OXYGEN_MAX: 150, // secondes d'air au repos
  HULL_MAX: 100,
  CRUSH_DEPTH: 130, // profondeur max supportée par la coque (m)

  OXYGEN_USE: 1, // par seconde
  OXYGEN_USE_THRUST: 0.6, // en plus, à pleine poussée
  OXYGEN_REFILL: 30, // par seconde en surface
  SURFACE_DEPTH: 2.5, // en dessous de cette profondeur, on est « en surface »
  SURFACE_REPAIR: 2, // réparation de fortune en surface (provisoire, le mécano s'en chargera en phase 5)

  CRUSH_DAMAGE_BASE: 0.6, // dégâts/s dès qu'on dépasse la profondeur max…
  CRUSH_DAMAGE_PER_M: 0.06, // …plus tant par mètre de dépassement
  IMPACT_THRESHOLD: 3.5, // vitesse de choc (m/s) au-delà de laquelle la coque s'abîme
  IMPACT_DAMAGE: 4, // dégâts par m/s au-delà du seuil

  OXYGEN_WARNING: 0.25, // alerte sous 25 %
  OXYGEN_CRITICAL: 0.12,
  LOSS_FRACTION: 0.5, // part de la soute perdue au réveil
};

/* ---------- Radiation (provisoire : la source sera le portail des abysses en phase 6) ---------- */
export const RADIATION = {
  SOURCE: { x: 0, z: -335 }, // point le plus profond de la carte actuelle
  RADIUS: 115, // rayon d'influence (m)
  DAMAGE: 2.5, // dégâts/s au cœur de la zone
  CRUSH_MULT: 2, // la pression abîme jusqu'à 3× plus vite sous radiation
  COLOR: '#7fbf7a',
};
