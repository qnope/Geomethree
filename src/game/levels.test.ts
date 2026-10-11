import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels';
import { solve, replay } from './solver';
import { reactionTime, reactionTarget, reactionGaps, challenges, REACTION_CALM, REACTION_STRESS } from './reaction';

describe('LEVELS', () => {
  it('propose 10 niveaux nommés', () => {
    expect(LEVELS).toHaveLength(10);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(10);
  });
  it('chaque obstacle a un type, dont la forme et les collisions sont les mêmes partout', () => {
    for (const { level } of LEVELS) for (const o of level.obstacles) {
      if (o.type === 'pyramid') expect([o.kind, o.h]).toEqual(['spike', 1]);
      else expect(o.kind).toBe('block');
      if (o.type === 'wall') expect(o.h).toBe(3);
      if (o.type === 'ramp') expect(o.h).toBe(2);
    }
  });
  it('les niveaux utilisent les 4 types d\'obstacles', () => {
    const used = new Set(LEVELS.flatMap(({ level }) => level.obstacles.map((o) => o.type)));
    expect([...used].sort()).toEqual(['pyramid', 'ramp', 'stairs', 'wall']);
  });
  it('le temps de réaction diminue strictement sur les niveaux 1 à 5', () => {
    const times = LEVELS.slice(0, 5).map((l) => reactionTime(l.level));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThan(times[i - 1]);
  });
  LEVELS.slice(0, 5).forEach(({ name, level }, i) => {
    const target = reactionTarget(i);
    it(`niveau ${i + 1} (${name}) : temps de réaction ≈ ${target.toFixed(2)} s`, () => {
      const t = reactionTime(level);
      expect(t).toBeGreaterThanOrEqual(target); // jamais plus dur que prévu
      expect(t).toBeLessThan(target + 0.2);     // et la difficulté est vraiment utilisée
    });
  });

  // Niveaux 6 à 10 : le rythme varie dans le niveau, entre zones calmes (2,5 s) et stressantes (1 s).
  const isStress = (g: number) => g < REACTION_STRESS + 0.1;
  const isCalm = (g: number) => g >= REACTION_CALM;
  const hard = LEVELS.slice(5);
  hard.forEach(({ name, level }, k) => {
    const gaps = reactionGaps(level);
    it(`niveau ${k + 6} (${name}) : chaque écart est entre 1 s et 2,5 s`, () => {
      for (const g of gaps) {
        expect(g).toBeGreaterThanOrEqual(REACTION_STRESS);
        expect(g).toBeLessThan(REACTION_CALM + 0.15);
      }
    });
    it(`niveau ${k + 6} (${name}) : alterne au moins 3 zones calmes et 3 zones stressantes`, () => {
      let calmZones = 0, stressZones = 0, prev = '';
      for (const g of gaps) {
        const z = isStress(g) ? 's' : isCalm(g) ? 'c' : prev;
        if (z !== prev) { if (z === 'c') calmZones++; if (z === 's') stressZones++; }
        prev = z;
      }
      expect(calmZones).toBeGreaterThanOrEqual(3);
      expect(stressZones).toBeGreaterThanOrEqual(3);
    });
  });
  it('de 6 à 10, les zones stressantes prennent de plus en plus de place', () => {
    const share = hard.map(({ level }) => { const g = reactionGaps(level); return g.filter(isStress).length / g.length; });
    const mean = hard.map(({ level }) => { const g = reactionGaps(level); return g.reduce((a, b) => a + b, 0) / g.length; });
    for (let i = 1; i < hard.length; i++) {
      expect(share[i]).toBeGreaterThan(share[i - 1]);
      expect(mean[i]).toBeLessThan(mean[i - 1]);
    }
  });

  LEVELS.forEach(({ name, level }, i) => {
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
