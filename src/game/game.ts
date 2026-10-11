import { overlaps, type Box } from './collision';
import { TRACK_HALF, type Level, type Obstacle } from './level';

export const CONFIG = {
  dt: 1 / 240,        // pas fixe de simulation (déterministe quel que soit le FPS)
  maxFrameDt: 0.1,    // borne anti-spirale quand l'onglet revient au premier plan
  // Vitesse réduite pour que la roulade physique (1 tour = 4 cases) reste lisible : 7 u/s ≈ 1,75 tour/s.
  // Gravité et impulsion suivent la vitesse au carré, donc la trajectoire du saut dans l'espace ne change pas
  // (hauteur 2,5, longueur 5 cases) et les niveaux restent faisables.
  speed: 7,           // unités / s
  gravity: 80 * 0.49,
  jumpVelocity: 20 * 0.7, // hauteur max = v² / 2g = 2.5
  padVelocity: 20 * 0.7 * Math.SQRT2, // tremplin : hauteur max 5, de quoi passer un mur (3)
  moverSpeed: 2.5,    // couloirs / s, vitesse latérale des mobiles
  size: 1,
  landTolerance: 0.05,
  lateralSpeed: 8,    // unités / s à pleine inclinaison
  maxZ: TRACK_HALF - 0.5, // centre du cube : la piste fait ±2,5 et le cube 1 de large
} as const;

// Hitbox réduite des pics et des mobiles, comme dans Geometry Dash, pour un jeu plus juste.
const SPIKE_BOX = { dx: 0.35, w: 0.3, h: 0.55, dz: 0.2 };
const MOVER_BOX = { dx: 0.15, w: 0.7, h: 0.75, dz: 0.15 };

/**
 * Bord gauche (z) de la case d'un mobile quand le cube est en `px` : il va et vient sur son rail à
 * `moverSpeed` couloirs par seconde, et part de `start` (vers la droite) quand le cube arrive à sa colonne.
 * Le cube avance à vitesse constante : sa position vaut une horloge, et la partie reste déterministe.
 */
export function moverZ(o: Obstacle, px: number): number {
  const span = o.z1 - o.z0 - 1; // course, en couloirs
  if (span <= 0) return o.z0;
  const u = (o.start ?? o.z0) - o.z0 + ((px - o.x) * CONFIG.moverSpeed) / CONFIG.speed;
  const m = ((u % (2 * span)) + 2 * span) % (2 * span); // aller (0 → span) puis retour
  return o.z0 + (m <= span ? m : 2 * span - m);
}

export type Status = 'running' | 'dead' | 'won';

export interface Player {
  x: number; y: number; z: number; vy: number; grounded: boolean;
  prevX: number; prevY: number; prevZ: number;
}

export interface Snapshot { player: Player; status: Status; acc: number; cursor: number }

export class Game {
  readonly player: Player = { x: 0, y: 0, z: 0, vy: 0, grounded: true, prevX: 0, prevY: 0, prevZ: 0 };
  status: Status = 'running';
  attempts = 1;
  /** Nombre de décollages depuis la création (le son du saut compare avant / après update). */
  jumps = 0;
  private acc = 0;
  private cursor = 0; // premier obstacle encore potentiellement atteignable
  // Boîtes réutilisées : zéro allocation par pas de simulation.
  private readonly pBox: Box = { x: 0, y: 0, z: 0, w: CONFIG.size, h: CONFIG.size, d: CONFIG.size };
  private readonly oBox: Box = { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 };

  constructor(readonly level: Level) {}

  get progress(): number {
    return Math.min(1, this.player.x / this.level.length);
  }

  /** Fraction de pas restante, pour interpoler le rendu entre deux pas. */
  get alpha(): number {
    return this.acc / CONFIG.dt;
  }

  snapshot(): Snapshot {
    return { player: { ...this.player }, status: this.status, acc: this.acc, cursor: this.cursor };
  }

  restore(s: Snapshot): void {
    Object.assign(this.player, s.player);
    this.status = s.status;
    this.acc = s.acc;
    this.cursor = s.cursor;
  }

  restart(): void {
    Object.assign(this.player, { x: 0, y: 0, z: 0, vy: 0, grounded: true, prevX: 0, prevY: 0, prevZ: 0 });
    this.status = 'running';
    this.acc = 0;
    this.cursor = 0;
    this.attempts++;
  }

