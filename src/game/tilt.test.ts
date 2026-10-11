import { describe, it, expect } from 'vitest';
import { lateralTilt, steerFromTilt } from './tilt';

const deg = (d: number) => d;

describe('lateralTilt (côté vers lequel le téléphone penche, -1…1)', () => {
  it('téléphone à plat : aucune inclinaison', () => {
    expect(lateralTilt(0, 0, 0)).toBeCloseTo(0);
  });
  it('téléphone tenu droit en portrait : aucune inclinaison', () => {
    expect(lateralTilt(90, 0, 0)).toBeCloseTo(0);
  });
  it('portrait : bord droit vers le bas (gamma > 0) = penche à droite', () => {
    expect(lateralTilt(0, deg(20), 0)).toBeCloseTo(Math.sin((20 * Math.PI) / 180));
  });
  it('portrait : bord gauche vers le bas (gamma < 0) = penche à gauche', () => {
    expect(lateralTilt(0, deg(-20), 0)).toBeCloseTo(-Math.sin((20 * Math.PI) / 180));
  });
  it('paysage (écran tourné de 90°) : beta > 0 penche à droite', () => {
    expect(lateralTilt(deg(20), 0, 90)).toBeCloseTo(Math.sin((20 * Math.PI) / 180));
  });
  it('paysage inversé (270°) : beta > 0 penche à gauche', () => {
    expect(lateralTilt(deg(20), 0, 270)).toBeCloseTo(-Math.sin((20 * Math.PI) / 180));
  });
  it('écran à l\'envers (180°) : le sens est inversé', () => {
    expect(lateralTilt(0, deg(20), 180)).toBeCloseTo(-Math.sin((20 * Math.PI) / 180));
  });
  it('accepte un angle d\'écran négatif (-90 = 270)', () => {
    expect(lateralTilt(deg(20), 0, -90)).toBeCloseTo(lateralTilt(deg(20), 0, 270));
  });
  it('reste borné entre -1 et 1 pour n\'importe quelle orientation', () => {
    for (let b = -180; b <= 180; b += 30)
      for (let g = -90; g <= 90; g += 30)
        for (const a of [0, 90, 180, 270]) {
          const t = lateralTilt(b, g, a);
          expect(Math.abs(t)).toBeLessThanOrEqual(1 + 1e-9);
        }
  });
});

describe('steerFromTilt (zone morte puis réponse linéaire)', () => {
  const t = (d: number) => Math.sin((d * Math.PI) / 180);
  it('ignore les petits tremblements (zone morte)', () => {
    expect(steerFromTilt(t(1.5))).toBe(0);
    expect(steerFromTilt(t(-1.5))).toBe(0);
  });
  it('plein gauche / plein droite à grande inclinaison', () => {
    expect(steerFromTilt(t(40))).toBe(1);
    expect(steerFromTilt(t(-40))).toBe(-1);
  });
  it('est symétrique et croissant', () => {
    expect(steerFromTilt(t(10))).toBeCloseTo(-steerFromTilt(t(-10)));
    expect(steerFromTilt(t(15))).toBeGreaterThan(steerFromTilt(t(8)));
    expect(steerFromTilt(t(8))).toBeGreaterThan(0);
  });
  it('accepte une zone morte et une pleine échelle personnalisées', () => {
    expect(steerFromTilt(t(10), { deadzoneDeg: 5, fullDeg: 15 })).toBeCloseTo(0.5, 1);
  });
});
