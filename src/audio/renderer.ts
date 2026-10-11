import RenderWorker from './render.worker?worker';
import type { ThemeId } from '../render/themes';
import type { RenderedSoundscape } from './synth';

type Render = (id: ThemeId) => Promise<RenderedSoundscape>;

/** Secours sans worker : rendu sur le fil principal, code chargé seulement dans ce cas. */
const local: Render = async (id) => {
  const [{ renderSoundscape }, { SOUNDSCAPES }] = await Promise.all([import('./synth'), import('./soundscapes')]);
  const t0 = performance.now();
  const r = renderSoundscape(SOUNDSCAPES[id]);
  r.ms = performance.now() - t0;
  return r;
};

/**
 * Rend les ambiances dans un worker : aucun à-coup sur la boucle de jeu. Si la page interdit les workers,
 * on retombe sur le rendu local.
 */
export function workerRenderer(): Render {
  const waiting = new Map<number, { id: ThemeId; done: (r: RenderedSoundscape) => void }>();
  let next = 0;
  let worker: Worker | null = null;
  const fallback = () => {
    worker?.terminate();
    worker = null;
    for (const [n, w] of waiting) { waiting.delete(n); void local(w.id).then(w.done); }
  };
  try {
    worker = new RenderWorker();
    worker.onmessage = (e: MessageEvent<{ n: number; r: RenderedSoundscape }>) => {
      waiting.get(e.data.n)?.done(e.data.r);
      waiting.delete(e.data.n);
    };
    worker.onerror = fallback;
  } catch {
    worker = null;
  }
  return (id) => {
    if (!worker) return local(id);
    const w = worker;
    return new Promise((done) => {
      const n = next++;
      waiting.set(n, { id, done });
      w.postMessage({ n, id });
    });
  };
}
