import type { ThemeId } from '../render/themes';
import type { StorageLike } from '../progress';
import type { RenderedSoundscape, Stereo } from './synth';

export type Sfx = 'jump' | 'crash' | 'win';

/** Réglages du son (menu Réglages), mémorisés. */
export interface SoundSettings { music: boolean; effects: boolean }

export interface SoundDeps {
  /** Appelé au premier geste seulement (iOS refuse de jouer un contexte créé hors d'un geste). */
  createContext: () => AudioContext;
  /** Rendu d'un décor, avec ou sans sa boucle d'ambiance (dans un worker en vrai, cf. `renderer.ts`). */
  render: (id: ThemeId, withLoop: boolean) => Promise<RenderedSoundscape>;
  storage?: StorageLike | null;
}

const KEY = 'geomethree.sound.v1';
/** Volumes : l'ambiance reste en retrait des effets. */
const MUSIC = 0.55;
const SFX: Record<Sfx, number> = { jump: 0.18, crash: 0.6, win: 0.7 };
/** Fondu enchaîné entre deux décors, et fondu de sortie quand on coupe l'ambiance (s). */
const FADE = 1.2;
const FADE_OUT = 0.3;
/** Décors gardés en mémoire : environ 3 Mo chacun avec l'ambiance. */
const KEEP = 2;

type Buffers = { loop?: AudioBuffer } & Record<Sfx, AudioBuffer>;
interface Entry { withLoop: boolean; data?: RenderedSoundscape; buffers?: Buffers }

function loadSettings(storage: StorageLike | null | undefined): SoundSettings {
  try {
    const d = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<SoundSettings>;
    return { music: d.music !== false, effects: d.effects !== false };
  } catch {
    return { music: true, effects: true };
  }
}

/**
 * Son du jeu : une boucle d'ambiance par décor (fondu enchaîné au changement) et trois effets.
 * Rien n'est créé avant le premier geste. Ambiance coupée : on ne calcule même pas sa boucle.
 * Tout coupé, partie en pause ou onglet masqué : le contexte est suspendu, plus aucun calcul audio.
 */
export class Sound {
  /** Durée du dernier rendu (ms), pour l'affichage des performances. */
  renderMs = 0;
  private readonly settings: SoundSettings;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private broken = false;
  private hidden = false;
  private paused = false;
  private theme: ThemeId | null = null;
  private playing: { theme: ThemeId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly cache = new Map<ThemeId, Entry>();
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: SoundDeps) {
    this.settings = loadSettings(deps.storage);
  }

  get music(): boolean { return this.settings.music; }
  get effects(): boolean { return this.settings.effects; }
  private get active(): boolean { return this.settings.music || this.settings.effects; }
  /** Onglet masqué ou partie en pause : le contexte reste suspendu, même si on touche l'écran. */
  private get held(): boolean { return this.hidden || this.paused; }

  /** Décor courant : lance son rendu tout de suite (même avant le premier geste) et l'ambiance dès que possible. */
  setTheme(id: ThemeId): void {
    if (id === this.theme) return;
    this.theme = id;
    this.load(id);
    this.startLoop();
  }

  /** À appeler dans chaque geste (toucher, clic, touche) : crée ou reprend le contexte. Ne coûte presque rien ensuite. */
  unlock(): void {
    if (!this.active || this.broken) return;
    if (!this.ctx) {
      try {
        this.ctx = this.deps.createContext();
      } catch {
        this.broken = true; // pas de Web Audio : le jeu continue en silence
        return;
      }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // Anciens iOS : il faut jouer quelque chose pendant le geste pour débloquer le son.
      const blank = this.ctx.createBufferSource();
      blank.buffer = this.ctx.createBuffer(1, 1, 22050);
      blank.connect(this.master);
      blank.start();
    }
    if (this.ctx.state !== 'running' && !this.held) this.ctx.resume().catch(() => {});
    this.startLoop();
  }

  play(sfx: Sfx): void {
    if (!this.settings.effects || !this.ctx || !this.master || this.ctx.state !== 'running' || !this.theme) return;
    const b = this.buffers(this.theme);
    if (!b) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = b[sfx];
    gain.gain.value = SFX[sfx];
    src.connect(gain); // pas de chaînage : les anciens Safari ne renvoient rien
    gain.connect(this.master);
    src.start();
  }

