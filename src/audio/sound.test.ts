import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ThemeId } from '../render/themes';
import type { RenderedSoundscape, Stereo } from './synth';
import { Sound } from './sound';

// Faux AudioContext : juste ce que Sound utilise, en notant ce qui est joué.
class FakeParam {
  value = 1;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  setTargetAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class FakeNode {
  readonly out: FakeNode[] = [];
  connect<T extends FakeNode>(n: T): T { this.out.push(n); return n; }
  disconnect() { this.out.length = 0; }
}
class FakeGain extends FakeNode { readonly gain = new FakeParam(); }
class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(n: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: n }, () => new Float32Array(length));
  }
  getChannelData(c: number) { return this.channels[c]; }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  started: number | null = null;
  stopped: number | null = null;
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}
class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 10;
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  createGain() { return new FakeGain(); }
  createBuffer(n: number, len: number, rate: number) { return new FakeBuffer(n, len, rate); }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
}

/** Un son reconnaissable par sa première valeur (le décor et le type de son). */
const stereo = (mark: number, len = 8): Stereo => {
  const left = new Float32Array(len).fill(mark);
  return { left, right: left.slice() };
};
const ids: ThemeId[] = ['neon', 'foret', 'dunes', 'glacier', 'volcan'];
const fakeRender = (id: ThemeId, withLoop = true): RenderedSoundscape => {
  const k = ids.indexOf(id) * 10;
  return { rate: 22050, ...(withLoop ? { loop: stereo(k + 1, 64) } : {}), jump: stereo(k + 2), crash: stereo(k + 3), win: stereo(k + 4) };
};

function setup(stored: Record<string, string> = {}) {
  const contexts: FakeContext[] = [];
  const render = vi.fn(async (id: ThemeId, withLoop: boolean) => fakeRender(id, withLoop));
  const storage = { data: { ...stored }, getItem(k: string) { return this.data[k] ?? null; }, setItem(k: string, v: string) { this.data[k] = v; } };
  const sound = new Sound({
    createContext: () => { const c = new FakeContext(); contexts.push(c); return c as unknown as AudioContext; },
    render,
    storage,
  });
  const ctx = () => contexts[0];
  /** Sons démarrés, identifiés par leur marque. */
  const played = () => ctx().sources.filter((s) => s.started !== null && s.buffer && s.buffer.length > 1).map((s) => s.buffer!.channels[0][0]);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { sound, contexts, ctx, render, storage, played, flush };
}

afterEach(() => vi.useRealTimers());

