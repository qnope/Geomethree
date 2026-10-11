/** Physique d'un obstacle : bloc (solide, on peut rouler dessus) ou pic (mortel au contact). */
export type ObstacleKind = 'block' | 'spike';

/**
 * Type d'obstacle : sa forme et ses collisions sont les mêmes dans tous les décors, chaque décor
 * l'habille à sa façon (render/themes.ts). Ajouter un type : l'ajouter ici, lui donner un caractère
 * dans CELLS, puis un rendu dans chaque décor (le compilateur signale les décors oubliés).
 */
export const OBSTACLE_TYPES = ['wall', 'ramp', 'stairs', 'pyramid'] as const;
export type ObstacleType = (typeof OBSTACLE_TYPES)[number];

/** Obstacle : cellule de 1 en x, pile de `h` blocs, couvre [z0, z1] latéralement. */
export interface Obstacle { kind: ObstacleKind; type: ObstacleType; x: number; y: number; z0: number; z1: number; h: number }
export interface Level { obstacles: Obstacle[]; length: number }

export const LANES = 5;
export const TRACK_HALF = LANES / 2; // la piste va de z = -2,5 à z = +2,5

/**
 * Caractères des cartes : `M` mur (3 de haut, plus haut que le saut), `=` rampe (2 de haut, on roule
 * dessus), `^` pyramide (pic), `#` marche de 1. Les chiffres `1`…`9` sont des marches de cette hauteur.
 */
const CELLS: Record<string, { kind: ObstacleKind; type: ObstacleType; h: number }> = {
  M: { kind: 'block', type: 'wall', h: 3 },
  '=': { kind: 'block', type: 'ramp', h: 2 },
  '^': { kind: 'spike', type: 'pyramid', h: 1 },
  '#': { kind: 'block', type: 'stairs', h: 1 },
};
const cell = (c: string) => CELLS[c] ?? (c >= '1' && c <= '9' ? { kind: 'block' as const, type: 'stairs' as const, h: Number(c) } : null);

const byX = (a: Obstacle, b: Obstacle) => a.x - b.x; // tri stable : l'ordre d'insertion est conservé

/** Profil de côté : ligne du bas = sol (y = 0). `#` bloc, `^` pic. Obstacles sur toute la largeur. */
export function parseLevel(rows: string[]): Level {
  const obstacles: Obstacle[] = [];
  let length = 0;
  rows.forEach((row, r) => {
    const y = rows.length - 1 - r;
    length = Math.max(length, row.length);
    for (let x = 0; x < row.length; x++) {
      const c = row[x] === '#' || row[x] === '^' ? CELLS[row[x]] : null;
      if (c) obstacles.push({ kind: c.kind, type: c.type, x, y, z0: -TRACK_HALF, z1: TRACK_HALF, h: 1 });
    }
  });
  obstacles.sort(byX);
  return { obstacles, length };
}

/**
 * Vue de dessus : 5 lignes = 5 couloirs, de gauche (haut du texte) à droite (bas),
 * les colonnes avancent vers l'avant. Caractères : cf. CELLS, `.` vide.
 */
export function parseMap(lanes: string[]): Level {
  if (lanes.length !== LANES) throw new Error(`parseMap attend ${LANES} couloirs, reçu ${lanes.length}`);
  const obstacles: Obstacle[] = [];
  let length = 0;
  lanes.forEach((row, lane) => {
    const z0 = lane - TRACK_HALF;
    length = Math.max(length, row.length);
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || c === ' ') continue;
      const o = cell(c);
      if (!o) throw new Error(`Caractère inconnu « ${c} » (couloir ${lane}, colonne ${x})`);
      obstacles.push({ kind: o.kind, type: o.type, x, y: 0, z0, z1: z0 + 1, h: o.h });
    }
  });
  obstacles.sort(byX);
  return { obstacles, length };
}
