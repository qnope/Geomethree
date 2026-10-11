import { overlaps, type Box } from './collision';
import type { Level } from './level';

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
} as const;

// Hitbox réduite des pics, comme dans Geometry Dash, pour un jeu plus juste.
const SPIKE_BOX = { dx: 0.35, w: 0.3, h: 0.55 };

export type Status = 'running' | 'dead' | 'won';

export interface Player { x: number; y: number; vy: number; grounded: boolean; prevX: number; prevY: number }

export interface Snapshot { player: Player; status: Status; acc: number; cursor: number }

export class Game {
  readonly player: Player = { x: 0, y: 0, vy: 0, grounded: true, prevX: 0, prevY: 0 };
  status: Status = 'running';
  attempts = 1;
  private acc = 0;
  private cursor = 0; // premier obstacle encore potentiellement atteignable
  // Boîtes réutilisées : zéro allocation par pas de simulation.
  private readonly pBox: Box = { x: 0, y: 0, w: CONFIG.size, h: CONFIG.size };
  private readonly oBox: Box = { x: 0, y: 0, w: 1, h: 1 };

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
    Object.assign(this.player, { x: 0, y: 0, vy: 0, grounded: true, prevX: 0, prevY: 0 });
    this.status = 'running';
    this.acc = 0;
    this.cursor = 0;
    this.attempts++;
  }

  update(frameDt: number, jumpHeld: boolean): void {
    this.acc += Math.min(frameDt, CONFIG.maxFrameDt);
    while (this.acc >= CONFIG.dt - 1e-9) {
      this.acc -= CONFIG.dt;
      this.step(jumpHeld);
    }
    if (this.acc < 0) this.acc = 0;
  }

  step(jumpHeld: boolean): void {
    if (this.status !== 'running') return;
    const p = this.player;
    const { dt, speed, gravity, jumpVelocity, size, landTolerance } = CONFIG;
    p.prevX = p.x;
    p.prevY = p.y;

    if (jumpHeld && p.grounded) p.vy = jumpVelocity;
    p.vy -= gravity * dt;
    p.x += speed * dt;
    p.y += p.vy * dt;
    p.grounded = false;

    if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; }

    const obs = this.level.obstacles;
    while (this.cursor < obs.length && obs[this.cursor].x + 1 <= p.x) this.cursor++;

    const pb = this.pBox;
    pb.x = p.x; pb.y = p.y;
    for (let i = this.cursor; i < obs.length; i++) {
      const o = obs[i];
      if (o.x >= p.x + size) break; // trié par x : rien plus loin ne peut toucher
      const ob = this.oBox;
      if (o.kind === 'spike') {
        ob.x = o.x + SPIKE_BOX.dx; ob.y = o.y; ob.w = SPIKE_BOX.w; ob.h = SPIKE_BOX.h;
        if (overlaps(pb, ob)) return this.die();
      } else {
        ob.x = o.x; ob.y = o.y; ob.w = 1; ob.h = 1;
        if (!overlaps(pb, ob)) continue;
        const top = o.y + 1;
        if (p.vy <= 0 && p.prevY >= top - landTolerance) {
          p.y = top; p.vy = 0; p.grounded = true; pb.y = top;
        } else {
          return this.die();
        }
      }
    }

    if (p.x >= this.level.length) this.status = 'won';
  }

  private die(): void {
    this.status = 'dead';
  }
}
