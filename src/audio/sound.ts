import type { ThemeId } from '../render/themes';
import type { StorageLike } from '../progress';
import type { RenderedSoundscape, Stereo } from './synth';

export type Sfx = 'jump' | 'crash' | 'win';

export interface SoundDeps {
  /** Appelé au premier geste seulement (iOS refuse de jouer un contexte créé hors d'un geste). */
  createContext: () => AudioContext;
  /** Rendu d'une ambiance (dans un worker en vrai, cf. `renderer.ts`). */
  render: (id: ThemeId) => Promise<RenderedSoundscape>;
  storage?: StorageLike | null;
}

const KEY = 'geomethree.sound.v1';
/** Volumes : l'ambiance reste en retrait des effets. */
const MUSIC = 0.55;
const SFX: Record<Sfx, number> = { jump: 0.18, crash: 0.6, win: 0.7 };
/** Fondu enchaîné entre deux décors (s). */
const FADE = 1.2;
/** Décors gardés en mémoire : environ 3 Mo chacun. */
const KEEP = 2;

type Buffers = Record<'loop' | Sfx, AudioBuffer>;
interface Entry { data?: RenderedSoundscape; buffers?: Buffers }

/**
 * Son du jeu : une boucle d'ambiance par décor (fondu enchaîné au changement) et trois effets.
 * Rien n'est créé avant le premier geste ; son coupé ou onglet masqué, le contexte est suspendu
 * (plus aucun calcul audio) et le choix « muet » est mémorisé.
 */
export class Sound {
  muted: boolean;
  /** Durée du dernier rendu d'ambiance (ms), pour l'affichage des performances. */
  renderMs = 0;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private broken = false;
  private hidden = false;
  private theme: ThemeId | null = null;
  private playing: { theme: ThemeId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private readonly cache = new Map<ThemeId, Entry>();
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: SoundDeps) {
    this.muted = deps.storage?.getItem(KEY) === '1';
  }

  /** Décor courant : lance son rendu tout de suite (même avant le premier geste) et l'ambiance dès que possible. */
  setTheme(id: ThemeId): void {
    if (id === this.theme) return;
    this.theme = id;
    this.load(id);
    this.startLoop();
  }

  /** À appeler dans chaque geste (toucher, clic, touche) : crée ou reprend le contexte. Ne coûte presque rien ensuite. */
  unlock(): void {
    if (this.muted || this.broken) return;
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
    if (this.ctx.state !== 'running' && !this.hidden) this.ctx.resume().catch(() => {});
    this.startLoop();
  }

  play(sfx: Sfx): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running' || !this.theme) return;
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

  /** Coupe ou remet le son (dans un clic : peut démarrer le contexte). Retourne le nouvel état. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    try { this.deps.storage?.setItem(KEY, this.muted ? '1' : '0'); } catch { /* stockage bloqué : tant pis */ }
    clearTimeout(this.suspendTimer);
    const ctx = this.ctx, master = this.master;
    if (this.muted) {
      if (ctx && master) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        this.suspendTimer = setTimeout(() => { if (this.muted) ctx.suspend().catch(() => {}); }, 200);
      }
    } else {
      if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(1, ctx.currentTime, 0.03);
      }
      if (this.theme) this.load(this.theme);
      this.unlock();
    }
    return this.muted;
  }

  /** Onglet ou application en arrière-plan : on suspend tout. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend().catch(() => {});
    else if (!this.muted) this.ctx.resume().catch(() => {});
  }

  private load(id: ThemeId): void {
    if (this.muted) return;
    const known = this.cache.get(id);
    this.cache.delete(id); // réinsertion : le plus récent en dernier
    if (known) { this.cache.set(id, known); return; }
    const entry: Entry = {};
    this.cache.set(id, entry);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= KEEP) break;
      if (old !== id && old !== this.playing?.theme) this.cache.delete(old);
    }
    this.deps.render(id).then((data) => {
      if (this.cache.get(id) !== entry) return; // oublié entre-temps
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
      e.buffers = { loop: toBuffer(data.loop), jump: toBuffer(data.jump), crash: toBuffer(data.crash), win: toBuffer(data.win) };
      e.data = undefined;
      this.renderMs = data.ms ?? this.renderMs;
    }
    return e.buffers ?? null;
  }

  private startLoop(): void {
    const ctx = this.ctx, master = this.master, theme = this.theme;
    if (!ctx || !master || this.muted || !theme || this.playing?.theme === theme) return;
    const b = this.buffers(theme);
    if (!b) return;
    const now = ctx.currentTime;
    if (this.playing) {
      const { src, gain } = this.playing;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE);
      src.stop(now + FADE + 0.05);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = b.loop;
    src.loop = true;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC, now + FADE);
    src.connect(gain);
    gain.connect(master);
    src.start(now);
    this.playing = { theme, src, gain };
  }
}
