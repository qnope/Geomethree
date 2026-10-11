import { LANES, parseMap, type Level } from './level';
import type { ThemeId } from '../render/themes';

type Segment = string[]; // 5 lignes de même largeur : couloir gauche → droit, colonnes vers l'avant

const seg = (rows: Segment): Segment => {
  if (rows.length !== LANES || rows.some((r) => r.length !== rows[0].length)) {
    throw new Error('segment mal formé');
  }
  return rows;
};

/** Segment vide. */
const empty = (width: number): Segment => seg(Array.from({ length: LANES }, () => '.'.repeat(width)));

/** Segment d'obstacles posés en (couloir, colonne). */
const put = (width: number, items: { lane: number; col: number; c: string }[]): Segment => {
  const rows = Array.from({ length: LANES }, () => Array.from({ length: width }, () => '.'));
  for (const { lane, col, c } of items) rows[lane][col] = c;
  return seg(rows.map((r) => r.join('')));
};

/**
 * Murs de hauteur 3 sur toute la largeur sauf un passage de 2 couloirs (`gap` = couloir de gauche
 * du passage). Impossible à sauter (le saut monte à 2,5) et assez large pour viser (cube de 1).
 */
const walls = (width: number, list: { col: number; gap: number }[]): Segment =>
  put(width, list.flatMap(({ col, gap }) =>
    Array.from({ length: LANES }, (_, lane) => lane)
      .filter((l) => l !== gap && l !== gap + 1)
      .map((lane) => ({ lane, col, c: '3' }))));

const join = (...segs: Segment[]): string[] =>
  Array.from({ length: LANES }, (_, lane) => segs.map((s) => s[lane]).join(''));

// Plateau de 2 de haut au centre, flanqué de pics.
const platform = seg([
  '....................',
  '......^..^..........',
  '....22222222........',
  '......^..^..........',
  '....................',
]);

// Couloir de 2 de large (couloirs 3 et 4), murs hauts de chaque côté, pics à franchir.
const tunnel = seg([
  '....3333333333333333....',
  '....3333333333333333....',
  '..........^.............',
  '..............^.........',
  '....3333333333333333....',
]);


/** Escalier de blocs (hauteurs 1, 2, 3) sur toute la largeur : on monte en sautant, puis on redescend. */
const stairs = seg(Array.from({ length: LANES }, () => '1.2.3.3.2.1'));

/** Ligne de pics sur toute la largeur : saut obligatoire. */
const spikeLine = put(1, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 0, c: '^' })));
const spike = put(1, [{ lane: 2, col: 0, c: '^' }]);
const spikes3 = put(1, [1, 2, 3].map((lane) => ({ lane, col: 0, c: '^' })));
const wall = (gap: number): Segment => walls(1, [{ col: 0, gap }]);

/** Retire les colonnes vides en tête et en queue d'un segment. */
const trim = (s: Segment): Segment => {
  const empty = (x: number) => s.every((r) => r[x] === '.');
  let a = 0, b = s[0].length;
  while (a < b && empty(a)) a++;
  while (b > a && empty(b - 1)) b--;
  return s.map((r) => r.slice(a, b));
};

/** Enchaîne les défis en laissant exactement `gap` colonnes libres entre deux (donc gap / vitesse secondes). */
const sequence = (gap: number, ...list: Segment[]): Level =>
  parseMap(join(empty(14), ...list.flatMap((c) => [empty(gap), trim(c)]), empty(14)));

/** `theme` : décor du niveau (cf. render/themes.ts), interchangeable sans toucher aux obstacles. */
export interface LevelDef { name: string; theme: ThemeId; level: Level }

// Le temps libre entre deux défis est le « temps de réaction » : 10 s au niveau 1, 2,5 s au dernier
// (cf. reaction.ts). À 7 u/s : 70, 57, 44, 31 et 18 colonnes (arrondies au-dessus de la cible).
export const LEVELS: readonly LevelDef[] = [
  { name: 'Échauffement', theme: 'neon', level: sequence(70, spike, spikes3, wall(3), wall(0), spikeLine) },
  { name: 'Slalom', theme: 'foret', level: sequence(57, wall(2), wall(0), platform, spikeLine, wall(3), spikes3) },
  { name: 'Prototype', theme: 'dunes', level: sequence(44, spike, wall(3), wall(0), wall(2), platform, spikeLine, tunnel, wall(1)) },
  {
    name: 'Escalade',
    theme: 'glacier',
    level: sequence(31, stairs, wall(1), wall(3), platform, tunnel, spikeLine, stairs, wall(0), wall(2), tunnel),
  },
  {
    name: 'Marathon',
    theme: 'volcan',
    level: sequence(
      18, wall(0), wall(3), wall(1), stairs, tunnel, platform, wall(3), wall(0), spikeLine, stairs,
      wall(2), tunnel, platform, wall(0), wall(3), stairs, spikeLine, wall(1), tunnel, wall(2),
    ),
  },
];

export const LEVEL_1 = LEVELS[0].level;
