# Projet : Nautiliar

Tu vas développer **Nautiliar**, un jeu web 3D d'exploration sous-marine narratif, dans ce repo.

## Concept
Le joueur pilote un vieux sous-marin, explore les fonds marins et récupère des objets avec la **pince** du sous-marin. Certains objets sont très rares. Il remonte au **port** pour vendre son loot et améliorer son sous-marin afin de descendre toujours plus profond.
Boucle de jeu : Port (vendre / améliorer / parler aux PNJ) → Plongée (explorer / attraper) → Remontée (avant d'être à court d'oxygène) → Port.

## Lore
**La seule référence narrative est `docs/LORE.md`** : lis-le en entier avant d'écrire le moindre texte, en particulier « 3. Les règles du rêve », « 4. Ce que chaque chose est en réalité » et « 12. Ton et règles d'écriture ».

En bref : Bretagne, 1984, le village de **Port-Kermor**. Le joueur, **Loïc**, croit se réveiller d'un coma dans son village déserté. En réalité il est toujours dans le coma, et tout le jeu se passe dans sa tête, fabriqué avec ce qu'il entend de sa chambre et avec sa mémoire. Les trois villageois ont les visages de ceux qui le veillent : le **docteur Guéguen**, son père **Marcel** (le mécano) et sa mère **Hélène** (la marchande). Le bip du sonar est son moniteur cardiaque ; le temps est figé à **4 h 12**, l'heure de son arrêt cardiaque ; chaque mort en plongée est une alerte médicale. La profondeur est ce qu'il a enfoui : tout au fond, la mort de son frère **Yann**, qui s'est noyé en le sauvant. Au fond des Abysses, **la faille** est une déchirure de lumière verte, le tracé de son cœur : la fermer, c'est mourir ; la traverser, c'est se réveiller.

Règles d'écriture : textes courts, mélancoliques ; **dans le rêve, personne ne raconte l'histoire** (objets, souvenirs, décor) ; **au réveil, les vrais personnages parlent clairement**. Rien de surnaturel, aucune légende. Le joueur doit comprendre trois choses : il était dans le coma, les villageois étaient sa famille, son frère est mort en le sauvant.

