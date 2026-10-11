import { describe, it, expect } from 'vitest';
import { rollPose } from './roll';

describe('rollPose (cube qui roule sur son arête avant)', () => {
  it('au départ, le cube est posé à plat', () => {
    const p = rollPose(0);
    expect(p.cx).toBeCloseTo(0.5);
    expect(p.cy).toBeCloseTo(0.5);
    expect(p.angle).toBeCloseTo(0);
  });

  it('une case parcourue = un quart de tour, de nouveau à plat', () => {
    const p = rollPose(1);
    expect(p.cx).toBeCloseTo(1.5);
    expect(p.cy).toBeCloseTo(0.5);
    expect(p.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('un tour complet = 4 cases parcourues', () => {
    expect(rollPose(4).angle).toBeCloseTo(-2 * Math.PI);
    expect(rollPose(4).cx).toBeCloseTo(4.5);
  });

  it('à mi-roulade, le cube est en équilibre sur son arête (centre à √2/2)', () => {
    const p = rollPose(0.5);
    expect(p.cy).toBeCloseTo(Math.SQRT1_2);
    expect(p.cx).toBeCloseTo(1); // juste au-dessus de l'arête pivot
  });

  it('le coin bas arrière ne passe jamais sous le sol', () => {
    for (let d = 0; d < 2; d += 0.05) {
      const p = rollPose(d);
      // plus bas sommet d'un carré de demi-côté 0.5 tourné de angle
      const a = ((-p.angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      const lowest = p.cy - 0.5 * (Math.cos(a) + Math.sin(a));
      expect(lowest).toBeGreaterThan(-1e-9);
    }
  });
});

describe('rollPose sans allocation', () => {
  it('réutilise l\'objet de sortie fourni', () => {
    const out = { cx: 0, cy: 0, angle: 0 };
    expect(rollPose(2.3, out)).toBe(out);
  });
});
