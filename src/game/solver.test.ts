import { describe, it, expect } from 'vitest';
import { solve, replay } from './solver';
import { parseLevel, parseMap } from './level';
import { LEVEL_1 } from './levels';

describe('solve', () => {
  it('trouve une solution à un niveau simple', () => {
    expect(solve(parseLevel(['      ^         ']))).not.toBeNull();
  });
  it('détecte un niveau impossible (mur de 4 blocs)', () => {
    expect(solve(parseLevel(['     #   ', '     #   ', '     #   ', '     #   ']))).toBeNull();
  });
  it('le niveau 1 est faisable', () => {
    expect(solve(LEVEL_1)).not.toBeNull();
  });
  it('le niveau 1 est faisable et la solution rejouée gagne vraiment', () => {
    const plan = solve(LEVEL_1);
    expect(plan).not.toBeNull();
    expect(replay(LEVEL_1, plan!)).toBe('won');
  });
  it('trouve le passage d\'un mur qu\'il faut contourner', () => {
    const wall = (gap: number) => Array.from({ length: 5 }, (_, i) => (i === gap ? '.........' : '....3....'));
    const lvl = parseMap(wall(4));
    const plan = solve(lvl);
    expect(plan).not.toBeNull();
    expect(plan!.some((d) => d.steer > 0)).toBe(true);
    expect(replay(lvl, plan!)).toBe('won');
  });
  it('détecte un mur sans passage', () => {
    const lvl = parseMap(Array.from({ length: 5 }, () => '....3....'));
    expect(solve(lvl)).toBeNull();
  });
  it('distingue deux positions latérales proches (pics à contourner sous des poutres)', () => {
    // Impossible de sauter sous les poutres : il faut passer à gauche des premiers pics, puis à droite des seconds.
    const lvl = parseMap([
      '.........T.T.T^T........',
      '.........T.T.T^T........',
      '.........T^T.T^T........',
      '.........T^T.T.T........',
      '.........T^T.T.T........',
    ]);
    const plan = solve(lvl);
    expect(plan).not.toBeNull();
    expect(replay(lvl, plan!)).toBe('won');
  });
  it('espace les décisions d\'au moins `decisionEvery` pas', () => {
    const plan = solve(LEVEL_1, 36)!;
    expect(plan).not.toBeNull();
    for (let i = 1; i < plan.length; i++) expect(plan[i].step - plan[i - 1].step).toBeGreaterThanOrEqual(36);
  });
});
