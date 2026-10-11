# Geomethree (prototype)

Vite + TypeScript + Three.js + Vitest.

- `npm i && npm run dev` : jeu en local
- `npm test` : tests (logique, collisions, mesure perf, niveau 1 prouvé faisable par le solveur)
- `npm run build:single` : un seul fichier HTML (Three.js depuis le CDN), utilisé pour l'Artifact

Logique pure et testée dans `src/game/` (pas fixe 240 Hz, zéro allocation par pas),
rendu dans `src/render/scene.ts` (InstancedMesh, 12 à 13 draw calls avec le décor).

## Contrôles

- **Téléphone** : incline à gauche / à droite pour changer de couloir (piste de 5 couloirs), touche l'écran pour sauter. Sur iOS, la permission du capteur est demandée au premier toucher.
- **Sans capteur** (ordinateur, capteur refusé) : flèches ← → (ou Q/D), Espace pour sauter ; sur écran tactile, deux boutons ◀ ▶ apparaissent.
- Le capteur d'inclinaison exige une page servie en HTTPS qui n'est pas dans une iframe restreinte.

## Niveaux

`src/game/levels.ts` : cartes vues de dessus, 5 lignes = 5 couloirs (haut = gauche). `^` pic, `#` bloc, `1`…`9` pile de blocs, `.` vide. Un test (`solver.test.ts`) prouve que chaque niveau est faisable.

## Décors (thèmes)

Le décor est indépendant du niveau : `src/render/themes.ts` décrit 5 décors (Néon, Forêt, Dunes, Glacier, Volcan)
uniquement par des couleurs et des paramètres de génération, sans aucune texture. Chaque niveau choisit le sien
dans `levels.ts` (`theme: 'glacier'`) : plusieurs niveaux peuvent partager un décor, et en changer tient en un mot.

- Aperçu : `?theme=volcan` dans l'URL, ou le sélecteur « Décor » du menu, impose un décor à tous les niveaux.
- Rendu (`src/render/decor.ts`) : ciel, astre et montagnes en un seul maillage opaque dessiné en dernier
  (il ne remplit que les pixels restés vides), sol uni recalé sous la caméra, objets du bord de piste instanciés
  sur une tuile de 120 u qui se répète, particules animées entièrement par le GPU. Au plus 5 draw calls,
  10 000 triangles et 1 200 points par décor, rien d'alloué par frame : des tests le vérifient.
