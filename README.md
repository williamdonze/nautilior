# Nautiliar

Jeu web 3D d'exploration sous-marine narratif. Bretagne, 1984 : à bord d'un vieux sous-marin rouillé, le **Nautiliar**, vous explorez les fonds au large de Port-Kerys.

Rendu 3D low-poly en flat shading, net et antialiasé (Three.js + Vite).

## Commandes

```bash
npm install       # installe les dépendances
npm run dev       # serveur de développement (http://localhost:5173)
npm run build     # build de production dans dist/
npm run preview   # sert le build de production
```

## Jouer en ligne

Le jeu est publié sur GitHub Pages à chaque push sur `main` (workflow `.github/workflows/deploy.yml`).
Prérequis, une seule fois : dans le dépôt, **Settings → Pages → Source : GitHub Actions**.
L'adresse sera alors `https://<utilisateur>.github.io/<dépôt>/`.

## Contrôles

| Action | AZERTY | QWERTY |
| --- | --- | --- |
| Avancer / reculer | Z / S | W / S |
| Tourner | Q / D | A / D |
| Monter | Espace | Espace |
| Descendre | Maj | Shift |
| Regarder (vue cockpit) | Souris (capturée au premier clic) | Souris (capturée au premier clic) |
| Pince | Clic gauche (vise au centre en cockpit, sous le curseur en vue extérieure) | idem |
| Vue cockpit / vue extérieure | V | V |
| Zoom (vue extérieure) | Molette | Molette |
| Soute (inventaire) | I ou Tab | I ou Tab |
| Au port : marcher | ZQSD | WASD |
| Parler / interagir / rentrer au port (en surface) | E | E |
| Dialogue : avancer / choisir | E, Espace, clic / 1-4 | E, Espace, clic / 1-4 |
| Pause (libère la souris) | Échap ou P | Échap ou P |

Les flèches du clavier fonctionnent aussi. Les touches sont lues par position physique (`event.code`) : AZERTY et QWERTY marchent sans réglage.

## Réglages rapides

