# Geomethree (prototype)

Vite + TypeScript + Three.js + Vitest.

- `npm i && npm run dev` : jeu en local
- `npm test` : tests (logique, collisions, mesure perf, niveau 1 prouvé faisable par le solveur)
- `npm run build:single` : un seul fichier HTML (Three.js depuis le CDN), utilisé pour l'Artifact

Logique pure et testée dans `src/game/` (pas fixe 240 Hz, zéro allocation par pas),
rendu dans `src/render/scene.ts` (InstancedMesh, 11 draw calls).

## Contrôles

- **Téléphone** : incline à gauche / à droite pour changer de couloir (piste de 5 couloirs), touche l'écran pour sauter. Sur iOS, la permission du capteur est demandée au premier toucher.
- **Sans capteur** (ordinateur, capteur refusé) : flèches ← → (ou Q/D), Espace pour sauter ; sur écran tactile, deux boutons ◀ ▶ apparaissent.
- Le capteur d'inclinaison exige une page servie en HTTPS qui n'est pas dans une iframe restreinte.

## Niveaux

`src/game/levels.ts` : cartes vues de dessus, 5 lignes = 5 couloirs (haut = gauche). `^` pic, `#` bloc, `1`…`9` pile de blocs, `.` vide. Un test (`solver.test.ts`) prouve que chaque niveau est faisable.

