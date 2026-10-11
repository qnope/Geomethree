import { LANES, parseMap, type Level } from './level';

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


/** Escalier de blocs (hauteurs 1, 2, 3) sur toute la largeur, puis redescente : on monte en sautant. */
const stairs = seg([
  '..1.2.3.3.2.1.......',
  '..1.2.3.3.2.1.......',
  '..1.2.3.3.2.1.......',
  '..1.2.3.3.2.1.......',
  '..1.2.3.3.2.1.......',
]);

// Slalom serré : murs rapprochés (une demi-seconde d'écart) avec des pics dans les passages.
const tightSlalom = (gaps: number[]): Segment =>
  join(...gaps.map((gap) => walls(8, [{ col: 3, gap }])));

export interface LevelDef { name: string; level: Level }

const L1 = parseMap(
  join(
    empty(16),
    put(14, [{ lane: 2, col: 5, c: '^' }]), // premier pic : on saute ou on contourne
    put(14, [1, 2, 3].map((lane) => ({ lane, col: 5, c: '^' }))), // trois pics : saut ou contournement
    walls(16, [{ col: 5, gap: 3 }]), // premier mur : il faut pencher à droite
    walls(16, [{ col: 5, gap: 0 }]), // puis traverser jusqu'à gauche
  ),
);

const L2 = parseMap(
  join(
    empty(14),
    walls(28, [{ col: 4, gap: 2 }, { col: 12, gap: 0 }, { col: 20, gap: 3 }]), // slalom
    platform, // monter sur le plateau
    put(14, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 5, c: '^' }))), // ligne de pics : saut obligatoire
    tightSlalom([2, 0, 3]),
    stairs,
  ),
);

// Le niveau du prototype : tout y est.
const L3 = parseMap(
  join(
    empty(16),
    put(14, [{ lane: 2, col: 5, c: '^' }]),
    put(14, [1, 2, 3].map((lane) => ({ lane, col: 5, c: '^' }))),
    walls(16, [{ col: 5, gap: 3 }]),
    walls(16, [{ col: 5, gap: 0 }]),
    walls(28, [{ col: 4, gap: 2 }, { col: 12, gap: 0 }, { col: 20, gap: 3 }]),
    platform,
    put(14, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 5, c: '^' }))),
    tunnel,
    walls(28, [{ col: 6, gap: 0 }, { col: 14, gap: 3 }, { col: 22, gap: 1 }]),
  ),
);

const L4 = parseMap(
  join(
    empty(14),
    stairs,
    tightSlalom([1, 3, 0, 2]),
    platform,
    tunnel,
    put(14, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 5, c: '^' }))),
    stairs,
    walls(28, [{ col: 4, gap: 3 }, { col: 12, gap: 0 }, { col: 20, gap: 2 }]),
    tightSlalom([1, 3, 0, 2]),
    platform,
  ),
);

const L5 = parseMap(
  join(
    empty(14),
    tightSlalom([0, 2, 3, 1, 3, 0]),
    stairs,
    tunnel,
    platform,
    tightSlalom([3, 1, 0, 2, 0, 3]),
    put(14, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 5, c: '^' }))),
    tunnel,
    stairs,
    tightSlalom([2, 0, 3, 1]),
    platform,
    walls(28, [{ col: 6, gap: 0 }, { col: 14, gap: 3 }, { col: 22, gap: 1 }]),
  ),
);

export const LEVELS: readonly LevelDef[] = [
  { name: 'Échauffement', level: L1 },
  { name: 'Slalom', level: L2 },
  { name: 'Prototype', level: L3 },
  { name: 'Escalade', level: L4 },
  { name: 'Marathon', level: L5 },
];

export const LEVEL_1 = L1;
