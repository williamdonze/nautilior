# Nautiliar

Jeu web 3D d'exploration sous-marine narratif. Bretagne, 1984 : à bord d'un vieux sous-marin rouillé, le **Nautiliar**, vous explorez les fonds au large de Port-Kerys.

Rendu low-poly pixelisé façon rétro / PS1 (Three.js + Vite).

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
| Viser / pince | Souris + clic gauche | Souris + clic gauche |
| Zoom caméra | Molette | Molette |
| Soute (inventaire) | I ou Tab | I ou Tab |
| Au port : marcher | ZQSD | WASD |
| Parler / interagir / rentrer au port (en surface) | E | E |
| Dialogue : avancer / choisir | E, Espace, clic / 1-4 | E, Espace, clic / 1-4 |
| Pause | Échap ou P | Échap ou P |

Les flèches du clavier fonctionnent aussi. Les touches sont lues par position physique (`event.code`) : AZERTY et QWERTY marchent sans réglage.

## Réglages rapides

- `src/config/settings.js` : résolution de la pixelisation (`RENDER.PIXEL_HEIGHT`), dithering, physique du sous-marin, caméra, relief, densité du décor.
- `src/config/palette.json` : palette de couleurs limitée appliquée en post-processing.
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
Les réglages (volumes, pixelisation, tramage, compteur d'images/s) sont dans le menu Réglages
(écran titre ou pause) et conservés à part.

Juste avant le choix final, une sauvegarde à part est créée : depuis l'écran de fin,
« Revenir devant le portail » permet de voir l'autre fin.

En console : `nautiliar.pixel.setPixelHeight(180)` change la pixelisation à chaud.

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
├── core/          # jeu (modes, pause), renderer pixelisé, shader, entrées, sons, ambiance, musique
├── submarine/     # modèle, pilotage avec inertie, phare, caméra, bulles, survie (oxygène, coque)
├── world/         # plongée : fond par zones, épaves, canyon, créatures, portail, objets, ambiance, radiation
├── claw/          # pince : visée (raycast), IK du bras, machine à états, modèle
├── loot/          # objets, raretés, table de loot (JSON), modèles 3D, lueurs, effets de capture, soute
├── ui/            # HUD, menus, inventaire, dialogues, panneaux, souvenirs (images pixel), vignettes
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
