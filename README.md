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

## Icône

Une seule source, `icons/icon.svg` (le cube sur la piste du décor Néon), d'où `npm run icons` génère dans `public/` :
le favicon (`favicon.svg` aux coins arrondis, et `favicon-32.png` pour les navigateurs sans SVG),
l'icône d'écran d'accueil iOS (`apple-touch-icon.png`, 180 px, opaque) et les icônes Android / PWA du `manifest.webmanifest`
(192 et 512 px, plus une 512 « maskable » pour les icônes adaptatives : le cube tient dans le cercle central de rayon 205).
Le rendu passe par Chromium : Chrome installé, ou `CHROME_PATH=/chemin/vers/chrome npm run icons`.
Un test (`icons.test.ts`) vérifie les liens de `index.html`, le manifest, les tailles et le poids des icônes.

## Son

Une ambiance par décor, générée par le code (`src/audio/`) : aucun fichier audio. Coût : 2 Ko gzip dans le bundle
principal et un worker de 5 Ko chargé à part.

- `soundscapes.ts` décrit chaque ambiance par des notes et des paramètres (tempo, gamme, grille d'accords, instruments) :
  synthwave pour Néon, harpe et oiseaux pour Forêt, oud et vent du désert pour Dunes, cloches de verre pour Glacier,
  bourdon, grondement et braises pour Volcan.
- `synth.ts` en fait une boucle stéréo de 16 à 19 s (22 050 Hz) et trois effets accordés au décor (saut, choc, victoire).
  Le rendu tourne dans un worker (`render.worker.ts`) : rien ne passe sur la boucle de jeu. Des tests vérifient que
  chaque boucle se recolle sans clic, ne sature pas, a le même volume perçu que les autres et ne s'interrompt jamais.
- `sound.ts` joue le tout avec la Web Audio API : rien n'est créé avant le premier toucher (exigence d'iOS), fondu
  enchaîné au changement de décor, au plus 2 décors gardés en mémoire (≈ 3 Mo chacun).
- Menu **Réglages** (depuis le menu des niveaux) : ambiance sonore et effets sonores se désactivent séparément,
  choix mémorisé. Ambiance coupée, sa boucle n'est même pas calculée ; tout coupé, le contexte audio est suspendu
  (plus aucun calcul), comme quand l'onglet passe en arrière-plan. Sur iPhone, le bouton silencieux coupe aussi le son du jeu.
