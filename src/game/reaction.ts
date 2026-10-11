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

/** Temps libres (en secondes) entre chaque défi et le suivant. */
export function reactionGaps(level: Level): number[] {
  const cs = challenges(level);
  return cs.slice(1).map((c, i) => (c.x0 - cs[i].x1) / CONFIG.speed);
}

/**
 * « Temps de réaction » du niveau : le plus petit temps libre (en secondes) entre la fin d'un défi
 * et le début du suivant. Plus il est court, plus il faut enchaîner vite les décisions.
 */
export function reactionTime(level: Level): number {
  return Math.min(...reactionGaps(level));
}

// Niveaux 6 à 10 : le temps de réaction varie dans le niveau, entre ces deux bornes.
export const REACTION_CALM = 2.5;  // s, zones calmes
export const REACTION_STRESS = 1;  // s, zones stressantes

/** Temps de réaction visé pour les niveaux 1 à 5 (`i` = 0…4) : de 10 s à 2,5 s, linéaire. */
export function reactionTarget(i: number): number {
  return REACTION_FIRST + ((REACTION_LAST - REACTION_FIRST) * i) / 4;
}
