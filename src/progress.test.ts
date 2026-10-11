import { describe, it, expect } from 'vitest';
import { emptyProgress, loadProgress, saveProgress, recordRun, isUnlocked, type StorageLike } from './progress';

const memory = (init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('progress', () => {
  it('démarre avec seul le niveau 1 débloqué', () => {
    const p = emptyProgress(5);
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(false);
    expect(p.best).toEqual([0, 0, 0, 0, 0]);
  });
  it('garde le meilleur pourcentage seulement', () => {
    const p = emptyProgress(3);
    recordRun(p, 0, 0.4, false);
    recordRun(p, 0, 0.2, false);
    expect(p.best[0]).toBe(0.4);
  });
  it('gagner un niveau débloque le suivant et met 100 %', () => {
    const p = emptyProgress(3);
    expect(recordRun(p, 0, 1, true)).toBe(true);
    expect(p.best[0]).toBe(1);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });
  it('ne dépasse pas le dernier niveau', () => {
    const p = emptyProgress(2);
    recordRun(p, 0, 1, true);
    recordRun(p, 1, 1, true);
    expect(p.unlocked).toBe(1);
  });
  it('recordRun indique si quelque chose a changé', () => {
    const p = emptyProgress(2);
    expect(recordRun(p, 0, 0.5, false)).toBe(true);
    expect(recordRun(p, 0, 0.3, false)).toBe(false);
  });
  it('sauvegarde puis recharge', () => {
    const st = memory();
    const p = emptyProgress(3);
    recordRun(p, 0, 1, true);
    recordRun(p, 1, 0.6, false);
    saveProgress(st, p);
    expect(loadProgress(st, 3)).toEqual(p);
  });
  it('ignore une sauvegarde corrompue ou absente', () => {
    expect(loadProgress(memory(), 3)).toEqual(emptyProgress(3));
    expect(loadProgress(memory({ 'geomethree.progress.v1': '{pas du json' }), 3)).toEqual(emptyProgress(3));
    expect(loadProgress(memory({ 'geomethree.progress.v1': '{"unlocked":"x","best":5}' }), 3)).toEqual(emptyProgress(3));
  });
  it('adapte une ancienne sauvegarde au nombre de niveaux actuel', () => {
    const st = memory({ 'geomethree.progress.v1': JSON.stringify({ unlocked: 9, best: [1, 0.5] }) });
    const p = loadProgress(st, 4);
    expect(p.best).toEqual([1, 0.5, 0, 0]);
    expect(p.unlocked).toBe(3);
  });
  it('ne plante pas si le stockage est indisponible', () => {
    const broken: StorageLike = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadProgress(broken, 2)).toEqual(emptyProgress(2));
    expect(() => saveProgress(broken, emptyProgress(2))).not.toThrow();
  });
});
