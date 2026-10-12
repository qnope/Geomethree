# Geomethree (prototype)

Vite + TypeScript + Three.js + Vitest.

- `npm i && npm run dev` : jeu en local
- `npm test` : tests (logique, collisions, mesure perf, niveau 1 prouvé faisable par le solveur)
- `npm run build:single` : un seul fichier HTML (Three.js depuis le CDN), utilisé pour l'Artifact

Logique pure et testée dans `src/game/` (pas fixe 240 Hz, zéro allocation par pas),
rendu dans `src/render/scene.ts` (InstancedMesh, 12 à 19 draw calls avec le décor selon les types d'obstacles du niveau).

## Contrôles

- **Téléphone** : incline à gauche / à droite pour changer de couloir (piste de 5 couloirs), touche l'écran pour sauter. Sur iOS, la permission du capteur est demandée au premier toucher.
- **Sans capteur** (ordinateur, capteur refusé) : flèches ← → (ou Q/D), Espace pour sauter ; sur écran tactile, deux boutons ◀ ▶ apparaissent.
- **Pause** : bouton en haut à droite (ou Échap / P). La partie, l'ambiance et le rendu se figent : plus aucune image
  n'est calculée. L'écran de pause propose Reprendre, Recommencer et Niveaux. Le jeu se met aussi en pause quand
  l'appli passe en arrière-plan.
- Le capteur d'inclinaison exige une page servie en HTTPS qui n'est pas dans une iframe restreinte.

## Niveaux

`src/game/levels.ts` : cartes vues de dessus, 5 lignes = 5 couloirs (haut = gauche), `.` vide. Un test (`levels.test.ts`) prouve
avec le solveur que chaque niveau est faisable, y compris en ne décidant que toutes les 0,15 s.

Les types d'obstacles arrivent peu à peu : pyramides, murs et fosses au niveau 1, puis portes sous poutre et rampes (2),
tremplins (3), escaliers (4) et mobiles (5) ; les niveaux 6 à 10 les mêlent tous.

## Obstacles

Un niveau ne nomme que des types d'obstacles. Chaque type a la même forme de collision partout, et chaque décor
le dessine à sa façon : un même niveau se joue à l'identique dans n'importe quel décor, avec une autre saveur.

| Carte | Type | Collision | Néon | Forêt | Dunes | Glacier | Volcan |
|---|---|---|---|---|---|---|---|
| `M` | mur | bloc de 3 de haut, plus haut que le saut | cube | tronc | grès en strates | colonne de glace | orgue basaltique |
| `=` | rampe | bloc de 2 de haut, on roule dessus | cube | planches | terre cuite | bloc bleu | dalle de lave |
| `#`, `1`…`9` | escalier | marche de 1 (ou du chiffre) de haut | cubes empilés | pierres moussues | calcaire | blocs de glace | lave refroidie |
| `^` | pyramide | pic mortel de 1 de haut | pyramide | ronces | obsidienne | cristal | cristal |
| `_` | fosse | mortelle quand le centre du cube y passe au sol : on la saute ou on la contourne | trou bordé de cyan | mare | sables mouvants | crevasse | bassin de lave |
| `T` | poutre | bloc suspendu de 1,5 à 3 : on passe dessous, un saut s'y cogne, trop haute pour atterrir dessus | barre laser | branche couchée | tronc de palmier | pont de glace | arche de basalte |
| `*` | tremplin | propulse à 5 de haut le cube qui y passe au sol : de quoi passer un mur | rampe jaune | champignon | rampe turquoise | rampe d'aurore | fumerolle |
| `o`, `~` | mobile | pic qui va et vient sur son rail `~` (même colonne) à 2,5 couloirs/s ; `o` : sa case quand le cube arrive | scie | rondin | virevoltant | flocon tranchant | bombe de lave |

- Fosses voisines fondues en une seule : seul leur contour est tracé. Le rail d'un mobile est tracé sur la piste.
- Mobile : sa position ne dépend que de celle du cube (`moverZ` dans `src/game/game.ts`), qui avance à vitesse
  constante. La partie reste déterministe, le solveur la prouve et le rendu montre exactement ce que la simulation teste.
- Rendu (`src/render/obstacles.ts`) : chaque forme est dessinée dans une case unité puis étirée à la taille de
  l'obstacle, sans jamais déborder de sa collision (un test le vérifie pour chaque décor, mobiles compris à plusieurs
  instants). Un maillage instancié par type présent dans le niveau et une seule géométrie pour toutes les arêtes :
  au plus 9 draw calls. Les mobiles roulent sur eux-mêmes : leurs matrices sont recalculées à chaque frame sans allocation.
- Ajouter un type : son nom dans `OBSTACLE_TYPES` et son caractère dans `CELLS` (`src/game/level.ts`), puis son
  habillage dans chaque décor (`obstacles` dans `src/render/themes.ts`) ; les tests signalent un décor oublié.
- Ajouter une forme : une entrée dans `OBSTACLE_SHAPES` (`themes.ts`) et sa construction dans `SHAPES` (`obstacles.ts`).

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
