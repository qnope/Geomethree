import { describe, it, expect } from 'vitest';
import { parseLevel, parseMap, LANES, TRACK_HALF } from './level';

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
      { kind: 'spike', x: 2, y: 0, z0: -2.5, z1: 2.5, h: 1 },
      { kind: 'block', x: 3, y: 1, z0: -2.5, z1: 2.5, h: 1 },
      { kind: 'block', x: 3, y: 0, z0: -2.5, z1: 2.5, h: 1 },
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

describe('parseMap (vue de dessus, 5 couloirs)', () => {
  const empty = '.....';
  it('place un pic dans le couloir de gauche (ligne du haut)', () => {
    const lvl = parseMap(['^....', empty, empty, empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'spike', x: 0, y: 0, z0: -2.5, z1: -1.5, h: 1 }]);
  });
  it('place un bloc dans le couloir de droite (ligne du bas)', () => {
    const lvl = parseMap([empty, empty, empty, empty, '.#...']);
    expect(lvl.obstacles).toEqual([{ kind: 'block', x: 1, y: 0, z0: 1.5, z1: 2.5, h: 1 }]);
  });
  it('un chiffre donne la hauteur d\'une pile de blocs', () => {
    const lvl = parseMap([empty, empty, '..3..', empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'block', x: 2, y: 0, z0: -0.5, z1: 0.5, h: 3 }]);
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