  update(frameDt: number, jumpHeld: boolean, steer = 0): void {
    this.acc += Math.min(frameDt, CONFIG.maxFrameDt);
    while (this.acc >= CONFIG.dt - 1e-9) {
      this.acc -= CONFIG.dt;
      this.step(jumpHeld, steer);
    }
    if (this.acc < 0) this.acc = 0;
  }

  /** Un pas de simulation. `steer` : -1 (gauche) … +1 (droite). */
  step(jumpHeld: boolean, steer = 0): void {
    if (this.status !== 'running') return;
    const p = this.player;
    const { dt, speed, gravity, jumpVelocity, size, landTolerance, lateralSpeed, maxZ } = CONFIG;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevZ = p.z;

    // Latéral d'abord : un bloc qui barre le chemin bloque (on glisse le long), il ne tue pas.
    if (steer !== 0) {
      const nz = Math.max(-maxZ, Math.min(maxZ, p.z + Math.max(-1, Math.min(1, steer)) * lateralSpeed * dt));
      if (nz !== p.z && !this.hitsBlock(p.x, p.y, nz)) p.z = nz;
    }

    if (jumpHeld && p.grounded) { p.vy = jumpVelocity; this.jumps++; }
    p.vy -= gravity * dt;
    p.x += speed * dt;
    p.y += p.vy * dt;
    p.grounded = false;

    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }

    const obs = this.level.obstacles;
    while (this.cursor < obs.length && obs[this.cursor].x + 1 <= p.x) this.cursor++;

    const pb = this.pBox;
    pb.x = p.x; pb.y = p.y; pb.z = p.z - size / 2;
    const cx = p.x + size / 2; // centre du cube au sol : fosses et tremplins ne regardent que lui
    for (let i = this.cursor; i < obs.length; i++) {
      const o = obs[i];
      if (o.x >= p.x + size) break; // trié par x : rien plus loin ne peut toucher
      const ob = this.oBox;
      if (o.kind === 'spike' || o.kind === 'mover') {
        // Hitbox réduite ; celle du mobile suit sa case sur le rail.
        const spike = o.kind === 'spike', box = spike ? SPIKE_BOX : MOVER_BOX;
        const z0 = spike ? o.z0 : moverZ(o, p.x), d = spike ? o.z1 - o.z0 : 1;
        ob.x = o.x + box.dx; ob.y = o.y; ob.z = z0 + box.dz;
        ob.w = box.w; ob.h = box.h; ob.d = d - 2 * box.dz;
        if (overlaps(pb, ob)) return this.die();
      } else if (o.kind === 'pit' || o.kind === 'pad') {
        if (p.y >= o.y + o.h || cx < o.x || cx >= o.x + 1 || p.z < o.z0 || p.z >= o.z1) continue;
        if (o.kind === 'pit') return this.die();
        if (p.vy <= 0) { p.vy = CONFIG.padVelocity; p.grounded = false; this.jumps++; }
      } else {
        this.blockBox(o);
        if (!overlaps(pb, ob)) continue;
        const top = o.y + o.h;
        if (p.vy <= 0 && p.prevY >= top - landTolerance) {
          p.y = top; p.vy = 0; p.grounded = true; pb.y = top;
        } else {
          return this.die();
        }
      }
    }

    if (p.x >= this.level.length) this.status = 'won';
  }

  private blockBox(o: Obstacle): Box {
    const ob = this.oBox;
    ob.x = o.x; ob.y = o.y; ob.z = o.z0; ob.w = 1; ob.h = o.h; ob.d = o.z1 - o.z0;
    return ob;
  }

  /** Le cube, placé en (x, y, z), chevauche-t-il un bloc ? (balayage des cellules proches seulement) */
  private hitsBlock(x: number, y: number, z: number): boolean {
    const obs = this.level.obstacles;
    const pb = this.pBox;
    pb.x = x; pb.y = y; pb.z = z - CONFIG.size / 2;
    for (let i = this.cursor; i < obs.length; i++) {
      const o = obs[i];
      if (o.x >= x + CONFIG.size) break;
      if (o.kind === 'block' && overlaps(pb, this.blockBox(o))) return true;
    }
    return false;
  }

  private die(): void {
    this.status = 'dead';
  }
}
