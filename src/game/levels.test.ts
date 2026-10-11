import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels';
import { solve, replay } from './solver';
import { reactionTime, reactionTarget, challenges } from './reaction';

describe('LEVELS', () => {
  it('propose 10 niveaux nommés', () => {
    expect(LEVELS).toHaveLength(10);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(10);
  });
  it('le temps de réaction diminue strictement de niveau en niveau', () => {
    const times = LEVELS.map((l) => reactionTime(l.level));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThan(times[i - 1]);
  });
  LEVELS.forEach(({ name, level }, i) => {
    const target = reactionTarget(i);
    it(`niveau ${i + 1} (${name}) : temps de réaction ≈ ${target.toFixed(2)} s`, () => {
      const t = reactionTime(level);
      expect(t).toBeGreaterThanOrEqual(target); // jamais plus dur que prévu
      expect(t).toBeLessThan(target + 0.2);     // et la difficulté est vraiment utilisée
    });
    it(`niveau ${i + 1} (${name}) : faisable, solution rejouée à l'identique`, () => {
      const plan = solve(level);
      expect(plan).not.toBeNull();
      expect(replay(level, plan!)).toBe('won');
    });
    it(`niveau ${i + 1} (${name}) : faisable en ne décidant que toutes les 0,15 s`, () => {
      expect(solve(level, 36)).not.toBeNull();
    });
    it(`niveau ${i + 1} (${name}) : au moins ${3 + i * 2} défis`, () => {
      expect(challenges(level).length).toBeGreaterThanOrEqual(3 + i * 2);
    });
  });
});
