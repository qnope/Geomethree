/**
 * Physique d'un obstacle : bloc (solide, on peut rouler dessus), pic (mortel au contact), fosse (mortelle
 * quand le centre du cube y passe au ras du sol), tremplin (propulse le cube qui y passe au sol) ou mobile
 * (pic qui va et vient sur son rail, voir `moverZ` dans game.ts).
 */
export type ObstacleKind = 'block' | 'spike' | 'pit' | 'pad' | 'mover';

/**
 * Type d'obstacle : sa forme et ses collisions sont les mêmes dans tous les décors, chaque décor
 * l'habille à sa façon (render/themes.ts). Ajouter un type : l'ajouter ici, lui donner un caractère
 * dans CELLS, puis un rendu dans chaque décor (le compilateur signale les décors oubliés).
 */
export const OBSTACLE_TYPES = ['wall', 'ramp', 'stairs', 'pyramid', 'pit', 'beam', 'pad', 'mover'] as const;
export type ObstacleType = (typeof OBSTACLE_TYPES)[number];

/**
 * Obstacle : cellule de 1 en x, de `y` à `y + h` en hauteur, couvre [z0, z1] latéralement.
 * Mobile : [z0, z1] est tout son rail, `start` le bord gauche de sa case quand le cube arrive à sa colonne.
 */
export interface Obstacle {
  kind: ObstacleKind; type: ObstacleType; x: number; y: number; z0: number; z1: number; h: number; start?: number;
}
export interface Level { obstacles: Obstacle[]; length: number }

export const LANES = 5;
export const TRACK_HALF = LANES / 2; // la piste va de z = -2,5 à z = +2,5

/**
 * Caractères des cartes : `M` mur (3 de haut, plus haut que le saut), `=` rampe (2 de haut, on roule
 * dessus), `^` pyramide (pic), `#` marche de 1, `_` fosse, `T` poutre (suspendue de 1,5 à 3 : on passe
 * dessous, pas par-dessus), `*` tremplin, `o` mobile (sur son rail `~`, dans la même colonne).
 * Les chiffres `1`…`9` sont des marches de cette hauteur.
 */
const CELLS: Record<string, { kind: ObstacleKind; type: ObstacleType; h: number; y?: number }> = {
  M: { kind: 'block', type: 'wall', h: 3 },
  '=': { kind: 'block', type: 'ramp', h: 2 },
  '^': { kind: 'spike', type: 'pyramid', h: 1 },
  '#': { kind: 'block', type: 'stairs', h: 1 },
  _: { kind: 'pit', type: 'pit', h: 0.05 },
  T: { kind: 'block', type: 'beam', y: 1.5, h: 1.5 },
  '*': { kind: 'pad', type: 'pad', h: 0.3 },
  o: { kind: 'mover', type: 'mover', h: 1 },
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
  const length = Math.max(...lanes.map((r) => r.length));
  for (let x = 0; x < length; x++) {
    for (let lane = 0; lane < LANES; lane++) {
      const c = lanes[lane][x] ?? '.';
      if (c === '.' || c === ' ') continue;
      const z0 = lane - TRACK_HALF;
      if (c === '~' || c === 'o') {
        // Rail : suite de `~` et d'un seul `o` dans la colonne, lue d'un bloc depuis son premier couloir.
        if (lane > 0 && /[~o]/.test(lanes[lane - 1][x] ?? '')) continue;
        let end = lane;
        while (end + 1 < LANES && /[~o]/.test(lanes[end + 1][x] ?? '')) end++;
        const run = Array.from({ length: end - lane + 1 }, (_, k) => lanes[lane + k][x]).join('');
        if (run.split('o').length !== 2) throw new Error(`Un rail doit porter un seul mobile (colonne ${x}, couloirs ${lane} à ${end})`);
        obstacles.push({ ...CELLS.o, x, y: 0, z0, z1: end + 1 - TRACK_HALF, start: z0 + run.indexOf('o') });
        continue;
      }
      const o = cell(c);
      if (!o) throw new Error(`Caractère inconnu « ${c} » (couloir ${lane}, colonne ${x})`);
      obstacles.push({ kind: o.kind, type: o.type, x, y: o.y ?? 0, z0, z1: z0 + 1, h: o.h });
    }
  }
  return { obstacles, length };
}
