export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** `unlocked` : indice du dernier niveau débloqué. `best[i]` : meilleure progression (0…1) du niveau i. */
export interface Progress { unlocked: number; best: number[] }

const KEY = 'geomethree.progress.v1';

export const emptyProgress = (levels: number): Progress => ({ unlocked: 0, best: Array(levels).fill(0) });

export const isUnlocked = (p: Progress, level: number): boolean => level >= 0 && level <= p.unlocked;

const clamp01 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function loadProgress(storage: StorageLike, levels: number): Progress {
  const p = emptyProgress(levels);
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return p;
    const d = JSON.parse(raw) as { unlocked?: unknown; best?: unknown };
    if (typeof d.unlocked !== 'number' || !Array.isArray(d.best)) return p;
    p.best = p.best.map((_, i) => clamp01(d.best && (d.best as unknown[])[i]));
    p.unlocked = Math.max(0, Math.min(levels - 1, Math.floor(d.unlocked)));
    // Des niveaux ont été ajoutés après le dernier niveau terminé : le suivant s'ouvre.
    if (p.best[p.unlocked] === 1 && p.unlocked + 1 < levels) p.unlocked++;
    return p;
  } catch {
    return emptyProgress(levels);
  }
}

export function saveProgress(storage: StorageLike, p: Progress): void {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    // stockage plein ou bloqué (navigation privée) : on joue quand même, sans sauvegarde
  }
}

/** Enregistre une tentative. Retourne true si la progression a changé (donc à sauvegarder). */
export function recordRun(p: Progress, level: number, fraction: number, won: boolean): boolean {
  let changed = false;
  const f = won ? 1 : clamp01(fraction);
  if (f > p.best[level]) { p.best[level] = f; changed = true; }
  if (won && level === p.unlocked && level + 1 < p.best.length) { p.unlocked = level + 1; changed = true; }
  return changed;
}
