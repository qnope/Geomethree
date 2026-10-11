import { describe, it, expect, beforeAll } from 'vitest';
import { THEMES, type ThemeId } from '../render/themes';
import { SOUNDSCAPES, loopSeconds } from './soundscapes';
import { renderSoundscape, RATE, type RenderedSoundscape, type Stereo } from './synth';

const db = (x: number) => 20 * Math.log10(x);
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};
const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Volume perçu (approché) : RMS sans les infra-basses, qui pèsent lourd sans s'entendre beaucoup. */
const loudness = ({ left, right }: Stereo) => {
  const a = Math.exp((-2 * Math.PI * 150) / RATE);
  let lp = 0, s = 0;
  for (let i = 0; i < left.length; i++) {
    const m = (left[i] + right[i]) / 2;
    lp = (1 - a) * m + a * lp;
    s += (m - lp) ** 2;
  }
  return db(Math.sqrt(s / left.length));
};

/** Saut à la jointure de la boucle (dernier → premier échantillon) rapporté au plus grand saut voisin. */
const seam = (x: Float32Array) => {
  const n = x.length, w = 512;
  let local = 0;
  for (let k = -w; k < w; k++) {
    if (k === -1) continue; // la jointure elle-même
    const i = (k + n) % n, j = (k + 1 + n) % n;
    local = Math.max(local, Math.abs(x[j] - x[i]));
  }
  return Math.abs(x[0] - x[n - 1]) / local;
};

const fingerprint = ({ left, right }: Stereo) => {
  let h = 0;
  for (let i = 0; i < left.length; i += 7) h = (h * 31 + Math.round(left[i] * 1e5) + Math.round(right[i] * 1e5)) | 0;
  return h;
};

const out = new Map<ThemeId, { r: RenderedSoundscape; ms: number }>();
beforeAll(() => {
  for (const t of THEMES) {
    const t0 = performance.now();
    const r = renderSoundscape(SOUNDSCAPES[t.id]);
    out.set(t.id, { r, ms: performance.now() - t0 });
  }
});

describe('renderSoundscape : ambiance en boucle', () => {
  THEMES.forEach((t) => {
    const get = () => out.get(t.id)!.r;

    it(`${t.name} : une boucle stéréo de la durée exacte des mesures`, () => {
      const { loop } = get();
      const n = Math.round(loopSeconds(SOUNDSCAPES[t.id]) * RATE);
      expect(loop.left.length).toBe(n);
      expect(loop.right.length).toBe(n);
    });

    it(`${t.name} : la boucle se recolle sans clic`, () => {
      const { loop } = get();
      expect(seam(loop.left)).toBeLessThanOrEqual(1);
      expect(seam(loop.right)).toBeLessThanOrEqual(1);
    });

    it(`${t.name} : ne sature jamais`, () => {
      const { loop } = get();
      expect(peak(loop.left)).toBeLessThanOrEqual(0.99);
      expect(peak(loop.right)).toBeLessThanOrEqual(0.99);
    });

    it(`${t.name} : même volume perçu que les autres décors (-21 dB ± 1)`, () => {
      expect(Math.abs(loudness(get().loop) + 21)).toBeLessThanOrEqual(1);
    });

    it(`${t.name} : l'ambiance ne s'interrompt jamais (aucun quart de seconde à plus de 24 dB sous la moyenne)`, () => {
      const { left, right } = get().loop;
      const avg = rms(left);
      const win = Math.round(RATE / 4);
      for (let i = 0; i + win <= left.length; i += win) {
        expect(db(Math.max(rms(left, i, i + win), rms(right, i, i + win)) / avg)).toBeGreaterThan(-24);
      }
    });

    it(`${t.name} : vraie stéréo (gauche et droite diffèrent)`, () => {
      const { left, right } = get().loop;
      let lr = 0, ll = 0, rr = 0;
      for (let i = 0; i < left.length; i++) { lr += left[i] * right[i]; ll += left[i] ** 2; rr += right[i] ** 2; }
      expect(lr / Math.sqrt(ll * rr)).toBeLessThan(0.98);
    });

    it(`${t.name} : identique d'un rendu à l'autre (aléa à graine fixe)`, () => {
      expect(fingerprint(renderSoundscape(SOUNDSCAPES[t.id]).loop)).toBe(fingerprint(get().loop));
    });

    it(`${t.name} : budget de rendu (moins de 1,5 s ici, au plus 4 Mo en mémoire)`, () => {
      const { r, ms } = out.get(t.id)!;
      const bytes = [r.loop, r.jump, r.crash, r.win].reduce((b, s) => b + s.left.byteLength + s.right.byteLength, 0);
      expect(ms).toBeLessThan(1500);
      expect(bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    });
  });
});

describe('renderSoundscape : effets sonores', () => {
  const limits = { jump: 0.25, crash: 1.2, win: 2.5 } as const;
  THEMES.forEach((t) => {
    (Object.keys(limits) as (keyof typeof limits)[]).forEach((k) => {
      it(`${t.name} / ${k} : court, audible, sans clic au début ni à la fin`, () => {
        const s = out.get(t.id)!.r[k];
        expect(s.left.length / RATE).toBeLessThanOrEqual(limits[k]);
        for (const ch of [s.left, s.right]) {
          expect(peak(ch)).toBeGreaterThan(0.3);
          expect(peak(ch)).toBeLessThanOrEqual(0.99);
          expect(Math.abs(ch[0])).toBeLessThan(0.01);
          expect(Math.abs(ch[ch.length - 1])).toBeLessThan(0.01);
        }
      });
    });
  });
});
