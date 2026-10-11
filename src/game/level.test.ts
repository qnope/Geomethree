import { describe, it, expect } from 'vitest';
import { parseLevel, parseMap, LANES, TRACK_HALF, OBSTACLE_TYPES } from './level';

describe('constantes de piste', () => {
  it('la piste fait 5 couloirs d\'une unité, centrée sur z = 0', () => {
    expect(LANES).toBe(5);
    expect(TRACK_HALF).toBe(2.5);
  });
});

describe('parseLevel (profil de côté, obstacles sur toute la largeur)', () => {
  it('convertit une grille ASCII en obstacles (bas = sol)', () => {
    const lvl = parseLevel(['   #', '  ^#']);
    expect(lvl.obstacles).toEqual([
      { kind: 'spike', type: 'pyramid', x: 2, y: 0, z0: -2.5, z1: 2.5, h: 1 },
      { kind: 'block', type: 'stairs', x: 3, y: 1, z0: -2.5, z1: 2.5, h: 1 },
      { kind: 'block', type: 'stairs', x: 3, y: 0, z0: -2.5, z1: 2.5, h: 1 },
    ]);
  });
  it('place la ligne d\'arrivée après le dernier caractère', () => {
    expect(parseLevel(['^...']).length).toBe(4);
  });
  it('trie les obstacles par x pour un balayage rapide', () => {
    const lvl = parseLevel(['#  ', '  ^', '^  ']);
    const xs = lvl.obstacles.map((o) => o.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe('types d\'obstacles', () => {
  it('4 types : mur, rampe, escalier, pyramide', () => {
    expect([...OBSTACLE_TYPES]).toEqual(['wall', 'ramp', 'stairs', 'pyramid']);
  });
});

describe('parseMap (vue de dessus, 5 couloirs)', () => {
  const empty = '.....';
  it('place une pyramide (pic) dans le couloir de gauche (ligne du haut)', () => {
    const lvl = parseMap(['^....', empty, empty, empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'spike', type: 'pyramid', x: 0, y: 0, z0: -2.5, z1: -1.5, h: 1 }]);
  });
  it('place une marche dans le couloir de droite (ligne du bas)', () => {
    const lvl = parseMap([empty, empty, empty, empty, '.#...']);
    expect(lvl.obstacles).toEqual([{ kind: 'block', type: 'stairs', x: 1, y: 0, z0: 1.5, z1: 2.5, h: 1 }]);
  });
  it('un chiffre donne une marche d\'escalier de cette hauteur', () => {
    const lvl = parseMap([empty, empty, '..3..', empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'block', type: 'stairs', x: 2, y: 0, z0: -0.5, z1: 0.5, h: 3 }]);
  });
  it('M est un mur (3 de haut, infranchissable), = une rampe (2 de haut, on roule dessus)', () => {
    const lvl = parseMap(['M....', '.=...', empty, empty, empty]);
    expect(lvl.obstacles).toEqual([
      { kind: 'block', type: 'wall', x: 0, y: 0, z0: -2.5, z1: -1.5, h: 3 },
      { kind: 'block', type: 'ramp', x: 1, y: 0, z0: -1.5, z1: -0.5, h: 2 },
    ]);
  });
  it('calcule la longueur et trie par x', () => {
    const lvl = parseMap(['....#', '..^..', empty, '#....', empty]);
    expect(lvl.length).toBe(5);
    expect(lvl.obstacles.map((o) => o.x)).toEqual([0, 2, 4]);
  });
  it('refuse un nombre de couloirs incorrect', () => {
    expect(() => parseMap(['....', '....'])).toThrow(/5/);
  });
  it('refuse un caractère inconnu', () => {
    expect(() => parseMap(['x....', empty, empty, empty, empty])).toThrow(/x/);
  });
});
