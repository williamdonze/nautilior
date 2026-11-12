# Projet : Nautiliar

Tu vas développer **Nautiliar**, un jeu web 3D d'exploration sous-marine narratif, dans ce repo.

## Concept
Le joueur pilote un vieux sous-marin, explore les fonds marins et récupère des objets avec la **pince** du sous-marin. Certains objets sont très rares. Il remonte au **port** pour vendre son loot et améliorer son sous-marin afin de descendre toujours plus profond.
Boucle de jeu : Port (vendre / améliorer / parler aux PNJ) → Plongée (explorer / attraper) → Remontée (avant d'être à court d'oxygène) → Port.

## Lore (à respecter dans tous les textes, noms d'objets et dialogues)
Crée un fichier `docs/LORE.md` qui reprend cette section : c'est la référence narrative du projet.

**Cadre** : Bretagne, 1984. **Port-Kerys** (de *Ker-Ys*, en référence à la cité engloutie d'Ys), un village de pêcheurs brumeux, rustique et presque désert. Maisons fermées, bateaux qui pourrissent, granit et rouille. Le sous-marin du joueur, le **Nautiliar**, est vieux et rouillé.

**Début** : le joueur se réveille d'un « coma » à l'hôpital du village, sans aucun souvenir. Il ne reste que trois habitants :
- **Le médecin** : l'a soigné, mystérieux, l'observe bizarrement.
- **Le vieux mécano** : bourru, lui confie le Nautiliar et gère les améliorations.
- **La marchande** : rachète le loot sans poser de questions.
Quand on leur demande ce qui s'est passé, ils restent évasifs : « la mer a changé », « les autres sont partis ».

**La vérité (révélée progressivement, jamais dite directement au début)** :
- Le joueur n'est pas dans le vrai monde mais dans **l'Envers**, le monde des morts, reflet de Port-Kerys.
- Dans le vrai monde, il **s'est noyé** pendant une plongée. C'est un **noyé revenu** : il croit sortir du coma, mais il revient de la mort.
- Les trois villageois sont des **morts**. L'Envers se vide et s'éteint lentement.
- Au point le plus profond de l'océan se trouve **le portail**, une déchirure vers le monde des vivants. Il émet une énergie surnaturelle semblable à de la radioactivité, qui a transformé les poissons et animaux des abysses en **monstres**.
- **Le secret des villageois** : le noyé revenu est le seul lien vivant qui maintient l'Envers en existence. S'il traverse le portail, l'Envers disparaît, et eux avec. Ils veulent donc à tout prix qu'il le **ferme** pour qu'il reste à jamais. Ils **mentent** sur leurs raisons.

**Progression** : pour atteindre le portail, il faut la **coque abyssale**, l'amélioration la plus chère du jeu. C'est ce qui repousse la fin et justifie la boucle loot → vente → améliorations.

**Fragments de mémoire** : parmi les objets rares, des objets personnels du joueur venus du vrai monde (photo, alliance, plaque de plongée à son nom, carnet de bord…). Chacun débloque un court souvenir qui rapproche de la vérité.

**Comportement des villageois** :
- Au début : évasifs, mais bienveillants en apparence.
- Au fil des fragments : de plus en plus gênés, ils détournent les conversations.
- Une fois la coque abyssale achetée : ils deviennent insistants et supplient le joueur de fermer le portail, chacun avec une **fausse raison** :
  - Le médecin : « Ce qui remontera de l'autre côté, ce ne sera pas toi. »
  - Le mécano : « La mer souffre. Ferme-la, c'est tout. »
  - La marchande : « Ce qui est derrière nous tuera tous si tu la laisses ouverte. »

**Choix final, devant le portail** :
- **Fermer le portail** (il les écoute) : les radiations cessent, les monstres se calment. De retour au port, les villageois sont soulagés et souriants… trop souriants. Le joueur comprend qu'il ne pourra plus jamais partir. Dernière réplique du médecin : « Bienvenue chez toi. » Leur mensonge est révélé.
- **Traverser le portail** (il leur désobéit) : l'Envers s'effondre derrière lui, et une courte scène montre le village des morts qui se dissout. Le joueur émerge dans le vrai Port-Kerys, vivant et plein de monde. Les habitants n'en reviennent pas : il était porté disparu depuis des mois. Il est rentré chez lui.

**Ton** : intrigant, mélancolique, de plus en plus inquiétant avec la profondeur. Dialogues courts, évasifs, avec des sous-entendus. Aucun humour cartoon.

## Style visuel (très important)
3D low-poly avec un **rendu pixelisé** façon rétro / PS1 :
- Rendu en basse résolution puis upscale sans lissage (`RenderPixelatedPass` de Three.js ou render target basse résolution avec `NearestFilter`). La résolution doit être réglable dans une constante.
- Modèles low-poly en flat shading (formes primitives Three.js au début, pas d'assets externes obligatoires).
- Palette limitée et désaturée (bleus, verts d'eau, rouille, gris granit) avec un léger dithering en post-processing.
- Brouillard sous-marin (`scene.fog`) qui s'assombrit avec la profondeur.
- Particules de « neige marine ».
- Un phare (SpotLight) à l'avant du sous-marin, principale source de lumière en profondeur.
- Plus on approche du portail, plus la lueur est verdâtre et surnaturelle (légère distorsion, particules lumineuses).
- En surface : port brumeux, ciel gris, lumière froide.

## Stack technique
- **Vite** + **JavaScript** (modules ES), pas de framework UI
- **Three.js** (+ addons `three/examples/jsm` pour le post-processing)
- **Rapier** (`@dimforge/rapier3d-compat`) pour la physique si nécessaire
- HUD et dialogues en HTML/CSS par-dessus le canvas, avec une police pixel (par exemple « Press Start 2P » ou « VT323 »)
- Sauvegarde dans `localStorage`

## Architecture
```
src/
├── main.js
├── core/        # boucle de jeu, renderer, post-processing pixel, inputs
├── submarine/   # contrôles, physique, caméra, jauges
├── claw/        # pince : visée, extension, prise, retour
├── world/       # sol marin, décor, zones de profondeur, spawn des objets
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
- Une quinzaine d'objets cohérents avec la Bretagne des années 80 et le lore (filets, casiers, vaisselle de naufrage, médailles, objets de la cité d'Ys…), avec nom, description courte et intrigante, rareté, poids, prix et profondeur minimale.
- Table de loot pondérée par la profondeur.
- Les objets rares brillent et ont un effet spécial à la capture.
- Une soute limitée et un inventaire (touche I / Tab).

### Phase 4 : survie
- Une jauge d'oxygène qui se recharge en surface.
- Une profondeur maximale liée à la coque (au-delà, la coque s'abîme).
- Les zones proches du portail exposent à une « radiation » qui use la coque plus vite.
- Si l'oxygène tombe à zéro : retour à l'hôpital du village et perte d'une partie de la soute (écran noir, réveil : « Encore toi… »).

### Phase 5 : le port et les PNJ
- La scène du port à la surface : quai, hôpital, atelier du mécano, boutique de la marchande, maisons fermées. Le joueur s'y déplace à pied (vue à la troisième personne) ou par un menu simple.
- Un système de dialogue : boîte de texte, texte qui s'affiche progressivement, choix de réponses simples. Dialogues en JSON, qui dépendent de l'état narratif.
- La marchande : vente du loot, prix qui varient légèrement.
- Le mécano : améliorations d'oxygène, de coque, de pince, de soute et de phare, avec des coûts croissants. La **coque abyssale** est la dernière, extrêmement chère.
- Un musée / collection des objets rares découverts.
- Sauvegarde automatique.

### Phase 6 : monde, créatures et fragments de mémoire
- 4 zones : Récif (0 à 150 m), Épaves (150 à 500 m), Canyon (500 à 1000 m), Abysses (plus de 1000 m), où se trouve le portail.
- Des créatures : poissons normaux près de la surface, créatures mutées et dangereuses en profondeur (formes déformées, yeux lumineux) qui endommagent la coque.
- 6 à 8 **fragments de mémoire** répartis par profondeur. Chacun affiche un court souvenir (texte + image pixel ou plan fixe) et fait évoluer les dialogues des villageois.

### Phase 7 : la fin
- Une fois la coque abyssale achetée, les dialogues changent : les trois villageois supplient le joueur de fermer le portail, avec leurs fausses raisons.
- Le portail dans les abysses : structure surnaturelle, lueur verte, distorsion.
- Le choix final « Fermer » / « Traverser », avec les deux fins décrites dans le lore (courtes cinématiques en jeu + texte, puis écran de fin).
- Après la fin, possibilité de recharger la sauvegarde d'avant le choix pour voir l'autre fin.

### Phase 8 : polish
- Ambiance sonore (bulles, sonar, grincements de coque, vent et mouettes au port) et musique mélancolique.
- Menu principal, menu pause, réglages (volume, intensité de la pixelisation).
- Optimisation (objectif 60 FPS) et déploiement sur GitHub Pages.

## Consignes générales
- Commence par la **Phase 1** uniquement.
- Ne révèle jamais le secret du lore trop tôt dans les textes du jeu : tout passe par les sous-entendus, puis par les fragments de mémoire.
- Privilégie le *game feel* : mouvements fluides, retours visuels satisfaisants, ambiance.
- Pas d'assets payants ; formes générées en code ou assets CC0 uniquement.
- Si un choix technique n'est pas clair, prends la solution la plus simple et explique-la dans ton résumé.
