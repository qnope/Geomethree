import { describe, it, expect } from 'vitest';
import { parseLevel } from './level';

describe('parseLevel', () => {
  it('convertit une grille ASCII en obstacles (bas = sol)', () => {
    const lvl = parseLevel(['   #', '  ^#']);
    expect(lvl.obstacles).toEqual([
      { kind: 'spike', x: 2, y: 0 },
      { kind: 'block', x: 3, y: 1 },
      { kind: 'block', x: 3, y: 0 },
    ]);
  });
  it('place la ligne d\'arrivée après le dernier caractère', () => {
    expect(parseLevel(['^...']).length).toBe(4);
  });
  it('trie les obstacles par x pour un balayage rapide', () => {
    const lvl = parseLevel(['#  ', '  ^', '^  ']);
    const xs = lvl.obstacles.map((o) => o.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});
