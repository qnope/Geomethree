# Geomethree (prototype)

Vite + TypeScript + Three.js + Vitest.

- `npm i && npm run dev` : jeu en local
- `npm test` : tests (logique, collisions, mesure perf, niveau 1 prouvé faisable par le solveur)
- `npm run build:single` : un seul fichier HTML (Three.js depuis le CDN), utilisé pour l'Artifact

Logique pure et testée dans `src/game/` (pas fixe 240 Hz, zéro allocation par pas),
rendu dans `src/render/scene.ts` (InstancedMesh, 6 draw calls).
