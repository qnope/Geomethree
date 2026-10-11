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
  size: 1,
  landTolerance: 0.05,
  lateralSpeed: 8,    // unités / s à pleine inclinaison
  maxZ: TRACK_HALF - 0.5, // centre du cube : la piste fait ±2,5 et le cube 1 de large
} as const;

// Hitbox réduite des pics, comme dans Geometry Dash, pour un jeu plus juste.
const SPIKE_BOX = { dx: 0.35, w: 0.3, h: 0.55, dz: 0.2 };

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
    for (let i = this.cursor; i < obs.length; i++) {
      const o = obs[i];
      if (o.x >= p.x + size) break; // trié par x : rien plus loin ne peut toucher
      const ob = this.oBox;
      if (o.kind === 'spike') {
        ob.x = o.x + SPIKE_BOX.dx; ob.y = o.y; ob.z = o.z0 + SPIKE_BOX.dz;
        ob.w = SPIKE_BOX.w; ob.h = SPIKE_BOX.h; ob.d = o.z1 - o.z0 - 2 * SPIKE_BOX.dz;
        if (overlaps(pb, ob)) return this.die();
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