- `src/config/settings.js` : champ de vision, physique du sous-marin, caméra, relief, densité du décor.
- `src/config/flora.json` : flore marine (laminaires, herbiers, fucus, gorgones, éponges : nombre, profondeurs, tailles, couleurs, réaction au passage du sous-marin).
- `src/config/depthAmbience.json` : couleur et densité du brouillard, lumière selon la profondeur.
- `CLAW` dans `settings.js` : portée, vitesses du bras, effet du poids.
- `src/loot/items.json` : objets (nom, description, rareté, poids, prix, profondeur minimale, forme 3D).
- `src/loot/rarities.json` : les 5 raretés (couleur, lueur, halo, colonne de lumière).
- `src/loot/lootTable.json` : chances de chaque rareté selon la profondeur.
- `HOLD.CAPACITY` dans `settings.js` : nombre d'emplacements de la soute.
- `SURVIVAL` et `RADIATION` dans `settings.js` : réserve d'oxygène, profondeur max de la coque, dégâts, zone de radiation.
- `src/story/wakeup.json` : textes du réveil à l'hôpital.
- `src/story/dialogues.json` : dialogues des villageois (conditions selon l'état narratif).
- `src/config/upgrades.json` : améliorations du mécano (niveaux, coûts, effets), dont la coque abyssale.
- `src/port/layout.json` : disposition du port (bâtiments, personnages, points d'interaction).
- `src/config/zones.json` : les 4 zones (profondeurs, objets, poissons et créatures par zone).
- `src/config/creatures.json` : vitesse, agressivité et dégâts des créatures mutées.
- `src/story/fragments.json` : les 7 fragments de mémoire (position, texte du souvenir, image).
- `SEABED` dans `settings.js` : profil du fond (profondeur le long du parcours, canyon).
- `src/story/endings.json` : textes des deux fins.

## Sauvegarde et réglages

Sauvegarde automatique dans le `localStorage` (retour au port, ventes, achats, dialogues, réveil).
« Nouvelle partie » depuis l'écran titre efface la partie en cours.
Les réglages (volumes, qualité graphique, compteur d'images/s) sont dans le menu Réglages
(écran titre ou pause) et conservés à part.

Juste avant le choix final, une sauvegarde à part est créée : depuis l'écran de fin,
« Revenir devant le portail » permet de voir l'autre fin.

## Sous l'eau

- **Visibilité réduite** : l'eau est trouble, les objets ne brillent pas. Le **phare** (qui suit le regard)
  et le **sonar** (écran rond en bas à droite) servent à les trouver : objets (points dorés),
  souvenirs (anneau blanc), créatures (triangle rouge), bancs de poissons, épaves.
  Sa portée augmente avec l'amélioration « Phare et sonar ».
- **Flore** : 14 espèces (laminaires, herbiers, laitue de mer, spaghetti de mer, algues rouges,
  fucus, anémones, oursins, gorgones, plumes de mer, coraux froids, éponges de verre, vers tubicoles…).
  Le sous-marin couche les plantes qu'il traverse (champ de déplacement simulé par des ressorts),
  qui se redressent ensuite en se balançant.
- **Décor** : barils, caisses, pneus, chaînes, planches, coquillages, moulières, deux 2CV englouties,
  et les ruines d'Ys (colonnes, arches, escaliers, têtes de pierre) dans le canyon et les abysses.
- **Faune irradiée** : même les poissons du récif sont difformes (yeux en trop, bosses, double queue,
  pustules lumineuses) ; dans le canyon et les abysses nagent des poissons-squelettes.
- **Sept sous-marins** : le modèle change à chaque amélioration de coque, du vieux cigare rouillé
  au sous-marin abyssal anguleux à quatre rotors verticaux. Chacun a son poste de pilotage en 3D
  (hublot, cadrans à aiguilles reliés au jeu, manette des gaz, écrans sur les modèles récents).

## Le village

Port-Kerys compte une vingtaine de bâtiments : maisons de granit ou chaulées, toits d'ardoise,
lucarnes, cheminées de pignon, volets colorés, enseignes (hôpital, épicerie, criée, Bar des Marins,
mécanique marine), chapelle et calvaire, phare éteint sur sa jetée, fontaine, cabine téléphonique,
4L abandonnée, murets de pierres sèches, casiers, filets qui sèchent, linge, goélands.

## Le monde

| Zone | Profondeur | On y trouve |
| --- | --- | --- |
| Le Récif | 0 – 150 m | algues, bancs de poissons, objets communs |
| Les Épaves | 150 – 500 m | chalutiers naufragés, anguilles mutées |
| Le Canyon | 500 – 1000 m | parois, aiguilles rocheuses, squelette de baleine, poissons-lanternes |
| Les Abysses | > 1000 m | tiges luminescentes, méduses irradiées, le portail |

## Structure

```
src/
├── main.js        # point d'entrée : renderer, entrées, son, HUD, boucle
├── config/        # réglages et données (JSON)
├── core/          # jeu (modes, pause), rendu, entrées (souris capturée), sons, ambiance, musique
├── submarine/     # 7 modèles, pilotage avec inertie, phare, caméras (cockpit / extérieure), survie
├── world/         # plongée : fond par zones, flore, faune, épaves, créatures, portail, objets, ambiance
├── claw/          # pince : visée (raycast), IK du bras, machine à états, modèle
├── loot/          # objets, raretés, table de loot (JSON), modèles 3D, lueurs, effets de capture, soute
├── ui/            # HUD, sonar, menus, inventaire, dialogues, panneaux, souvenirs, vignettes
├── port/          # port : décor, joueur à pied, personnages, prix de la marchande
├── story/         # état narratif, dialogues, fragments de mémoire, réveil, fins (JSON + scripts)
├── save/          # état de la partie, sauvegarde et réglages (localStorage)
docs/
└── LORE.md        # référence narrative
```

## Son

Tout le son est synthétisé en direct (Web Audio API), sans fichier audio :
musique générative (nappes d'accords et notes pincées, humeur selon le lieu),
ambiance (grondement, bulles, sonar, chants lointains ; vent, ressac, mouettes, cloche au port)
et effets (pince, coque, alarmes, créatures, souvenirs).

## Avancement

- [x] Phase 1 : bases (rendu pixelisé, fond marin, sous-marin pilotable, caméra, HUD profondeur)
- [x] Phase 2 : la pince
- [x] Phase 3 : loot et raretés
- [x] Phase 4 : survie
- [x] Phase 5 : le port et les PNJ
- [x] Phase 6 : monde, créatures et fragments de mémoire
- [x] Phase 7 : la fin
- [x] Phase 8 : polish (son, musique, menus, réglages, optimisation, déploiement)
