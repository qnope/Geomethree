import { describe, it, expect } from 'vitest';
import { Game, CONFIG } from './game';
import { parseLevel } from './level';

const flat = parseLevel(['                                        ']);
const run = (g: Game, seconds: number, jump = false) => {
  const steps = Math.round(seconds / CONFIG.dt);
  for (let i = 0; i < steps; i++) g.step(jump);
};

describe('Game', () => {
  it('le joueur avance automatiquement à vitesse constante', () => {
    const g = new Game(flat);
    run(g, 1);
    expect(g.player.x).toBeCloseTo(CONFIG.speed, 1);
  });

  it('reste posé au sol sans saut', () => {
    const g = new Game(flat);
    run(g, 0.5);
    expect(g.player.y).toBe(0);
    expect(g.player.grounded).toBe(true);
  });

  it('saute quand on appuie et retombe au sol', () => {
    const g = new Game(flat);
    g.step(true);
    run(g, 0.1);
    expect(g.player.y).toBeGreaterThan(0.5);
    run(g, 1.5);
    expect(g.player.y).toBe(0);
    expect(g.player.grounded).toBe(true);
  });

  it('ne peut pas sauter en l\'air (pas de double saut)', () => {
    const g = new Game(flat);
    g.step(true);
    run(g, 0.05);
    const vy = g.player.vy;
    g.step(true);
    expect(g.player.vy).toBeLessThan(vy);
  });

  it('la hauteur de saut permet de franchir un bloc (≥ 2 unités)', () => {
    const g = new Game(flat);
    g.step(true);
    let maxY = 0;
    for (let i = 0; i < 400; i++) { g.step(false); maxY = Math.max(maxY, g.player.y); }
    expect(maxY).toBeGreaterThan(2);
    expect(maxY).toBeLessThan(3);
  });

  it('meurt en touchant un pic', () => {
    const g = new Game(parseLevel(['     ^          ']));
    run(g, 1);
    expect(g.status).toBe('dead');
  });

  it('survit au pic en sautant au bon moment', () => {
    const g = new Game(parseLevel(['     ^          ']));
    while (g.player.x < 3) g.step(false);
    g.step(true);
    run(g, 0.8);
    expect(g.status).toBe('running');
  });

  it('peut atterrir sur un bloc', () => {
    const g = new Game(parseLevel(["     ######       "]));
    while (g.player.x < 3) g.step(false);
    g.step(true);
    while (g.player.x < 9.5) g.step(false); // toujours au-dessus du bloc (5 → 11)
    expect(g.status).toBe('running');
    expect(g.player.y).toBe(1);
    expect(g.player.grounded).toBe(true);
  });

  it('meurt en heurtant le flanc d\'un bloc', () => {
    const g = new Game(parseLevel(['     #          ']));
    run(g, 1);
    expect(g.status).toBe('dead');
  });

  it('tombe en quittant le bord d\'un bloc', () => {
    const g = new Game(parseLevel(['     ###          ']));
    while (g.player.x < 3) g.step(false);
    g.step(true);
    run(g, 1.2);
    expect(g.player.y).toBe(0);
    expect(g.status).toBe('running');
  });

  it('gagne en atteignant la fin du niveau', () => {
    const g = new Game(parseLevel(['        ']));
    run(g, 2);
    expect(g.status).toBe('won');
  });

  it('restart remet tout à zéro et compte les essais', () => {
    const g = new Game(parseLevel(['     #    ']));
    run(g, 1);
    g.restart();
    expect(g.status).toBe('running');
    expect(g.player.x).toBe(0);
    expect(g.attempts).toBe(2);
  });

  it('progress donne la fraction du niveau parcourue', () => {
    const g = new Game(parseLevel(['          ']));
    run(g, 0.5);
    expect(g.progress).toBeCloseTo((CONFIG.speed * 0.5) / 10, 1);
  });

  it('update(frameDt) avance en pas fixes et est déterministe', () => {
    const a = new Game(flat), b = new Game(flat);
    for (let i = 0; i < 60; i++) a.update(1 / 60, false);
    for (let i = 0; i < 144; i++) b.update(1 / 144, false);
    expect(a.player.x).toBeCloseTo(b.player.x, 5);
  });

  it('update borne un gros dt (onglet en arrière-plan) pour éviter la spirale', () => {
    const g = new Game(flat);
    g.update(5, false);
    expect(g.player.x).toBeLessThanOrEqual(CONFIG.speed * CONFIG.maxFrameDt + 1e-9);
  });
});

describe('Game snapshot', () => {
  it('restore revient exactement à l\'état sauvegardé', () => {
    const g = new Game(parseLevel(['        ^                ']));
    run(g, 0.2);
    const s = g.snapshot();
    run(g, 1);
    g.restore(s);
    expect(g.player.x).toBeCloseTo(CONFIG.speed * 0.2, 1);
    expect(g.status).toBe('running');
  });
});