  /** Change les réglages (depuis un clic du menu Réglages : peut démarrer le contexte) et les mémorise. */
  set(change: Partial<SoundSettings>): void {
    Object.assign(this.settings, change);
    try { this.deps.storage?.setItem(KEY, JSON.stringify(this.settings)); } catch { /* stockage bloqué : tant pis */ }
    clearTimeout(this.suspendTimer);
    if (!this.settings.music) this.stopLoop();
    const ctx = this.ctx, master = this.master;
    if (!this.active) {
      if (ctx && master) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        this.suspendTimer = setTimeout(() => { if (!this.active) ctx.suspend().catch(() => {}); }, 200);
      }
      return;
    }
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(1, ctx.currentTime, 0.03);
    }
    if (this.theme) this.load(this.theme);
    this.unlock();
  }

  /** Onglet ou application en arrière-plan : on suspend tout. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend().catch(() => {});
    else if (this.active && !this.paused) this.ctx.resume().catch(() => {});
  }

  /**
   * Partie en pause : fondu court puis contexte suspendu, l'ambiance se fige là où elle en est.
   * La reprise vient d'un geste (bouton Reprendre, touche) : iOS accepte d'y relancer le contexte.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.active) return;
    clearTimeout(this.suspendTimer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(paused ? 0 : 1, ctx.currentTime, 0.03);
    if (paused) this.suspendTimer = setTimeout(() => { if (this.paused) ctx.suspend().catch(() => {}); }, 200);
    else if (!this.hidden) ctx.resume().catch(() => {});
  }

  /** Lance le rendu du décor si rien d'utilisable n'est en mémoire (sans la boucle si l'ambiance est coupée). */
  private load(id: ThemeId): void {
    if (!this.active) return;
    const withLoop = this.settings.music;
    const known = this.cache.get(id);
    this.cache.delete(id); // réinsertion : le plus récent en dernier
    if (known && (known.withLoop || !withLoop)) { this.cache.set(id, known); return; }
    const entry: Entry = { withLoop };
    this.cache.set(id, entry);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= KEEP) break;
      if (old !== id && old !== this.playing?.theme) this.cache.delete(old);
    }
    this.deps.render(id, withLoop).then((data) => {
      if (this.cache.get(id) !== entry) return; // oublié ou remplacé entre-temps
      if (!entry.withLoop) data.loop = undefined; // ambiance coupée pendant le rendu
      entry.data = data;
      if (id === this.theme) this.startLoop();
    }).catch(() => { if (this.cache.get(id) === entry) this.cache.delete(id); });
  }

  /** Échantillons → AudioBuffer, une seule fois par décor (les tableaux d'origine sont ensuite libérés). */
  private buffers(id: ThemeId): Buffers | null {
    const e = this.cache.get(id);
    if (!e || !this.ctx) return null;
    if (!e.buffers && e.data) {
      const data = e.data, ctx = this.ctx;
      const toBuffer = (s: Stereo) => {
        const b = ctx.createBuffer(2, s.left.length, data.rate);
        b.getChannelData(0).set(s.left);
        b.getChannelData(1).set(s.right);
        return b;
      };
      e.buffers = { jump: toBuffer(data.jump), crash: toBuffer(data.crash), win: toBuffer(data.win) };
      if (data.loop) e.buffers.loop = toBuffer(data.loop);
      e.data = undefined;
      this.renderMs = data.ms ?? this.renderMs;
    }
    return e.buffers ?? null;
  }

  private startLoop(): void {
    const ctx = this.ctx, master = this.master, theme = this.theme;
    if (!ctx || !master || !this.settings.music || !theme || this.playing?.theme === theme) return;
    const loop = this.buffers(theme)?.loop;
    if (!loop) return;
    const now = ctx.currentTime;
    this.fadeOut(FADE);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = loop;
    src.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC, now + FADE);
    src.connect(gain);
    gain.connect(master);
    src.start(now);
    this.playing = { theme, src, gain };
  }

  /** Ambiance coupée : fondu de sortie, puis on libère les boucles (≈ 3 Mo chacune). */
  private stopLoop(): void {
    this.fadeOut(FADE_OUT);
    this.playing = null;
    for (const e of this.cache.values()) {
      e.withLoop = false;
      if (e.buffers) e.buffers.loop = undefined;
      if (e.data) e.data.loop = undefined;
    }
  }

  private fadeOut(seconds: number): void {
    if (!this.playing || !this.ctx) return;
    const { src, gain } = this.playing, now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + seconds);
    src.stop(now + seconds + 0.05);
  }
}
