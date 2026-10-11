import { LANES, parseMap, type Level } from './level';
import { CONFIG } from './game';
import { REACTION_CALM, REACTION_STRESS } from './reaction';
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
 * Murs (3 de haut) sur toute la largeur sauf un passage de 2 couloirs (`gap` = couloir de gauche
 * du passage). Impossible à sauter (le saut monte à 2,5) et assez large pour viser (cube de 1).
 */
const walls = (width: number, list: { col: number; gap: number }[]): Segment =>
  put(width, list.flatMap(({ col, gap }) =>
    Array.from({ length: LANES }, (_, lane) => lane)
      .filter((l) => l !== gap && l !== gap + 1)
      .map((lane) => ({ lane, col, c: 'M' }))));

const join = (...segs: Segment[]): string[] =>
  Array.from({ length: LANES }, (_, lane) => segs.map((s) => s[lane]).join(''));

// Rampe de 2 de haut au centre (on roule dessus), flanquée de pyramides.
const platform = seg([
  '....................',
  '......^..^..........',
  '....========........',
  '......^..^..........',
  '....................',
]);

// Couloir de 2 de large (couloirs 3 et 4), murs de chaque côté, pyramides à franchir.
const tunnel = seg([
  '....MMMMMMMMMMMMMMMM....',
  '....MMMMMMMMMMMMMMMM....',
  '..........^.............',
  '..............^.........',
  '....MMMMMMMMMMMMMMMM....',
]);


/** Escalier (marches de 1, 2, 3) sur toute la largeur : on monte en sautant, puis on redescend. */
const stairs = seg(Array.from({ length: LANES }, () => '1.2.3.3.2.1'));

/** Ligne de pyramides sur toute la largeur : saut obligatoire. */
const spikeLine = put(1, [0, 1, 2, 3, 4].map((lane) => ({ lane, col: 0, c: '^' })));
const spike = put(1, [{ lane: 2, col: 0, c: '^' }]);
const spikes3 = put(1, [1, 2, 3].map((lane) => ({ lane, col: 0, c: '^' })));
const wall = (gap: number): Segment => walls(1, [{ col: 0, gap }]);

/** Fosse sur toute la largeur, longue de `len` cases : on la saute (le saut couvre 5 cases). */
const pits = (len: number): Segment => seg(Array.from({ length: LANES }, () => '_'.repeat(len)));

/** Trous en quinconce : on les saute, ou on passe entre eux en changeant de couloir. */
const holes = seg([
  '___.....',
  '___..___',
  '.....___',
  '___..___',
  '___.....',
]);

/** Mur percé d'une porte de 2 couloirs sous une poutre (`gap` = couloir de gauche) : on passe au sol. */
const gate = (gap: number): Segment =>
  seg(Array.from({ length: LANES }, (_, lane) => (lane === gap || lane === gap + 1 ? 'T' : 'M')));

/**
 * Pics entre deux rangées de poutres : impossible de les sauter, il faut les contourner,
 * à gauche des premiers puis à droite des seconds.
 */
const lowSpikes = seg([
  'T.T.T^T',
  'T.T.T^T',
  'T^T.T^T',
  'T^T.T.T',
  'T^T.T.T',
]);

/** Mur plein, épais de 2 : seul le tremplin du couloir `lane` le fait passer. */
const launch = (lane: number): Segment =>
  put(5, [{ lane, col: 0, c: '*' }, ...[0, 1, 2, 3, 4].flatMap((l) => [{ lane: l, col: 3, c: 'M' }, { lane: l, col: 4, c: 'M' }])]);

/** Grand fossé de 5 cases, trop long pour un saut : seul le tremplin du couloir `lane` le franchit. */
const bigPit = (lane: number): Segment =>
  put(6, [{ lane, col: 0, c: '*' }, ...[0, 1, 2, 3, 4].flatMap((l) => [1, 2, 3, 4, 5].map((col) => ({ lane: l, col, c: '_' })))]);

/** Toit : un tremplin propulse sur un bloc de murs long de 8 cases, on roule dessus puis on retombe. */
const rooftop = seg([
  '...MMMMMMMM',
  '*..MMMMMMMM',
  '...MMMMMMMM',
  '*..MMMMMMMM',
  '...MMMMMMMM',
]);

/** Mobile qui balaie toute la largeur ; `start` : son couloir quand le cube arrive. On le saute ou on l'évite. */
const saw = (start: number): Segment => seg(Array.from({ length: LANES }, (_, lane) => (lane === start ? 'o' : '~')));

/** Mobile entre deux rangées de poutres : pas de saut possible, il faut l'éviter au bon moment. */
const lowSaw = seg([
  'TT~TT',
  'TT~TT',
  'TToTT',
  'TT~TT',
  'TT~TT',
]);

