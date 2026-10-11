export type ObstacleKind = 'block' | 'spike';
/** Obstacle : cellule de 1 en x, pile de `h` blocs, couvre [z0, z1] latéralement. */
export interface Obstacle { kind: ObstacleKind; x: number; y: number; z0: number; z1: number; h: number }
export interface Level { obstacles: Obstacle[]; length: number }

export const LANES = 5;
export const TRACK_HALF = LANES / 2; // la piste va de z = -2,5 à z = +2,5

const KINDS: Record<string, ObstacleKind> = { '#': 'block', '^': 'spike' };

const byX = (a: Obstacle, b: Obstacle) => a.x - b.x; // tri stable : l'ordre d'insertion est conservé

/** Profil de côté : ligne du bas = sol (y = 0). `#` bloc, `^` pic. Obstacles sur toute la largeur. */
export function parseLevel(rows: string[]): Level {
  const obstacles: Obstacle[] = [];
  let length = 0;
  rows.forEach((row, r) => {
    const y = rows.length - 1 - r;
    length = Math.max(length, row.length);
    for (let x = 0; x < row.length; x++) {
      const kind = KINDS[row[x]];
      if (kind) obstacles.push({ kind, x, y, z0: -TRACK_HALF, z1: TRACK_HALF, h: 1 });
    }
  });
  obstacles.sort(byX);
  return { obstacles, length };
}

/**
 * Vue de dessus : 5 lignes = 5 couloirs, de gauche (haut du texte) à droite (bas),
 * les colonnes avancent vers l'avant. `^` pic, `#` ou `1`…`9` pile de blocs de cette hauteur, `.` vide.
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
      if (c === '^') obstacles.push({ kind: 'spike', x, y: 0, z0, z1: z0 + 1, h: 1 });
      else if (c === '#' || (c >= '1' && c <= '9')) {
        obstacles.push({ kind: 'block', x, y: 0, z0, z1: z0 + 1, h: c === '#' ? 1 : Number(c) });
      } else throw new Error(`Caractère inconnu « ${c} » (couloir ${lane}, colonne ${x})`);
    }
  });
  obstacles.sort(byX);
  return { obstacles, length };
}
