import { Game } from './game/game';
import { LEVEL_1 } from './game/levels';
import { GameScene } from './render/scene';
import { FrameStats } from './perf';

const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const $ = (id: string) => document.getElementById(id)!;
const fill = $('fill'), pct = $('pct'), att = $('att'), perf = $('perf'), msg = $('msg');

const game = new Game(LEVEL_1);
const view = new GameScene(canvas, game);
const stats = new FrameStats(120);

let held = false;
let started = false;
let endT = 0;
const press = (e: Event) => {
  e.preventDefault();
  held = true;
  if (!started) { started = true; msg.style.display = 'none'; }
  else if (game.status === 'won' && endT > 0.8) restart();
};
const release = () => { held = false; };
window.addEventListener('pointerdown', press, { passive: false });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { if (!e.repeat) press(e); }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') release();
});
window.addEventListener('resize', () => view.resize());

function restart() {
  game.restart();
  view.reset();
  endT = 0;
  msg.style.display = 'none';
  att.textContent = `Essai ${game.attempts}`;
}

let last = performance.now();
let lastPct = -1;
let perfTick = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const cpu0 = performance.now();
  if (started) {
    const before = game.status;
    game.update(dt, held);
    if (before === 'running' && game.status === 'dead') view.explode();
    if (before === 'running' && game.status === 'won') {
      msg.innerHTML = `Niveau terminé !<small>${game.attempts} essai(s) · tape pour rejouer</small>`;
      msg.style.display = 'block';
    }
    if (game.status !== 'running') {
      endT += dt;
      if (game.status === 'dead' && endT > 0.7) restart();
    }
  }
  view.render(dt, now / 1000);
  const cpuMs = performance.now() - cpu0;

  stats.push(dt * 1000);
  const p = Math.floor(game.progress * 100);
  if (p !== lastPct) { lastPct = p; fill.style.width = `${p}%`; pct.textContent = `${p}%`; }
  if (++perfTick % 15 === 0) {
    const info = view.renderer.info.render;
    perf.textContent =
      `${stats.fps.toFixed(0)} FPS  ${stats.avgMs.toFixed(1)} ms (pire ${stats.worstMs.toFixed(1)})\n` +
      `CPU ${cpuMs.toFixed(2)} ms  draw ${info.calls}  tri ${info.triangles}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
