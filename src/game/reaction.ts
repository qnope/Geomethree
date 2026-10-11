import { CONFIG } from './game';
import type { Level } from './level';

/** Deux colonnes d'obstacles séparées de moins que ça (en secondes) forment un seul défi : pas de pause pour décider. */
export const MERGE_SECONDS = 0.5;

export const REACTION_FIRST = 10;  // s, premier niveau
export const REACTION_LAST = 2.5;  // s, dernier niveau

export interface Challenge { x0: number; x1: number }

/** Groupes d'obstacles consécutifs, de l'entrée x0 à la sortie x1 (en unités). */
export function challenges(level: Level): Challenge[] {
  const mergeCols = MERGE_SECONDS * CONFIG.speed;
  const out: Challenge[] = [];
  for (const o of level.obstacles) { // trié par x
    const last = out[out.length - 1];
    if (last && o.x - last.x1 < mergeCols) last.x1 = Math.max(last.x1, o.x + 1);
    else out.push({ x0: o.x, x1: o.x + 1 });
  }
  return out;
}

/**
 * « Temps de réaction » du niveau : le plus petit temps libre (en secondes) entre la fin d'un défi
 * et le début du suivant. Plus il est court, plus il faut enchaîner vite les décisions.
 */
export function reactionTime(level: Level): number {
  const cs = challenges(level);
  let min = Infinity;
  for (let i = 1; i < cs.length; i++) min = Math.min(min, (cs[i].x0 - cs[i - 1].x1) / CONFIG.speed);
  return min;
}

export const REACTION_HARD_FIRST = 2.2; // s, niveau 6
export const REACTION_HARD_LAST = 1;    // s, niveau 10

/**
 * Temps de réaction visé pour le niveau `i` (0 = niveau 1) : de 10 s à 2,5 s sur les niveaux 1 à 5,
 * puis de 2,2 s à 1 s sur les niveaux 6 à 10, linéaire dans chaque série.
 */
export function reactionTarget(i: number): number {
  if (i <= 4) return REACTION_FIRST + ((REACTION_LAST - REACTION_FIRST) * i) / 4;
  return REACTION_HARD_FIRST + ((REACTION_HARD_LAST - REACTION_HARD_FIRST) * (i - 5)) / 4;
}
