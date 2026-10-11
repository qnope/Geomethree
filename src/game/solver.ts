import { Game, type Status } from './game';
import type { Level } from './level';

/** Décision prise quand le cube est au sol : saut ou non, direction tenue jusqu'à la décision suivante. */
export interface Decision { step: number; jump: boolean; steer: -1 | 0 | 1 }

const STEERS: readonly (-1 | 0 | 1)[] = [0, 1, -1];

/**
 * Cherche un enchaînement de décisions qui termine le niveau (DFS sur les instants où le
 * cube est au sol, avec mémoïsation des impasses). Retourne le plan, ou null si le niveau
 * est impossible pour ce solveur. Sert aux tests : garantit que chaque niveau livré est faisable.
 * `decisionEvery` : nombre minimal de pas (1/240 s) entre deux décisions, à n'importe quel instant,
 * pour imiter un joueur qui ne peut pas agir plus vite que ça.
 */
export function solve(level: Level, decisionEvery = 6): Decision[] | null {
  const failed = new Set<string>();
  const game = new Game(level);
  const plan: Decision[] = [];

  const dfs = (step: number): boolean => {
    const p = game.player;
    const key = `${Math.round(p.x * 16)}:${p.y.toFixed(2)}:${Math.round(p.z * 4)}`;
    if (failed.has(key)) return false;
    const snap = game.snapshot();
    for (const jump of [false, true]) {
      for (const steer of STEERS) {
        game.restore(snap);
        let s = step;
        game.step(jump, steer);
        s++;
        while (game.status === 'running' && (!p.grounded || s - step < decisionEvery)) {
          game.step(false, steer);
          s++;
        }
        if (game.status === 'dead') continue;
        plan.push({ step, jump, steer });
        if (game.status === 'won' || dfs(s)) return true;
        plan.pop();
      }
    }
    game.restore(snap);
    failed.add(key);
    return false;
  };

  return dfs(0) ? plan : null;
}

/** Rejoue un plan sur un jeu neuf, retourne l'état final. */
export function replay(level: Level, plan: Decision[]): Status {
  const game = new Game(level);
  const maxSteps = Math.ceil((level.length / 1) / 4 / (1 / 240)) * 4; // large marge, évite une boucle infinie
  let i = 0;
  let steer = 0;
  for (let step = 0; step < maxSteps && game.status === 'running'; step++) {
    let jump = false;
    if (i < plan.length && plan[i].step === step) {
      jump = plan[i].jump;
      steer = plan[i].steer;
      i++;
    }
    game.step(jump, steer);
  }
  return game.status;
}
