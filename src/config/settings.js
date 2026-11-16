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
  // Zone où apparaissent objets et créatures (le sous-marin, lui, n'est arrêté que par les falaises)
  BOUNDS: { minX: -140, maxX: 140, minZ: -3105, maxZ: 150 },
  // Surface de l'eau
  SURFACE_Y: 0,
};

/**
 * Le monde a été allongé (1 400 m → 3 400 m) pour adoucir la descente : on passe de 0 à 1 190 m de fond
 * par des pentes de 15 à 28° au lieu de falaises. Tout ce qui avait été placé à la main l'a été sur l'ancien monde ;
 * stretchZ convertit une ancienne position Z en nouvelle, zone par zone (le Récif reste où il est près du port).
 */
const STRETCH = [[150, 150], [40, 40], [-175, -450], [-545, -1300], [-880, -2514], [-1180, -3180]];
export function stretchZ(z) {
  if (z >= STRETCH[0][0]) return z;
  for (let i = 0; i < STRETCH.length - 1; i++) {
    const [a0, b0] = STRETCH[i], [a1, b1] = STRETCH[i + 1];
    if (z >= a1) return b0 + ((z - a0) / (a1 - a0)) * (b1 - b0);
  }
  const [a0, b0] = STRETCH[STRETCH.length - 2], [a1, b1] = STRETCH[STRETCH.length - 1];
  return b1 + ((z - a1) / (a1 - a0)) * (b1 - b0);
}
/** Facteur d'allongement moyen (pour garder la même densité de décor sur un monde plus long) */
export const STRETCH_K = 3400 / 1400;
const sz = stretchZ;

export const SEABED = {
  WIDTH: 420,
  Z_START: 220, // le fond s'étend de Z_START à Z_END
  Z_END: -3180,
  CHUNK_LENGTH: 200, // découpage en morceaux (culling hors champ)
  CELL: 4, // taille d'une maille (m)
  // Profil de profondeur le long de Z : [z, profondeur]. Interpolation monotone (pas de marches), pentes douces.
  PROFILE: [
    [220, 20], [40, 30], [sz(-150), 145], [sz(-200), 170], [sz(-330), 300], [sz(-380), 320],
    [sz(-520), 480], [sz(-560), 520], [sz(-620), 640], [sz(-700), 780], [sz(-820), 1000], [sz(-880), 1100], [-3180, 1190],
  ],
  // Bords du canyon (le plateau, au-dessus de la gorge) : [z, profondeur]. Il rejoint le fond des Abysses en pente.
  RIM: [[sz(-560), 520], [-1700, 575], [-2000, 660], [-2300, 830], [-2700, 1125], [-3180, 1190]],
  CANYON: { zStart: sz(-560), zEnd: -2700, halfWidth: 55, meander: 35 },
  AMPLITUDE: 9, // relief du bruit
  RIDGE_AMPLITUDE: 7, // crêtes rocheuses
};

