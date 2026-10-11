import { describe, it, expect } from 'vitest';
import { Game, CONFIG } from './game';
import { parseLevel, parseMap } from './level';

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

  it('compte les décollages (pour le son du saut), pas les frames où le saut est tenu', () => {
    const g = new Game(flat);
    expect(g.jumps).toBe(0);
    run(g, 0.2, true);
    expect(g.jumps).toBe(1);
    run(g, 2, true); // saut tenu : le cube re-saute à chaque atterrissage
    expect(g.jumps).toBeGreaterThan(1);
    const n = g.jumps;
    run(g, 2, false);
    expect(g.jumps).toBe(n);
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


const E = '..........................';
const lane = (idx: number, row: string) => Array.from({ length: 5 }, (_, i) => (i === idx ? row : E));
const run2 = (g: Game, seconds: number, steer: number, jump = false) => {
  const steps = Math.round(seconds / CONFIG.dt);
  for (let i = 0; i < steps; i++) g.step(jump && i === 0, steer);
};

describe('Game, déplacement latéral', () => {
  it('sans direction, le cube reste au centre', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.5, 0);
    expect(g.player.z).toBe(0);
  });

  it('va à droite (z positif) à la vitesse latérale', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.1, 1);
    expect(g.player.z).toBeCloseTo(CONFIG.lateralSpeed * 0.1, 1);
  });

  it('va à gauche (z négatif)', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.1, -1);
    expect(g.player.z).toBeCloseTo(-CONFIG.lateralSpeed * 0.1, 1);
  });

  it('une inclinaison partielle donne une vitesse proportionnelle', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.1, 0.5);
    expect(g.player.z).toBeCloseTo(CONFIG.lateralSpeed * 0.05, 1);
  });

  it('une direction hors de [-1, 1] est bornée', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.1, 5);
    expect(g.player.z).toBeCloseTo(CONFIG.lateralSpeed * 0.1, 1);
  });

  it('reste dans la piste (bords à ±2,5)', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 1, 1);
    expect(g.player.z).toBeCloseTo(2, 5);
    run2(g, 1, -1);
    run2(g, 1, -1);
    expect(g.player.z).toBeCloseTo(-2, 5);
  });

  it('un bloc haut bloque le déplacement latéral sans tuer', () => {
    const wall = Array.from({ length: 30 }, () => '3').join('');
    const g = new Game(parseMap(['..............................', '..............................', '..............................', wall, '..............................']));
    run2(g, 1, 1);
    expect(g.status).toBe('running');
    expect(g.player.z).toBeLessThanOrEqual(1e-9);
  });

  it('contourne un obstacle en changeant de couloir', () => {
    const g = new Game(parseMap(lane(2, '.....3......')));
    run2(g, 0.2, 1);
    run2(g, 1.2, 0);
    expect(g.status).toBe('running');
    expect(g.player.x).toBeGreaterThan(8);
  });

  it('percute le même obstacle sans changer de couloir', () => {
    const g = new Game(parseMap(lane(2, '.....3......')));
    run2(g, 1.2, 0);
    expect(g.status).toBe('dead');
  });

  it('un pic voisin ne touche pas le cube au centre', () => {
    const g = new Game(parseMap(lane(0, '.....^.......')));
    run2(g, 1.5, 0);
    expect(g.status).toBe('running');
  });

  it('mais tue le cube qui passe dessus', () => {
    const g = new Game(parseMap(lane(0, '.....^.......')));
    run2(g, 0.3, -1);
    run2(g, 1.2, 0);
    expect(g.status).toBe('dead');
  });

  it('atterrit sur une pile de 2 blocs puis retombe en la quittant sur le côté', () => {
    const g = new Game(parseMap(lane(2, '.....22222222222.....')));
    while (g.player.x < 2.5) g.step(false);
    g.step(true);
    while (g.player.x < 8) g.step(false);
    expect(g.player.y).toBe(2);
    expect(g.player.grounded).toBe(true);
    run2(g, 0.5, 1);
    expect(g.player.y).toBe(0);
    expect(g.status).toBe('running');
  });

  it('update(frameDt, jump, steer) reste déterministe quel que soit le FPS', () => {
    const lvl = parseMap(lane(2, E));
    const a = new Game(lvl), b = new Game(lvl);
    for (let i = 0; i < 60; i++) a.update(1 / 60, false, 0.6);
    for (let i = 0; i < 144; i++) b.update(1 / 144, false, 0.6);
    expect(a.player.z).toBeCloseTo(b.player.z, 5);
  });

  it('restart remet z à zéro', () => {
    const g = new Game(parseMap(lane(2, '..3.........')));
    run2(g, 0.1, 1);
    run2(g, 1, 0);
    g.restart();
    expect(g.player.z).toBe(0);
    expect(g.player.prevZ).toBe(0);
  });

  it('snapshot/restore conservent la position latérale', () => {
    const g = new Game(parseMap(lane(2, E)));
    run2(g, 0.1, 1);
    const s = g.snapshot();
    run2(g, 0.3, -1);
    g.restore(s);
    expect(g.player.z).toBeCloseTo(CONFIG.lateralSpeed * 0.1, 1);
  });
});
