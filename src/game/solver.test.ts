import { describe, it, expect } from 'vitest';
import { solve } from './solver';
import { parseLevel } from './level';
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
});
