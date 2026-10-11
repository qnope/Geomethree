import { describe, it, expect } from 'vitest';
import { THEMES } from '../render/themes';
import { SOUNDSCAPES, degreeToMidi, loopSeconds } from './soundscapes';

describe('degreeToMidi', () => {
  const major = [0, 2, 4, 5, 7, 9, 11];
  it('suit la gamme et change d\'octave tous les 7 degrés', () => {
    expect(degreeToMidi(60, major, 0)).toBe(60);
    expect(degreeToMidi(60, major, 2)).toBe(64);
    expect(degreeToMidi(60, major, 7)).toBe(72);
    expect(degreeToMidi(60, major, 9)).toBe(76);
  });
  it('accepte les degrés négatifs (sous la tonique)', () => {
    expect(degreeToMidi(60, major, -1)).toBe(59);
    expect(degreeToMidi(60, major, -7)).toBe(48);
  });
});

describe('SOUNDSCAPES', () => {
  it('chaque décor a sa propre ambiance (tempo, tonalité ou gamme différents)', () => {
    const keys = THEMES.map((t) => {
      const s = SOUNDSCAPES[t.id];
      return `${s.bpm}/${s.root}/${s.scale.join()}`;
    });
    expect(new Set(keys).size).toBe(THEMES.length);
  });

  THEMES.forEach((t) => {
    it(`${t.name} : boucle de 12 à 24 s (assez longue pour ne pas lasser, assez courte pour la mémoire)`, () => {
      const s = loopSeconds(SOUNDSCAPES[t.id]);
      expect(s).toBeGreaterThanOrEqual(12);
      expect(s).toBeLessThanOrEqual(24);
    });
  });
});
