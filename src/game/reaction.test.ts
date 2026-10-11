import { describe, it, expect } from 'vitest';
import { parseMap } from './level';
import { CONFIG } from './game';
import { challenges, reactionTime, reactionTarget } from './reaction';

const lanes = (cols: Record<number, string>, width: number) =>
  Array.from({ length: 5 }, (_, l) => Array.from({ length: width }, (_, x) => (l === 2 ? cols[x] ?? '.' : '.')).join(''));

describe('challenges', () => {
  it('regroupe les colonnes proches en un seul défi', () => {
    const lvl = parseMap(lanes({ 10: '^', 12: '^', 30: '^' }, 40));
    expect(challenges(lvl)).toEqual([{ x0: 10, x1: 13 }, { x0: 30, x1: 31 }]);
  });
});

describe('reactionTime', () => {
  it('est le plus petit écart (en secondes) entre deux défis', () => {
    const lvl = parseMap(lanes({ 5: '^', 26: '^', 80: '^' }, 90));
    // écart 1 : de 6 à 26 = 20 colonnes ; écart 2 : de 27 à 80 = 53 colonnes
    expect(reactionTime(lvl)).toBeCloseTo(20 / CONFIG.speed, 6);
  });
  it('vaut Infinity avec un seul défi', () => {
    expect(reactionTime(parseMap(lanes({ 5: '^' }, 20)))).toBe(Infinity);
  });
});

describe('reactionTarget', () => {
  it('va de 10 s (premier niveau) à 2,5 s (dernier) en décroissant', () => {
    expect(reactionTarget(0, 5)).toBe(10);
    expect(reactionTarget(4, 5)).toBe(2.5);
    expect(reactionTarget(1, 5)).toBeLessThan(reactionTarget(0, 5));
    expect(reactionTarget(2, 5)).toBeCloseTo(6.25, 6);
    expect(reactionTarget(9, 10)).toBe(2.5);
  });
});