describe('Sound', () => {
  it('aucun AudioContext avant le premier toucher (exigence d\'iOS), mais le rendu est déjà lancé', async () => {
    const { sound, contexts, render, flush } = setup();
    sound.setTheme('neon');
    await flush();
    expect(contexts).toHaveLength(0);
    expect(render).toHaveBeenCalledWith('neon', true);
  });

  it('le premier toucher crée le contexte, le reprend et lance l\'ambiance du décor en boucle', async () => {
    const { sound, ctx, played, flush } = setup();
    sound.setTheme('neon');
    await flush();
    sound.unlock();
    expect(ctx().resume).toHaveBeenCalled();
    expect(played()).toEqual([1]);
    expect(ctx().sources.find((s) => s.buffer?.channels[0][0] === 1)!.loop).toBe(true);
  });

  it('l\'ambiance démarre dès que son rendu arrive, si le toucher a déjà eu lieu', async () => {
    const { sound, played, flush } = setup();
    sound.setTheme('dunes');
    sound.unlock();
    expect(played()).toEqual([]);
    await flush();
    expect(played()).toEqual([21]);
  });

  it('changer de décor : fondu enchaîné, l\'ancienne boucle s\'arrête après le fondu', async () => {
    const { sound, ctx, played, flush } = setup();
    sound.setTheme('neon');
    await flush();
    sound.unlock();
    sound.setTheme('volcan');
    await flush();
    expect(played()).toEqual([1, 41]);
    const old = ctx().sources.find((s) => s.buffer?.channels[0][0] === 1)!;
    expect(old.stopped).toBeGreaterThan(ctx().currentTime);
  });

  it('même décor (niveau rejoué) : l\'ambiance continue sans redémarrer', async () => {
    const { sound, played, render, flush } = setup();
    sound.setTheme('glacier');
    await flush();
    sound.unlock();
    sound.setTheme('glacier');
    sound.unlock();
    await flush();
    expect(played()).toEqual([31]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('effets sonores du décor courant, seulement une fois le contexte actif', async () => {
    const { sound, played, flush } = setup();
    sound.setTheme('foret');
    await flush();
    sound.play('jump'); // pas encore de toucher : rien
    sound.unlock();
    await flush();
    sound.play('jump');
    sound.play('crash');
    sound.play('win');
    expect(played()).toEqual([11, 12, 13, 14]);
  });

  it('garde au plus 2 décors en mémoire', async () => {
    const { sound, render, flush } = setup();
    for (const id of ['neon', 'foret', 'dunes', 'neon'] as ThemeId[]) { sound.setTheme(id); await flush(); }
    expect(render.mock.calls.map((c) => c[0])).toEqual(['neon', 'foret', 'dunes', 'neon']);
    sound.setTheme('dunes');
    await flush();
    expect(render).toHaveBeenCalledTimes(4); // dunes était encore là
  });

  it('réglages : ambiance coupée, la boucle s\'éteint en fondu mais les effets restent', async () => {
    const { sound, ctx, played, storage, flush } = setup();
    sound.setTheme('neon');
    await flush();
    sound.unlock();
    sound.set({ music: false });
    const loop = ctx().sources.find((s) => s.loop)!;
    expect(loop.stopped).toBeGreaterThan(ctx().currentTime);
    sound.play('jump');
    expect(played()).toEqual([1, 2]);
    expect(JSON.parse(Object.values(storage.data)[0])).toEqual({ music: false, effects: true });
  });

  it('ambiance coupée : on ne calcule que les effets (pas la boucle de 3 Mo)', async () => {
    const { sound, render, played, flush } = setup({ 'geomethree.sound.v1': JSON.stringify({ music: false, effects: true }) });
    sound.setTheme('dunes');
    sound.unlock();
    await flush();
    expect(render).toHaveBeenCalledWith('dunes', false);
    sound.play('crash');
    expect(played()).toEqual([23]);
    sound.set({ music: true }); // l'ambiance revient : on calcule la boucle
    await flush();
    expect(render).toHaveBeenLastCalledWith('dunes', true);
    expect(played()).toEqual([23, 21]);
  });

  it('réglages : effets coupés, l\'ambiance continue', async () => {
    const { sound, played, flush } = setup();
    sound.setTheme('foret');
    await flush();
    sound.unlock();
    sound.set({ effects: false });
    sound.play('jump');
    expect(played()).toEqual([11]);
  });

  it('tout coupé : fondu puis contexte suspendu (plus aucun calcul audio)', async () => {
    vi.useFakeTimers();
    const { sound, ctx } = setup();
    sound.setTheme('neon');
    await vi.runAllTimersAsync();
    sound.unlock();
    sound.set({ music: false, effects: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx().suspend).toHaveBeenCalled();
    expect(ctx().state).toBe('suspended');
    sound.set({ effects: true }); // le changement de réglage est un clic : on peut reprendre
    expect(ctx().state).toBe('running');
  });

  it('tout coupé et mémorisé : ni contexte ni rendu tant qu\'on ne réactive rien', async () => {
    const first = setup();
    first.sound.set({ music: false, effects: false });
    const { sound, contexts, render, played, flush } = setup(first.storage.data);
    expect([sound.music, sound.effects]).toEqual([false, false]);
    sound.setTheme('neon');
    sound.unlock();
    sound.play('jump');
    await flush();
    expect(contexts).toHaveLength(0);
    expect(render).not.toHaveBeenCalled();
    sound.set({ music: true });
    await flush();
    expect(played()).toEqual([1]);
  });

  it('réglages illisibles : tout activé par défaut', () => {
    const { sound } = setup({ 'geomethree.sound.v1': '{oups' });
    expect([sound.music, sound.effects]).toEqual([true, true]);
  });

  it('onglet en arrière-plan : contexte suspendu, repris au retour', async () => {
    const { sound, ctx, flush } = setup();
    sound.setTheme('neon');
    await flush();
    sound.unlock();
    sound.setHidden(true);
    expect(ctx().suspend).toHaveBeenCalled();
    sound.setHidden(false);
    expect(ctx().resume).toHaveBeenCalledTimes(2);
  });

  it('pause : fondu court puis contexte suspendu, l\'ambiance se fige sans s\'arrêter', async () => {
    vi.useFakeTimers();
    const { sound, ctx } = setup();
    sound.setTheme('neon');
    await vi.runAllTimersAsync();
    sound.unlock();
    const loop = ctx().sources.find((s) => s.loop)!;
    sound.setPaused(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx().state).toBe('suspended');
    expect(loop.stopped).toBeNull(); // la boucle n'est pas arrêtée : elle reprendra où elle en était
  });

  it('pause : un toucher sur l\'écran de pause ne relance pas le son, Reprendre si', async () => {
    vi.useFakeTimers();
    const { sound, ctx, played } = setup();
    sound.setTheme('neon');
    await vi.runAllTimersAsync();
    sound.unlock();
    sound.setPaused(true);
    await vi.advanceTimersByTimeAsync(500);
    sound.unlock();
    expect(ctx().state).toBe('suspended');
    sound.setPaused(false);
    expect(ctx().state).toBe('running');
    expect(played()).toEqual([1]); // la même boucle continue, aucune nouvelle source
  });

  it('pause puis onglet masqué et revenu : le son reste figé jusqu\'à la reprise', async () => {
    vi.useFakeTimers();
    const { sound, ctx } = setup();
    sound.setTheme('neon');
    await vi.runAllTimersAsync();
    sound.unlock();
    sound.setPaused(true);
    sound.setHidden(true);
    sound.setHidden(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx().state).toBe('suspended');
    sound.setPaused(false);
    expect(ctx().state).toBe('running');
  });

  it('reprise juste après la pause (avant la fin du fondu) : le contexte n\'est pas suspendu', async () => {
    vi.useFakeTimers();
    const { sound, ctx } = setup();
    sound.setTheme('neon');
    await vi.runAllTimersAsync();
    sound.unlock();
    sound.setPaused(true);
    sound.setPaused(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx().suspend).not.toHaveBeenCalled();
    expect(ctx().state).toBe('running');
  });

  it('sans Web Audio (vieux navigateur) : le jeu continue en silence', () => {
    const sound = new Sound({ createContext: () => { throw new Error('pas de Web Audio'); }, render: async (id, withLoop) => fakeRender(id, withLoop) });
    sound.setTheme('neon');
    expect(() => { sound.unlock(); sound.play('jump'); sound.set({ music: false }); sound.set({ music: true }); sound.setHidden(true); }).not.toThrow();
  });
});
