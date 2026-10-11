export type ObstacleKind = 'block' | 'spike';
export interface Obstacle { kind: ObstacleKind; x: number; y: number }
export interface Level { obstacles: Obstacle[]; length: number }

const KINDS: Record<string, ObstacleKind> = { '#': 'block', '^': 'spike' };

/** Grille ASCII, ligne du bas = sol (y = 0). `#` bloc, `^` pic, autre = vide. */
export function parseLevel(rows: string[]): Level {
  const obstacles: Obstacle[] = [];
  let length = 0;
  rows.forEach((row, r) => {
    const y = rows.length - 1 - r;
    length = Math.max(length, row.length);
    for (let x = 0; x < row.length; x++) {
      const kind = KINDS[row[x]];
      if (kind) obstacles.push({ kind, x, y });
    }
  });
  obstacles.sort((a, b) => a.x - b.x); // tri stable : l'ordre des lignes est conservé
  return { obstacles, length };
}