## Style visuel (très important)
Rendu sous-marin réaliste et détaillé, dans l'esprit d'« Abyssal Garden » (pas de pixelisation) :
- Plongée dessinée par un moteur **WebGPU** (`src/gpu/`) : eau et brouillard par couleur, caustiques, rayons de lumière, halo, forêts de kelp en feuilles instanciées. Repli sur Three.js sans WebGPU.
- Modèles lisses (coques, animaux, épaves), détails dessinés par les shaders (tôles, rivets, roche, corail).
- Palette désaturée (bleus, verts d'eau, rouille, gris granit) ; l'obscurité grandit avec la profondeur.
- Un phare à l'avant du sous-marin, principale source de lumière en profondeur.
- Plus on approche du portail, plus la lueur est verdâtre et surnaturelle.
- En surface : port brumeux, granit, ciel gris, lumière froide (Three.js).
- Interface fine et discrète (police Barlow Condensed) ; en vue cockpit, les informations se lisent sur le tableau de bord.

## Stack technique
- **Vite** + **JavaScript** (modules ES), pas de framework UI
- **Three.js** (+ addons `three/examples/jsm` pour le post-processing)
- **Rapier** (`@dimforge/rapier3d-compat`) pour la physique si nécessaire
- HUD et dialogues en HTML/CSS par-dessus le canvas, police Barlow Condensed
- Sauvegarde dans `localStorage`

## Architecture
```
src/
├── main.js
├── core/        # boucle de jeu, renderer, sons, inputs
├── submarine/   # contrôles, physique, caméra, jauges
├── claw/        # pince : visée, extension, prise, retour
├── gpu/         # moteur WebGPU de la plongée (shaders, pont depuis la scène Three.js, kelp)
├── world/       # sol marin (seabed.js), plafonds (roof.js), décor, créatures, filets, baleine, spawn des objets
├── loot/        # définitions des objets, raretés, table de loot pondérée
├── port/        # scène du port, marchand, améliorations, collection
├── story/       # dialogues, fragments de mémoire, état narratif, fins
├── ui/          # HUD, inventaire, boîtes de dialogue, menus
└── save/        # sauvegarde / chargement
docs/
└── LORE.md
```
Code propre, modulaire, commenté en français. Les données (objets, prix, améliorations, dialogues) dans des fichiers de config / JSON séparés, faciles à modifier sans toucher au code.

## Phases de développement
Travaille **phase par phase**. À la fin de chaque phase : vérifie que `npm run dev` et `npm run build` fonctionnent, fais un commit clair, puis **arrête-toi et résume ce qui a été fait** pour que je teste avant de passer à la suivante.

### Phase 1 : bases
- Initialiser Vite + Three.js, un README avec les commandes, et `docs/LORE.md`.
- Mettre en place l'effet pixelisé complet (basse résolution, palette, dithering, fog, neige marine).
- Un sol marin avec un relief simple (plane déformée par du bruit), des rochers et des algues low-poly.
- Un sous-marin rouillé pilotable : ZQSD/WASD pour avancer et tourner, Espace / Shift pour monter et descendre, avec de l'**inertie**. Compatible AZERTY et QWERTY.
- Une caméra à la troisième personne qui suit en douceur.
- HUD : profondeur en mètres.

### Phase 2 : la pince
- Visée à la souris (raycast), avec l'objet visé en surbrillance s'il est à portée.
- Au clic : le bras articulé se déploie, la pince se referme, puis le bras ramène l'objet dans la soute.
- Portée maximale ; les objets lourds ralentissent le retour.
- Animations fluides, et un retour visuel et sonore à la capture.

### Phase 3 : loot et raretés
- 5 raretés : commun, peu commun, rare, épique, légendaire (une couleur chacune).
- Une quinzaine d'objets cohérents avec la Bretagne des années 80 et le lore (filets, casiers, vaisselle de naufrage, médailles, objets des cycles passés…), avec nom, description courte et intrigante, rareté, poids, prix et profondeur minimale.
- Table de loot pondérée par la profondeur.
- Les objets rares brillent et ont un effet spécial à la capture.
- Une soute limitée et un inventaire (touche I / Tab).

### Phase 4 : survie
- Une jauge d'oxygène qui se recharge en surface.
- Une profondeur maximale liée à la coque (au-delà, la coque s'abîme).
- Les zones proches du portail exposent à une « radiation » qui use la coque plus vite.
- Si l'oxygène tombe à zéro : retour à l'hôpital du village et perte d'une partie de la soute (écran noir, réveil : « Encore vous… »).

### Phase 5 : le port et les PNJ
- La scène du port à la surface : quai, hôpital, atelier du mécano, boutique de la marchande, maisons fermées. Le joueur s'y déplace à pied (vue à la troisième personne) ou par un menu simple.
- Un système de dialogue : boîte de texte, texte qui s'affiche progressivement, choix de réponses simples. Dialogues en JSON, qui dépendent de l'état narratif.
- La marchande : vente du loot, prix qui varient légèrement.
- Le mécano : améliorations d'oxygène, de coque, de pince, de soute et de phare, avec des coûts croissants. La **coque abyssale** est la dernière, extrêmement chère.
- Un musée / collection des objets rares découverts.
- Sauvegarde automatique.

### Phase 6 : monde, créatures et fragments de mémoire
- 4 zones : Récif (0 à 150 m), Épaves (150 à 500 m), Canyon (500 à 1000 m), Abysses (plus de 1000 m), où se trouve le portail.
- Forme du monde (voir `LAYOUT` dans `src/config/settings.js`, et `carte.html` pour la voir en 3D) : quatre bassins en pente douce sur 4,4 km, séparés par trois barres rocheuses ; on passe de l'un à l'autre par un tunnel géant (Les Veines, La Trachée, Le Jardin de verre). Dans les Abysses : la Salle (caverne) et son lac. `seabed.js` décrit le sol, `roof.js` la roche au-dessus de l'eau, `gpu/garden.js` toute la flore.
- Des créatures : poissons normaux près de la surface, créatures mutées et dangereuses en profondeur (formes déformées, yeux lumineux) qui endommagent la coque.
- 6 à 8 **fragments de mémoire** répartis par profondeur. Chacun affiche un court souvenir (texte + image pixel ou plan fixe) et fait évoluer les dialogues des villageois.

### Phase 7 : la fin
- Une fois la coque abyssale achetée, les dialogues changent : les trois villageois supplient le joueur de fermer la faille (écho de ce qui se dit à son chevet ; Hélène, en secret, l'avertit).
- Le portail dans les Abysses : une déchirure verticale de lumière verte, sans cadre, aux bords ondulants, qui dessine de près un tracé d'électrocardiogramme.
- **Trois fins** (voir `docs/LORE.md`, section 9) :
  - **Le Repos** (fermer) : choix **définitif**, la sauvegarde est écrasée, aucun retour possible ;
  - **Le Réveil** (traverser sans avoir les 8 souvenirs) : il se réveille sans se souvenir de la plongée ;
  - **Le Départ** (traverser avec les 8 souvenirs) : il se réveille en sachant ce qui est arrivé à Yann.
- **Aucune sauvegarde d'avant le choix** : pour voir une autre fin, il faut recommencer une partie. L'écran-titre change selon la fin vue.

### Phase 8 : polish
- Ambiance sonore (bulles, sonar, grincements de coque, vent et mouettes au port) et musique mélancolique.
- Menu principal, menu pause, réglages (volume, intensité de la pixelisation).
- Optimisation (objectif 60 FPS) et déploiement sur GitHub Pages.

## Consignes générales
- Commence par la **Phase 1** uniquement.
- Ne révèle jamais le secret du lore trop tôt dans les textes du jeu : tout passe par les sous-entendus, les objets et les fragments de mémoire (voir `docs/LORE.md`).
- Privilégie le *game feel* : mouvements fluides, retours visuels satisfaisants, ambiance.
- Pas d'assets payants ; formes générées en code ou assets CC0 uniquement.
- Si un choix technique n'est pas clair, prends la solution la plus simple et explique-la dans ton résumé.
