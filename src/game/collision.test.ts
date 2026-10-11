import { describe, it, expect } from 'vitest';
import { overlaps, type Box } from './collision';

const box = (x: number, y: number, z: number, w = 1, h = 1, d = 1): Box => ({ x, y, z, w, h, d });

describe('overlaps (AABB 3D)', () => {
  it('détecte deux boîtes qui se chevauchent', () => {
    expect(overlaps(box(0, 0, 0), box(0.5, 0.5, 0.5))).toBe(true);
  });
  it('ne compte pas un simple contact de bord', () => {
    expect(overlaps(box(0, 0, 0), box(1, 0, 0))).toBe(false);
    expect(overlaps(box(0, 0, 0), box(0, 1, 0))).toBe(false);
    expect(overlaps(box(0, 0, 0), box(0, 0, 1))).toBe(false);
  });
  it('rejette des boîtes séparées sur un seul axe', () => {
    expect(overlaps(box(0, 0, 0), box(3, 0, 0))).toBe(false);
    expect(overlaps(box(0, 0, 0), box(0, 0, 3))).toBe(false);
  });
  it('gère des boîtes de tailles différentes', () => {
    expect(overlaps(box(0, 0, 0, 5, 5, 5), box(2, 2, 2, 0.1, 0.1, 0.1))).toBe(true);
  });
});
