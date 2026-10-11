import { describe, it, expect } from 'vitest';
import { overlaps } from './collision';

describe('overlaps (AABB)', () => {
  it('détecte deux boîtes qui se chevauchent', () => {
    expect(overlaps({ x: 0, y: 0, w: 1, h: 1 }, { x: 0.5, y: 0.5, w: 1, h: 1 })).toBe(true);
  });
  it('ne compte pas un simple contact de bord', () => {
    expect(overlaps({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 })).toBe(false);
  });
  it('rejette des boîtes séparées', () => {
    expect(overlaps({ x: 0, y: 0, w: 1, h: 1 }, { x: 3, y: 0, w: 1, h: 1 })).toBe(false);
  });
});
