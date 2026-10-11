import { Game } from './game/game';
import { LEVEL_1 } from './game/levels';
import { GameScene } from './render/scene';
import { FrameStats } from './perf';
import { Controls } from './input';

const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const $ = (id: string) => document.getElementById(id)!;
const fill = $('fill'), pct = $('pct'), att = $('att'), perf = $('perf'), msg = $('msg');
const dot = $('dot'), btnL = $('bl'), btnR = $('br');

const game = new Game(LEVEL_1);
const view = new GameScene(canvas, game);
const stats = new FrameStats(120);
const controls = new Controls();
controls.attach();

let started = false;
let endT = 0;
let startedAt = 0;

function start() {
  if (started) return;
  started = true;
  startedAt = performance.now();
  msg.style.display = 'none';
}

// Les boutons à l'écran (secours sans capteur) ne déclenchent pas de saut.
for (const [el, side] of [[btnL, 'left'], [btnR, 'right']] as const) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('on');
    controls.setButton(side, true);
  });
  const up = () => { el.classList.remove('on'); controls.setButton(side, false); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (!started) return; // le premier toucher démarre au `click`, pour la permission iOS
  if (game.status === 'won' && endT > 0.8) restart();
  controls.pressJump(e.pointerId);
}, { passive: false });
window.addEventListener('pointerup', (e) => controls.releaseJump(e.pointerId));
window.addEventListener('pointercancel', (e) => controls.releaseJump(e.pointerId));
window.addEventListener('click', () => {
  if (started) return;
  void controls.requestTilt().then(start);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ') {
    if (!started) start();
    else if (game.status === 'won' && endT > 0.8) restart();
  }
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
let lastDot = 9;
let perfTick = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const cpu0 = performance.now();
  const steer = controls.steer;
  if (started) {
    const before = game.status;
    game.update(dt, controls.jumpHeld, steer);
    if (before === 'running' && game.status === 'dead') view.explode();
    if (before === 'running' && game.status === 'won') {
      msg.innerHTML = `Niveau terminé !<small>${game.attempts} essai(s) · touche l'écran pour rejouer</small>`;
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
  const d = Math.round(steer * 50);
  if (d !== lastDot) { lastDot = d; dot.style.transform = `translateX(${d}%) translateX(${d * 1.1}px)`; }
  if (++perfTick % 15 === 0) {
    // Sans capteur d'inclinaison (ordinateur, ou capteur refusé), on affiche les boutons ◀ ▶ sur écran tactile.
    const needButtons = started && !controls.tiltActive && performance.now() - startedAt > 1500 && matchMedia('(pointer: coarse)').matches;
    const disp = needButtons ? 'flex' : 'none';
    if (btnL.style.display !== disp) { btnL.style.display = disp; btnR.style.display = disp; }
    const info = view.renderer.info.render;
    perf.textContent =
      `${stats.fps.toFixed(0)} FPS  ${stats.avgMs.toFixed(1)} ms (pire ${stats.worstMs.toFixed(1)})\n` +
      `CPU ${cpuMs.toFixed(2)} ms  draw ${info.calls}  tri ${info.triangles}\n` +
      `direction ${controls.tiltActive ? 'inclinaison' : 'clavier/boutons'} ${steer.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
