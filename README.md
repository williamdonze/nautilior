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

## Sauvegarde

Sauvegarde automatique dans le `localStorage` (retour au port, ventes, achats, dialogues, réveil).
Pour recommencer une partie : `nautiliar.game.newGame()` dans la console (un menu arrivera en phase 8).

En console : `nautiliar.pixel.setPixelHeight(180)` change la pixelisation à chaud.

## Structure

```
src/
├── main.js        # point d'entrée : renderer, entrées, son, HUD, boucle
├── config/        # réglages et données (JSON)
├── core/          # jeu (modes port/plongée), renderer pixelisé, shader, clavier, souris, sons, boucle
├── submarine/     # modèle, pilotage avec inertie, phare, caméra, bulles, survie (oxygène, coque)
├── world/         # plongée : fond marin, décor, objets, neige marine, ambiance, radiation
├── claw/          # pince : visée (raycast), IK du bras, machine à états, modèle
├── loot/          # objets, raretés, table de loot (JSON), modèles 3D, lueurs, effets de capture, soute
├── ui/            # HUD, inventaire, dialogues, panneaux du port, vignettes (HTML/CSS)
├── port/          # port : décor, joueur à pied, personnages, prix de la marchande
├── story/         # état narratif, dialogues, réveil (JSON)
├── save/          # état de la partie et sauvegarde localStorage
docs/
└── LORE.md        # référence narrative
```

## Avancement

- [x] Phase 1 : bases (rendu pixelisé, fond marin, sous-marin pilotable, caméra, HUD profondeur)
- [x] Phase 2 : la pince
- [x] Phase 3 : loot et raretés
- [x] Phase 4 : survie
- [x] Phase 5 : le port et les PNJ
- [ ] Phase 6 : monde, créatures et fragments de mémoire
- [ ] Phase 7 : la fin
- [ ] Phase 8 : polish
