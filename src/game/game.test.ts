import { describe, it, expect } from 'vitest';
import { Game, CONFIG, moverZ } from './game';
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

describe('Game, pause', () => {
  it('en pause, update ne fait plus rien : ni avance, ni saut, ni temps accumulé', () => {
    const g = new Game(flat);
    g.update(0.5, false);
    g.update(CONFIG.dt / 2, false);
    const x = g.player.x, alpha = g.alpha;
    expect(g.pause()).toBe(true);
    expect(g.paused).toBe(true);
    for (let i = 0; i < 60; i++) g.update(1 / 60, true, 1);
    expect(g.player.x).toBe(x);
    expect(g.player.y).toBe(0);
    expect(g.player.z).toBe(0);
    expect(g.jumps).toBe(0);
    expect(g.alpha).toBe(alpha); // l'image interpolée reste figée
  });

  it('reprend exactement là où elle s\'était arrêtée', () => {
    const a = new Game(flat), b = new Game(flat);
    a.update(0.5, false);
    a.pause();
    a.update(0.1, false);
    a.resume();
    expect(a.paused).toBe(false);
    a.update(0.5, false);
    b.update(0.5, false);
    b.update(0.5, false);
    expect(a.player.x).toBe(b.player.x);
  });

  it('on ne met en pause qu\'une partie en cours (pas un cube mort ni un niveau gagné)', () => {
    const dead = new Game(parseLevel(['  ^     ']));
    run(dead, 1);
    expect(dead.status).toBe('dead');
    expect(dead.pause()).toBe(false);
    expect(dead.paused).toBe(false);
    const won = new Game(parseLevel(['    ']));
    run(won, 1);
    expect(won.status).toBe('won');
    expect(won.pause()).toBe(false);
  });

  it('recommencer sort de la pause', () => {
    const g = new Game(flat);
    g.update(0.5, false);
    g.pause();
    g.restart();
    expect(g.paused).toBe(false);
    g.update(0.5, false);
    expect(g.player.x).toBeGreaterThan(0);
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

// Nouveaux types : fosse (_), poutre (T), tremplin (*), mobile (o sur son rail ~).
const at = (idx: number, row: string, width = 40) =>
  Array.from({ length: 5 }, (_, i) => (i === idx ? row.padEnd(width, '.') : '.'.repeat(width)));
/** Avance sans sauter jusqu'à ce que le cube soit en `x`, puis saute. */
const jumpAt = (g: Game, x: number, steer = 0) => {
  while (g.player.x < x && g.status === 'running') g.step(false, steer);
  g.step(true, steer);
};
const runUntil = (g: Game, x: number, steer = 0) => {
  while (g.player.x < x && g.status === 'running') g.step(false, steer);
};

describe('Game, fosse', () => {
  it('le cube qui roule dans une fosse tombe et meurt', () => {
    const g = new Game(parseMap(at(2, '........_')));
    runUntil(g, 12);
    expect(g.status).toBe('dead');
    expect(g.player.x).toBeGreaterThan(7.5); // dès que son centre est au-dessus de la fosse
    expect(g.player.x).toBeLessThan(8.5);
  });

  it('une fosse dans le couloir voisin ne tue pas', () => {
    const g = new Game(parseMap(at(1, '........___')));
    runUntil(g, 20);
    expect(g.status).toBe('running');
  });

  it('on franchit une fosse de 3 cases en sautant', () => {
    const g = new Game(parseMap(at(2, '........___')));
    jumpAt(g, 6.5);
    runUntil(g, 20);
    expect(g.status).toBe('running');
  });

  it('retomber dans une fosse tue', () => {
    const g = new Game(parseMap(at(2, '........___')));
    jumpAt(g, 4.5); // saut de 5 cases : retombe vers x = 9,5, au milieu de la fosse
    runUntil(g, 20);
    expect(g.status).toBe('dead');
  });
});

describe('Game, poutre', () => {
  it('on passe sous une poutre sans sauter', () => {
    const g = new Game(parseMap(at(2, '........TTT')));
    runUntil(g, 20);
    expect(g.status).toBe('running');
  });

  it('sauter sous une poutre tue', () => {
    const g = new Game(parseMap(at(2, '........TTT')));
    jumpAt(g, 6);
    runUntil(g, 20);
    expect(g.status).toBe('dead');
  });

  it('on ne peut pas atterrir dessus : elle est plus haute que le saut', () => {
    const lvl = parseMap(at(2, '........TTTTTTTTTT'));
    let landed = 0;
    for (let x = 0; x < 8; x += 0.05) {
      const g = new Game(lvl);
      jumpAt(g, x);
      while (g.player.x < 22 && g.status === 'running') {
        g.step(false);
        if (g.player.grounded && g.player.y > 0) landed++;
      }
    }
    expect(landed).toBe(0);
  });

  it('ne gêne pas le déplacement latéral au sol', () => {
    const g = new Game(parseMap(at(3, '..TTTTTTTTTTTTTTTTTTTT')));
    runUntil(g, 3, 0);
    runUntil(g, 15, 1);
    expect(g.status).toBe('running');
    expect(g.player.z).toBeCloseTo(CONFIG.maxZ, 5);
  });
});

describe('Game, tremplin', () => {
  it('propulse plus haut qu\'un saut, assez pour passer un mur', () => {
    const g = new Game(parseMap(at(2, '........*')));
    let maxY = 0;
    while (g.player.x < 20) { g.step(false); maxY = Math.max(maxY, g.player.y); }
    expect(maxY).toBeGreaterThan(4);
    expect(maxY).toBeLessThan(6);
    expect(g.jumps).toBe(1); // compte comme un décollage (son du saut)
  });

  it('passe par-dessus un mur sans passage', () => {
    const map = Array.from({ length: 5 }, (_, i) => (i === 2 ? '........*..M' : '...........M').padEnd(30, '.'));
    const g = new Game(parseMap(map));
    runUntil(g, 25);
    expect(g.status).toBe('running');
    const sans = new Game(parseMap(map.map((r) => r.replace('*', '.'))));
    runUntil(sans, 25);
    expect(sans.status).toBe('dead');
  });

  it('ne fait rien au cube qui le survole', () => {
    const g = new Game(parseMap(at(2, '........*')));
    jumpAt(g, 6);
    runUntil(g, 20);
    expect(g.jumps).toBe(1);
  });

  it('dans le couloir voisin, il ne propulse pas', () => {
    const g = new Game(parseMap(at(1, '........*')));
    runUntil(g, 20);
    expect(g.jumps).toBe(0);
  });
});

describe('Game, mobile', () => {
  const rail = (x: number, lanes: string) => // `lanes` : 5 caractères, couloir gauche → droit
    Array.from({ length: 5 }, (_, i) => ('.'.repeat(x) + lanes[i]).padEnd(40, '.'));

  it('moverZ : part de sa case o quand le cube arrive à sa colonne', () => {
    const lvl = parseMap(rail(10, '~o~~~'));
    expect(moverZ(lvl.obstacles[0], 10)).toBeCloseTo(-1.5, 9);
  });

  it('moverZ : avance de moverSpeed couloirs par seconde, vers la droite d\'abord', () => {
    const o = parseMap(rail(10, '~o~~~')).obstacles[0];
    const dt = 0.2;
    expect(moverZ(o, 10 + CONFIG.speed * dt)).toBeCloseTo(-1.5 + CONFIG.moverSpeed * dt, 9);
  });

  it('moverZ : fait l\'aller-retour sans jamais sortir de son rail', () => {
    const o = parseMap(rail(10, '.~o~.')).obstacles[0];
    let min = Infinity, max = -Infinity;
    for (let x = -50; x < 200; x += 0.01) {
      const z = moverZ(o, x);
      min = Math.min(min, z); max = Math.max(max, z);
    }
    expect(min).toBeCloseTo(o.z0, 2);
    expect(max).toBeCloseTo(o.z1 - 1, 2);
  });

  it('moverZ : sans rail, le mobile reste sur sa case', () => {
    const o = parseMap(rail(10, '..o..')).obstacles[0];
    for (const x of [0, 5, 10, 13.3]) expect(moverZ(o, x)).toBe(-0.5);
  });

  it('tue le cube qui le rencontre', () => {
    const g = new Game(parseMap(rail(10, '..o..'))); // immobile, au centre
    runUntil(g, 15);
    expect(g.status).toBe('dead');
  });

  it('on le saute comme une pyramide', () => {
    const g = new Game(parseMap(rail(10, '..o..')));
    jumpAt(g, 8);
    runUntil(g, 20);
    expect(g.status).toBe('running');
  });

  it('touche le cube au centre s\'il y passe au bon moment, l\'épargne sinon', () => {
    // Le cube reste au centre (z = 0). Le mobile part de la gauche : il est au centre quand le cube
    // l'atteint si son rail commence assez tôt, et ailleurs sinon.
    const outcome = (start: string) => { const g = new Game(parseMap(rail(10, start))); runUntil(g, 20); return g.status; };
    expect(outcome('~~o~~')).toBe('dead');
    expect(outcome('o~~~~')).toBe('running'); // en x = 10, il est encore à gauche
  });
});
