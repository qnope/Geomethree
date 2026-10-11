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
  it('8 types : mur, rampe, escalier, pyramide, fosse, poutre, tremplin, mobile', () => {
    expect([...OBSTACLE_TYPES]).toEqual(['wall', 'ramp', 'stairs', 'pyramid', 'pit', 'beam', 'pad', 'mover']);
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
  it('_ est une fosse : mortelle au ras du sol, sur sa seule case', () => {
    const lvl = parseMap([empty, '..__.', empty, empty, empty]);
    expect(lvl.obstacles).toEqual([
      { kind: 'pit', type: 'pit', x: 2, y: 0, z0: -1.5, z1: -0.5, h: 0.05 },
      { kind: 'pit', type: 'pit', x: 3, y: 0, z0: -1.5, z1: -0.5, h: 0.05 },
    ]);
  });
  it('T est une poutre : bloc suspendu de 1,5 à 3, on passe dessous sans sauter', () => {
    const lvl = parseMap([empty, empty, '.T...', empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'block', type: 'beam', x: 1, y: 1.5, z0: -0.5, z1: 0.5, h: 1.5 }]);
  });
  it('* est un tremplin, posé à plat sur la piste', () => {
    const lvl = parseMap([empty, empty, empty, empty, '...*.']);
    expect(lvl.obstacles).toEqual([{ kind: 'pad', type: 'pad', x: 3, y: 0, z0: 1.5, z1: 2.5, h: 0.3 }]);
  });
  it('o est un mobile : il va et vient sur son rail ~, et part de la case o', () => {
    const lvl = parseMap(['.~...', '.o...', '.~...', empty, empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'mover', type: 'mover', x: 1, y: 0, z0: -2.5, z1: 0.5, h: 1, start: -1.5 }]);
  });
  it('un mobile sans rail reste sur sa case', () => {
    const lvl = parseMap([empty, empty, empty, '..o..', empty]);
    expect(lvl.obstacles).toEqual([{ kind: 'mover', type: 'mover', x: 2, y: 0, z0: 0.5, z1: 1.5, h: 1, start: 0.5 }]);
  });
  it('deux rails séparés dans une même colonne font deux mobiles', () => {
    const lvl = parseMap(['o....', '~....', empty, '~....', 'o....']);
    expect(lvl.obstacles.map((o) => [o.z0, o.z1, o.start])).toEqual([[-2.5, -0.5, -2.5], [0.5, 2.5, 1.5]]);
  });
  it('refuse un rail sans mobile ou avec deux mobiles', () => {
    expect(() => parseMap(['~....', '~....', empty, empty, empty])).toThrow(/rail/);
    expect(() => parseMap(['o....', '~....', 'o....', empty, empty])).toThrow(/rail/);
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
