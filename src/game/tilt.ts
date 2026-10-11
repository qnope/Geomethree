const RAD = Math.PI / 180;

/**
 * Inclinaison latérale du téléphone, de -1 (gauche) à +1 (droite) : sinus de l'angle dont
 * le côté droit de l'écran (tel que l'utilisateur le voit) est plus bas que le gauche.
 *
 * Basé sur la direction de la gravité dans le repère de l'appareil, déduite de beta/gamma
 * (rotations W3C Z-X'-Y'') : « haut monde » = (-cosβ·sinγ, sinβ, cosβ·cosγ). Cela couvre
 * autant le téléphone penché comme un plateau que tourné comme un volant, en portrait comme en paysage.
 * `screenAngle` = screen.orientation.angle.
 */
export function lateralTilt(beta: number, gamma: number, screenAngle: number): number {
  const b = beta * RAD, g = gamma * RAD;
  const upX = -Math.cos(b) * Math.sin(g);
  const upY = Math.sin(b);
  // Axe « droite de l'utilisateur » exprimé dans le repère de l'appareil.
  const a = (((screenAngle % 360) + 360) % 360);
  let rx = 1, ry = 0;
  if (a === 90) { rx = 0; ry = -1; }
  else if (a === 180) { rx = -1; ry = 0; }
  else if (a === 270) { rx = 0; ry = 1; }
  // Le côté droit est plus bas quand « haut monde » penche vers la gauche de l'utilisateur.
  return -(upX * rx + upY * ry);
}

export interface TiltOptions { deadzoneDeg?: number; fullDeg?: number }

/** Direction -1…1 : zone morte (tremblements), puis réponse linéaire jusqu'à la pleine échelle. */
export function steerFromTilt(tilt: number, { deadzoneDeg = 3, fullDeg = 22 }: TiltOptions = {}): number {
  const angle = Math.asin(Math.max(-1, Math.min(1, tilt))) / RAD;
  const mag = (Math.abs(angle) - deadzoneDeg) / (fullDeg - deadzoneDeg);
  if (mag <= 0) return 0;
  return Math.sign(angle) * Math.min(1, mag);
}
