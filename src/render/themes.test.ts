import { describe, it, expect } from 'vitest';
import { THEMES, themeById, themeParam } from './themes';
import { LEVELS } from '../game/levels';
import { OBSTACLE_TYPES } from '../game/level';

// Luminance relative et contraste WCAG : approximation de la lisibilité avant éclairage.
const lum = (c: number): number => {
  const [r, g, b] = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number, b: number): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('THEMES', () => {
  it('propose 5 décors aux identifiants et aux noms uniques', () => {
    expect(THEMES).toHaveLength(5);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(5);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(5);
  });

  it('chaque niveau référence un décor existant', () => {
    for (const l of LEVELS) expect(themeById(l.theme).id).toBe(l.theme);
  });

  it('?theme= choisit un décor pour tous les niveaux (aperçu), ignoré s\'il est inconnu', () => {
    expect(themeParam('?theme=glacier')).toBe('glacier');
    expect(themeParam('?x=1&theme=volcan')).toBe('volcan');
    expect(themeParam('?theme=inconnu')).toBeNull();
    expect(themeParam('')).toBeNull();
  });

  THEMES.forEach((t) => {
    it(`${t.name} : brouillard avant le plan lointain de la caméra (200)`, () => {
      expect(t.fog.near).toBeGreaterThan(0);
      expect(t.fog.far).toBeGreaterThan(t.fog.near);
      expect(t.fog.far).toBeLessThanOrEqual(150);
    });
    it(`${t.name} : habille chaque type d'obstacle`, () => {
      expect(Object.keys(t.obstacles).sort()).toEqual([...OBSTACLE_TYPES].sort());
    });
    // Ce qui tue ou propulse doit sauter aux yeux : par sa couleur, ou par son contour (fosse sombre bordée de lumière).
    for (const type of ['pyramid', 'pit', 'mover', 'pad'] as const) {
      it(`${t.name} : ${type} se détache de la piste (contraste ≥ 2)`, () => {
        const { color, edges } = t.obstacles[type];
        const best = Math.max(contrast(color, t.track.color), type === 'pit' && edges !== undefined ? contrast(edges, t.track.color) : 0);
        expect(best).toBeGreaterThanOrEqual(2);
      });
    }
    for (const type of ['wall', 'ramp', 'stairs', 'beam'] as const) {
      it(`${t.name} : ${type} se détache de la piste (contraste ≥ 1,5)`, () => {
        expect(contrast(t.obstacles[type].color, t.track.color)).toBeGreaterThanOrEqual(1.5);
      });
    }
    it(`${t.name} : le rail des mobiles se voit sur la piste (contraste ≥ 1,5)`, () => {
      const rail = t.obstacles.mover.edges;
      expect(rail).toBeDefined();
      expect(contrast(rail!, t.track.color)).toBeGreaterThanOrEqual(1.5);
    });
    it(`${t.name} : la poutre ne se confond pas avec le mur (autre couleur)`, () => {
      expect(t.obstacles.beam.color).not.toBe(t.obstacles.wall.color);
    });
    it(`${t.name} : le cube se détache de la piste (contraste ≥ 2)`, () => {
      expect(contrast(t.player.color, t.track.color)).toBeGreaterThanOrEqual(2);
    });
  });
});
