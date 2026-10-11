export interface RollPose { cx: number; cy: number; angle: number }

const QUARTER = Math.PI / 2;

/**
 * Pose d'un cube de côté 1 qui roule sans glisser sur le sol.
 * `d` = distance parcourue (bord arrière du cube). Chaque case parcourue
 * correspond à un quart de tour autour de l'arête avant : 4 cases = 1 tour.
 */
export function rollPose(d: number, out: RollPose = { cx: 0, cy: 0, angle: 0 }): RollPose {
  const n = Math.floor(d);
  const t = (d - n) * QUARTER;
  const c = Math.cos(t), s = Math.sin(t);
  out.cx = n + 1 + 0.5 * (s - c); // pivot (n + 1, 0) + centre (-0.5, 0.5) tourné de -t
  out.cy = 0.5 * (s + c);
  out.angle = -d * QUARTER;
  return out; // `out` réutilisable : zéro allocation par frame
}
