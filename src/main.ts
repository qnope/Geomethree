
import { Game } from './game/game';
import { LEVELS } from './game/levels';
import { GameScene } from './render/scene';
import { THEMES, themeById, themeParam, type ThemeId } from './render/themes';
import { FrameStats } from './perf';
import { Controls } from './input';
import { loadProgress, saveProgress, recordRun, isUnlocked } from './progress';
import { Sound } from './audio/sound';
import { workerRenderer } from './audio/renderer';

const $ = (id: string) => document.getElementById(id)!;
const fill = $('fill'), pct = $('pct'), att = $('att'), perf = $('perf'), msg = $('msg');
const dot = $('dot'), btnL = $('bl'), btnR = $('br'), menu = $('menu'), levelList = $('levels'), menuBtn = $('menubtn');
const decorPick = $('decor') as HTMLSelectElement;
const settings = $('settings'), optMusic = $('optmusic') as HTMLInputElement, optSfx = $('optsfx') as HTMLInputElement;

const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const progress = storage ? loadProgress(storage, LEVELS.length) : loadProgress({ getItem: () => null, setItem: () => {} }, LEVELS.length);
const persist = () => { if (storage) saveProgress(storage, progress); };

let canvas: HTMLCanvasElement;
let game: Game;
let view: GameScene;
let current = 0;
const stats = new FrameStats(120);
const sound = new Sound({
  createContext: () => new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(),
  render: workerRenderer(),
  storage,
});
const controls = new Controls();
controls.attach();

// Décor imposé à tous les niveaux (aperçu) : `?theme=` dans l'URL ou le sélecteur du menu. null : celui du niveau.
let forcedTheme: ThemeId | null = themeParam(location.search);
let started = false;
let tiltAsked = false;
let endT = 0;
let startedAt = 0;

function loadLevel(i: number) {
  current = i;
  view?.dispose();
  canvas?.remove();
  canvas = document.createElement('canvas');
  document.body.prepend(canvas);
  game = new Game(LEVELS[i].level);
  view = new GameScene(canvas, game, themeById(forcedTheme ?? LEVELS[i].theme));
  sound.setTheme(forcedTheme ?? LEVELS[i].theme);
  endT = 0;
  lastPct = -1;
  msg.style.display = 'none';
  att.textContent = `Niveau ${i + 1} · Essai 1`;
}

function renderMenu() {
  levelList.replaceChildren();
  LEVELS.forEach((l, i) => {
    const b = document.createElement('button');
    const best = Math.round(progress.best[i] * 100);
    b.disabled = !isUnlocked(progress, i);
    b.classList.toggle('done', best === 100);
    b.innerHTML = `<span>${i + 1}. ${l.name}<em>${themeById(forcedTheme ?? l.theme).name}</em></span><small>${b.disabled ? '🔒' : best === 100 ? '✔ 100 %' : `meilleur ${best} %`}</small>`;
    b.addEventListener('click', () => void play(i));
    levelList.append(b);
  });
}

function showMenu() {
  started = false;
  renderMenu();
  menu.style.display = 'flex';
}

async function play(i: number) {
  if (!isUnlocked(progress, i)) return;
  if (!tiltAsked) { tiltAsked = true; await controls.requestTilt(); }
  loadLevel(i);
  menu.style.display = 'none';
  started = true;
  startedAt = performance.now();
}

const saveRun = () => { if (recordRun(progress, current, game.progress, game.status === 'won')) persist(); };
menuBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
menuBtn.addEventListener('click', () => { if (started) saveRun(); showMenu(); });

decorPick.append(new Option('celui du niveau', ''), ...THEMES.map((t) => new Option(t.name, t.id)));
decorPick.value = forcedTheme ?? '';
decorPick.addEventListener('pointerdown', (e) => e.stopPropagation()); // sinon le preventDefault global bloque la liste
decorPick.addEventListener('change', () => {
  forcedTheme = (decorPick.value || null) as ThemeId | null;
  decorPick.blur();
  loadLevel(current); // le décor change aussi derrière le menu
  renderMenu();
});

// iOS n'autorise le son qu'à partir d'un geste : chaque toucher, clic ou touche tente de le débloquer (quasi gratuit ensuite).
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));

// Menu Réglages (depuis le menu des niveaux) : ambiance et effets sonores, mémorisés.
optMusic.checked = sound.music;
optSfx.checked = sound.effects;
// Au clic plutôt qu'au change : on reste dans le geste de l'utilisateur, qu'iOS exige pour démarrer le son.
optMusic.addEventListener('click', () => sound.set({ music: optMusic.checked }));
optSfx.addEventListener('click', () => sound.set({ effects: optSfx.checked }));
const settingsOpen = () => settings.style.display === 'flex';
const showSettings = (open: boolean) => { settings.style.display = open ? 'flex' : 'none'; };
$('setbtn').addEventListener('click', () => showSettings(true));
$('setback').addEventListener('click', () => showSettings(false));

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
  if (!started) return; // le menu gère ses propres boutons
  if (game.status === 'won' && endT > 0.8) next();
  controls.pressJump(e.pointerId);
}, { passive: false });
window.addEventListener('pointerup', (e) => controls.releaseJump(e.pointerId));
window.addEventListener('pointercancel', (e) => controls.releaseJump(e.pointerId));
window.addEventListener('keydown', (e) => {
  if (settingsOpen()) { if (e.code === 'Escape') showSettings(false); return; }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ' || e.code === 'Enter') {
    if (!started) void play(progress.unlocked);
    else if (game.status === 'won' && endT > 0.8) next();
  }
});
window.addEventListener('resize', () => view?.resize());

function restart() {
  game.restart();
  view.reset();
  endT = 0;
  msg.style.display = 'none';
  att.textContent = `Niveau ${current + 1} · Essai ${game.attempts}`;
}

/** Après une victoire : niveau suivant, ou menu après le dernier. */
function next() {
  if (current + 1 < LEVELS.length) void play(current + 1);
  else showMenu();
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
    const before = game.status, jumps = game.jumps;
    game.update(dt, controls.jumpHeld, steer);
    if (game.jumps !== jumps) sound.play('jump');
    if (before === 'running' && game.status === 'dead') { view.explode(); sound.play('crash'); saveRun(); }
    if (before === 'running' && game.status === 'won') {
      sound.play('win');
      saveRun();
      const last = current + 1 >= LEVELS.length;
      msg.innerHTML = `Niveau terminé !<small>${game.attempts} essai(s) · touche l'écran pour ${last ? 'revenir au menu' : 'le niveau suivant'}</small>`;
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
      `direction ${controls.tiltActive ? 'inclinaison' : 'clavier/boutons'} ${steer.toFixed(2)}\n` +
      `son ${!sound.music && !sound.effects ? 'coupé' : sound.renderMs ? `rendu en ${sound.renderMs.toFixed(0)} ms (worker)` : 'en préparation'}` +
      (sound.music || !sound.effects ? '' : ', ambiance coupée');
  }
  requestAnimationFrame(frame);
}
showMenu();
loadLevel(progress.unlocked);
requestAnimationFrame(frame);
