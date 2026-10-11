/** Rendu des ambiances hors du fil principal : la boucle de jeu ne voit jamais ce calcul. */
import type { ThemeId } from '../render/themes';
import { SOUNDSCAPES } from './soundscapes';
import { renderSoundscape } from './synth';

self.onmessage = (e: MessageEvent<{ n: number; id: ThemeId }>) => {
  const t0 = performance.now();
  const r = renderSoundscape(SOUNDSCAPES[e.data.id]);
  r.ms = performance.now() - t0;
  // Transfert sans copie des échantillons vers le fil principal.
  const transfer = [r.loop, r.jump, r.crash, r.win].flatMap((s) => [s.left.buffer as ArrayBuffer, s.right.buffer as ArrayBuffer]);
  self.postMessage({ n: e.data.n, r }, { transfer });
};
