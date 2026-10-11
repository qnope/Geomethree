import { Game } from './game';
import type { Level } from './level';

/**
 * Cherche une séquence de sauts qui termine le niveau (DFS sur les instants
 * où le joueur est au sol). Retourne les indices de pas où sauter, ou null.
 * Sert aux tests : garantit que chaque niveau livré est faisable.
 */
export function solve(level: Level, decisionEvery = 4): number[] | null {
  const failed = new Set<string>();
  const game = new Game(level);

  const dfs = (step: number, jumps: number[]): number[] | null => {
    const snap = game.snapshot();
    const key = `${Math.round(game.player.x * 8)}:${game.player.y}`;
    if (failed.has(key)) return null;
    for (const jump of [false, true]) {
      game.restore(snap);
      let s = step;
      game.step(jump);
      s++;
      while (game.status === 'running' && (!game.player.grounded || s % decisionEvery !== 0)) {
        game.step(false);
        s++;
      }
      if (game.status === 'won') return jump ? [...jumps, step] : jumps;
      if (game.status === 'running') {
        const r = dfs(s, jump ? [...jumps, step] : jumps);
        if (r) return r;
      }
    }
    game.restore(snap);
    failed.add(key);
    return null;
  };
  return dfs(0, []);
}