/** Deux mobiles rapprochés, l'un part de la gauche, l'autre de la droite. */
const twinSaws = seg([
  'o..~',
  '~..~',
  '~..~',
  '~..o',
  '~..~',
]);

/** Tunnel de 3 couloirs entre deux murs, un mobile au milieu. */
const sawTunnel = seg([
  'MMMMMMMMM',
  '....~....',
  '....o....',
  '....~....',
  'MMMMMMMMM',
]);

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

/** Défis des niveaux 6 à 10, pris dans l'ordre (en boucle) à partir d'un décalage propre à chaque niveau. */
const POOL: readonly Segment[] = [
  wall(0), saw(2), pits(2), wall(3), launch(1), spikeLine, gate(1), wall(1), holes, stairs, lowSpikes, wall(2),
  tunnel, bigPit(3), wall(0), lowSaw, platform, pits(3), wall(3), rooftop, spikes3, twinSaws, wall(1), gate(3),
  stairs, launch(3), wall(2), sawTunnel, spikeLine, tunnel, wall(0), platform,
];

/**
 * Profil de temps libres (s) : `count` vagues, chacune avec `calm` écarts calmes de 2,5 s, une montée
 * de tension (2 s puis 1,5 s) et `stress` écarts stressants de 1 s.
 */
const waves = (count: number, calm: number, stress: number): number[] =>
  Array.from({ length: count }, () => [
    ...Array<number>(calm).fill(REACTION_CALM), 2, 1.5, ...Array<number>(stress).fill(REACTION_STRESS),
  ]).flat();

/** Niveau dont les écarts entre défis suivent le profil `gaps` (s), arrondis à la colonne au-dessus. */
const rhythm = (gaps: number[], offset: number): Level => {
  const pick = (i: number) => trim(POOL[(offset + i) % POOL.length]);
  const segs: Segment[] = [empty(14), pick(0)];
  gaps.forEach((t, i) => segs.push(empty(Math.ceil(t * CONFIG.speed - 1e-9)), pick(i + 1)));
  return parseMap(join(...segs, empty(14)));
};

/** `theme` : décor du niveau (cf. render/themes.ts), interchangeable sans toucher aux obstacles. */
export interface LevelDef { name: string; theme: ThemeId; level: Level }

// Le temps libre entre deux défis est le « temps de réaction » : 10 s au niveau 1, 2,5 s au niveau 5
// (cf. reaction.ts). À 7 u/s : 70, 57, 44, 31 et 18 colonnes (arrondies au-dessus de la cible).
// Les types arrivent peu à peu : pyramides, murs et fosses, puis rampes et poutres, tremplins, escaliers, mobiles.
export const LEVELS: readonly LevelDef[] = [
  { name: 'Échauffement', theme: 'neon', level: sequence(70, spike, pits(2), spikes3, wall(3), wall(0), spikeLine) },
  {
    name: 'Slalom',
    theme: 'foret',
    level: sequence(57, wall(2), holes, wall(0), gate(2), platform, pits(3), spikeLine, gate(0), wall(3), spikes3),
  },
  {
    name: 'Prototype',
    theme: 'dunes',
    level: sequence(44, spike, launch(1), wall(3), gate(0), pits(2), platform, spikeLine, bigPit(3), tunnel, holes, wall(1)),
  },
  {
    name: 'Escalade',
    theme: 'glacier',
    level: sequence(
      31, stairs, wall(1), launch(3), holes, wall(3), platform, lowSpikes, tunnel, spikeLine, stairs, rooftop,
      wall(0), gate(2), bigPit(1), tunnel,
    ),
  },
  {
    name: 'Marathon',
    theme: 'volcan',
    level: sequence(
      18, wall(0), pits(3), wall(3), saw(4), wall(1), stairs, launch(2), tunnel, holes, platform, gate(3), wall(0),
      spikeLine, lowSaw, bigPit(1), stairs, lowSpikes, wall(2), twinSaws, tunnel, rooftop, wall(1), sawTunnel, gate(1),
    ),
  },
  // Niveaux 6 à 10 : le rythme varie dans le niveau, par vagues (cf. `waves`).
  { name: 'Sprint', theme: 'neon', level: rhythm(waves(3, 3, 2), 0) },
  { name: 'Rafale', theme: 'foret', level: rhythm(waves(3, 3, 3), 3) },
  { name: 'Tempête', theme: 'dunes', level: rhythm(waves(3, 2, 4), 6) },
  { name: 'Vertige', theme: 'glacier', level: rhythm(waves(4, 2, 5), 1) },
  { name: 'Ultime', theme: 'volcan', level: rhythm(waves(4, 1, 6), 4) },
];

export const LEVEL_1 = LEVELS[0].level;
