import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels';
import { solve, replay } from './solver';

describe('LEVELS', () => {
  it('propose 5 niveaux nommés', () => {
    expect(LEVELS).toHaveLength(5);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(5);
  });
  it('la longueur est croissante', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].level.length).toBeGreaterThan(LEVELS[i - 1].level.length);
    }
  });
  LEVELS.forEach(({ name, level }, i) => {
    it(`le niveau ${i + 1} (${name}) est faisable, solution rejouée à l'identique`, () => {
      const plan = solve(level);
      expect(plan).not.toBeNull();
      expect(replay(level, plan!)).toBe('won');
    });
  });
});
