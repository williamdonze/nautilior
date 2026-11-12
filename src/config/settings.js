/**
 * Réglages globaux du jeu.
 * Tout ce qui est « réglable » sans toucher à la logique est ici.
 */

/* ---------- Rendu ---------- */
export const RENDER = {
  FOV: 62,
  FIRST_PERSON_FOV: 72,
};

/* ---------- Monde ---------- */
export const WORLD = {
  SEED: 1984,
  // Zone navigable (en mètres, 1 unité = 1 m)
  BOUNDS: { minX: -170, maxX: 170, minZ: -1120, maxZ: 150 },
  // Surface de l'eau
  SURFACE_Y: 0,
};

export const SEABED = {
  WIDTH: 420,
  Z_START: 220, // le fond s'étend de Z_START à Z_END
  Z_END: -1180,
  CHUNK_LENGTH: 200, // découpage en morceaux (culling hors champ)
  CELL: 5, // taille d'une maille (m)
  // Profil de profondeur le long de Z : [z, profondeur] (interpolation douce entre les points)
  PROFILE: [
    [220, 20], [40, 30], [-150, 145], [-200, 170], [-330, 300], [-380, 320],
    [-520, 480], [-560, 520], [-620, 640], [-700, 780], [-820, 1000], [-880, 1100], [-1180, 1190],
  ],
  // Bords du canyon (au-dessus du lit) : [z, profondeur]
  RIM: [[-560, 520], [-700, 565], [-820, 630], [-880, 1100], [-1180, 1190]],
  CANYON: { zStart: -560, zEnd: -880, halfWidth: 55, meander: 35 },
  AMPLITUDE: 9, // relief du bruit
  RIDGE_AMPLITUDE: 7, // crêtes rocheuses
};

export const DECOR = {
  ROCKS: 900,
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
  // Portée et vitesse : voir config/upgrades.json (stats.clawRange, stats.clawSpeed)
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
  // Le nombre d'objets par zone est dans config/zones.json
  NEAR_SPAWN: 28, // objets supplémentaires placés près du point de départ
  NEAR_RADIUS: 60,
  NEAR_RENDER: 70, // seuls les objets à moins de cette distance sont visés (performance)
};


/* ---------- Survie ---------- */
export const SURVIVAL = {
  // Réserve d'air, coque et profondeur max : voir config/upgrades.json
  OXYGEN_USE: 1, // par seconde
  OXYGEN_USE_THRUST: 0.6, // en plus, à pleine poussée
  OXYGEN_REFILL: 30, // par seconde en surface
  SURFACE_DEPTH: 2.5, // en dessous de cette profondeur, on est « en surface »

  CRUSH_DAMAGE_BASE: 0.6, // dégâts/s dès qu'on dépasse la profondeur max…
  CRUSH_DAMAGE_PER_M: 0.06, // …plus tant par mètre de dépassement
  IMPACT_THRESHOLD: 3.5, // vitesse de choc (m/s) au-delà de laquelle la coque s'abîme
  IMPACT_DAMAGE: 4, // dégâts par m/s au-delà du seuil

  OXYGEN_WARNING: 0.25, // alerte sous 25 %
  OXYGEN_CRITICAL: 0.12,
  LOSS_FRACTION: 0.5, // part de la soute perdue au réveil
};

/* ---------- Radiation : émise par le portail, au fond des abysses ---------- */
export const RADIATION = {
  SOURCE: { x: 0, z: -1060 }, // emplacement du portail
  RADIUS: 280, // rayon d'influence (m)
  DAMAGE: 3, // dégâts/s au cœur de la zone
  CRUSH_MULT: 2, // la pression abîme jusqu'à 3× plus vite sous radiation
  COLOR: '#7fbf7a',
};