export const DECOR = {
  ROCKS: 4200,
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
  TIDE_DIVES: 3, // toutes les 3 plongées, la marée redistribue les objets (ailleurs) ; entre-temps, ce qui est pris est pris
  MARK_RADIUS: 26, // en deçà, un contour blanc signale les objets que rien ne cache (m)
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
/** Écho du sonar volumétrique (touche R) : révèle en points ce qui est hors de vue */
export const ECHO = {
  SPEED: 70, // vitesse de l'onde (m/s)
  DURATION: 9, // durée de l'image (s)
  COOLDOWN: 3, // délai avant un nouvel écho (s)
};

/** Impulsion de défense (touche F) : fait fuir les bêtes à portée */
export const DEFENSE = {
  RADIUS: 55, // portée de l'onde (m)
  FEAR_TIME: 7, // durée de la fuite (s)
  COOLDOWN: 18, // recharge (s) ; améliorable chez Marcel (upgrades.json, « pulse »)
  MAX_ATTACKERS: 3, // jamais plus de bêtes en train de charger à la fois ; les autres rôdent
  BEAM_RANGE: 0.75, // le faisceau du phare fait reculer les bêtes jusqu'à cette part de sa portée
  BEAM_ANGLE: 0.8, // … dans cette part de son ouverture
  BEAM_FEAR: 2.2, // durée du recul (s)
  BELL_REFUGE: 22, // aucune bête hostile à moins de cette distance d'une cloche à air (m)
  WHALE_REFUGE: 50, // … ni de la baleine (m)
};

/**
 * Le pouls de Loïc (battements par minute). C'est le bip du sonar.
 * L'effort (moteurs), le danger et le manque d'air le font monter ; l'immobilité le calme.
 * Les bêtes le sentent : au-dessus de HUNT, elles chargent ; le ver ne se jette que sur un cœur qui s'emballe.
 */
export const PULSE = {
  REST: 56, // au repos
  EFFORT: 38, // ajouté moteurs à fond
  THREAT: 14, // ajouté quand une bête charge (pas assez, seul, pour entretenir la chasse : on peut se calmer)
  PANIC: 30, // ajouté quand l'air ou la coque sont au plus bas
  RISE: 0.9, // vitesse de montée (1/s)
  CALM: 0.3, // vitesse de retour au calme (1/s)
  HUNT: 78, // au-dessus, les bêtes hostiles osent charger
  WORM: 84, // au-dessus, le ver se jette sur le sous-marin
};

/** Cloches à air : des étapes dans les grandes descentes. x, z = position ; on y refait le plein d'air. */
export const AIR_BELLS = {
  RADIUS: 7, // distance à laquelle l'air se renouvelle (m)
  REFILL: 14, // air rendu par seconde
  SPOTS: [[-30, sz(-200)], [60, sz(-350)], [-70, sz(-500)], [20, sz(-640)], [-25, sz(-790)], [40, sz(-930)], [-55, sz(-1010)]],
};

/**
 * Plafonds de roche (voir world/roof.js).
 * VAULTS : voûtes du Canyon, de z0 (entrée) à z1 (plus profond) ; h = hauteur sous voûte au-dessus du lit, thick = épaisseur.
 * MASSIFS : dômes percés d'un tunnel ; a, b = demi-axes, rot = orientation du tunnel, H = hauteur,
 * wt = demi-largeur du tunnel, ht = sa hauteur.
 */
export const ROOFS = {
  STEP: 2, // finesse du maillage (m)
  VAULT_HALF_WIDTH: 60,
  VAULTS: [
    { z0: sz(-590), z1: sz(-614), h: 20, thick: 9 }, // le Porche
    { z0: sz(-742), z1: sz(-794), h: 24, thick: 12 }, // la Nef (le squelette de baleine est dessous)
    { z0: sz(-824), z1: sz(-844), h: 18, thick: 8 },
  ],
  MASSIFS: [
    { x: -48, z: -62, a: 19, b: 14, rot: 0.6, H: 15, wt: 6, ht: 8.5 }, // Récif : une petite arche, pour apprendre
    { x: -2, z: sz(-328), a: 30, b: 22, rot: -0.4, H: 26, wt: 9, ht: 11.5 }, // Épaves
    // Les grandes dorsales : de longs reliefs posés sur le fond, à l'écart du chemin principal (on peut les contourner),
    // percés de part en part d'un tunnel naturel de vingt-huit mètres de large qui serpente. ridge = le dessus suit le fond.
    { x: 80, z: -480, a: 140, b: 44, rot: Math.PI / 2, H: 55, wt: 14, ht: 22, ridge: true, name: 'La Galerie' }, // fin du Récif
    { x: 100, z: -1000, a: 160, b: 44, rot: Math.PI / 2, H: 60, wt: 14, ht: 22, ridge: true, name: 'Le Boyau' }, // Épaves
    { x: 100, z: -2620, a: 140, b: 42, rot: Math.PI / 2, H: 60, wt: 13, ht: 22, ridge: true, name: 'La Nuit' }, // Abysses
    { x: -24, z: sz(-910), a: 34, b: 24, rot: 1.1, H: 30, wt: 10, ht: 13 }, // Abysses
  ],
};

/** La Baleine du Canyon (paisible) */
export const WHALE = {
  LENGTH: 34, // m
  SPEED: 3.2, // m/s : le sous-marin peut la suivre
  TURN: 0.22, // rad/s
  HEIGHT: 62, // hauteur de nage au-dessus du lit du Canyon (m) : au-dessus des voûtes
  Z_START: sz(-575), // elle va et vient entre ces deux Z
  Z_END: sz(-860),
  CALM_RADIUS: 70, // en deçà, le pouls s'apaise
  LEAD_RADIUS: 60, // en deçà, elle emmène le sous-marin vers un souvenir
  LEAD_RANGE: 420, // … s'il en reste un à cette distance d'elle (m)
  WATCH_HEIGHT: 26, // hauteur à laquelle elle tourne au-dessus du souvenir (m)
  WATCH_TIME: 55, // s
  SONG_RADIUS: 420, // distance jusqu'où porte le chant (m)
  CALM: 16, // battements par minute en moins tout près d'elle
};

/** La forêt de filets du Canyon (autour de la Marie-Morgane) */
export const NETS = {
  COUNT: 15, // nappes en travers du Canyon
  REACH: 2.3, // distance à laquelle le sous-marin s'y prend (m)
  DRAG: 5, // freinage quand on est pris
  CUTS: 3, // coups de pince pour couper une nappe
  BLAST: 16, // rayon dans lequel l'impulsion arrache les filets (m)
};

/** Le gardien du portail (créature colossale des abysses) */
export const GUARDIAN = {
  SEGMENTS: 44, // tronçons du corps
  RADIUS: 8.5, // rayon du corps près de la tête (m) ; longueur ≈ SEGMENTS × RADIUS × 1,25
  ORBIT: 110, // rayon de sa ronde autour de la déchirure (m)
  VISIBLE: 330, // elle apparaît quand le sous-marin est à cette distance du portail
  DOMAIN: 175, // en deçà, elle attaque
  SPEED: 11, // ronde (m/s)
  LUNGE_SPEED: 27, // attaque (m/s)
  LUNGE_TIME: 5, // durée maximale d'une attaque (s)
  REST: 7, // répit entre deux attaques (s)
  BITE: 34, // dégâts d'une morsure
  BODY: 9, // dégâts quand on heurte son corps
};

export const RADIATION = {
  SOURCE: { x: 0, z: sz(-1060) }, // emplacement du portail
  RADIUS: 280, // rayon d'influence (m)
  DAMAGE: 3, // dégâts/s au cœur de la zone
  CRUSH_MULT: 2, // la pression abîme jusqu'à 3× plus vite sous radiation
  COLOR: '#7fbf7a',
};
