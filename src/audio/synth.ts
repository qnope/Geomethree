/**
 * Synthétiseur hors ligne : transforme une ambiance (`soundscapes.ts`) en échantillons stéréo.
 * Code pur, sans Web Audio : testé sous Node, exécuté dans un worker (aucun coût sur la boucle de jeu).
 * La boucle se recolle sans clic : les notes qui dépassent la fin reviennent au début (tampon circulaire),
 * bourdons et rafales ont un nombre entier de cycles par boucle, et filtres et effets sont « préchauffés »
 * sur la fin de la boucle avant de la rendre.
 */
import { degreeToMidi, loopSeconds, type Part, type Sends, type Soundscape, type Tone, type Wave } from './soundscapes';

/** Fréquence d'échantillonnage du rendu : assez pour une ambiance, moitié moins de calcul et de mémoire que 44,1 kHz. */
export const RATE = 22050;

export interface Stereo { left: Float32Array; right: Float32Array }
export interface RenderedSoundscape {
  rate: number;
  /** Absente quand l'ambiance est coupée dans les réglages. */
  loop?: Stereo;
  jump: Stereo;
  crash: Stereo;
  win: Stereo;
  /** Durée du rendu (ms), mesurée par qui l'a lancé. */
  ms?: number;
}

/** Volume perçu visé pour toutes les boucles (dB), pour qu'aucun décor ne sonne plus fort qu'un autre. */
const LOUDNESS = -21;
const TAU = Math.PI * 2;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const len = (seconds: number) => Math.round(seconds * RATE);
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const onePole = (cutoff: number) => 1 - Math.exp((-TAU * Math.min(cutoff, RATE * 0.45)) / RATE);

/** Pseudo-aléa à graine (mulberry32) : même rendu à chaque fois. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit blanc sans état (-1…1) : même valeur pour le même indice, donc rebouclable. */
function hashNoise(i: number, seed: number): number {
  let x = (i + Math.imul(seed, 0x9e3779b9)) | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x / 2147483648;
}

/** Correction polyBLEP : dents de scie et carrés sans repliement audible. */
function blep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

function osc(w: Wave, p: number, dt: number, rand: () => number): number {
  switch (w) {
    case 'sine': return Math.sin(TAU * p);
    case 'triangle': return 4 * Math.abs(p - 0.5) - 1;
    case 'saw': return 2 * p - 1 - blep(p, dt);
    case 'square': return (p < 0.5 ? 1 : -1) + blep(p, dt) - blep(p < 0.5 ? p + 0.5 : p - 0.5, dt);
    default: return rand() * 2 - 1;
  }
}

/** Bus de mixage circulaire : ce qui dépasse la fin revient au début. */
class Mix {
  readonly L: Float32Array;
  readonly R: Float32Array;
  readonly rev: Float32Array;
  readonly echo: Float32Array;
  constructor(readonly n: number) {
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
    this.rev = new Float32Array(n);
    this.echo = new Float32Array(n);
  }

  /** Écrit un échantillon (gauche, droite) à l'indice `i` (déjà ramené dans la boucle) et l'envoie aux effets. */
  put(i: number, l: number, r: number, rev: number, echo: number): void {
    this.L[i] += l;
    this.R[i] += r;
    const m = (l + r) * 0.5;
    this.rev[i] += m * rev;
    this.echo[i] += m * echo;
  }
}

interface Out { pan: number; spread: number; fx: Sends }
const panL = (p: number) => Math.cos(((clamp1(p) + 1) * Math.PI) / 4);
const panR = (p: number) => Math.sin(((clamp1(p) + 1) * Math.PI) / 4);

/** Une note d'oscillateur(s) : enveloppe, voix désaccordées étalées en stéréo, passe-bas 12 dB/oct, glissando. */
function note(m: Mix, start: number, hold: number, freq: number, t: Tone, level: number, o: Out, rand: () => number): void {
  if (t.wave === 'pluck') return pluck(m, start, freq, t, level, o, rand);
  if (t.wave === 'bell') return bell(m, start, freq, t, level, o);
  const attack = Math.max(len(t.attack ?? 0.005), 1);
  const decayK = t.decay ? Math.exp(-1 / (t.decay * RATE)) : 1;
  const sustain = t.sustain ?? (t.decay ? 0 : 1);
  const holdN = len(hold), rel = Math.max(len(t.release ?? 0.05), 1);
  const voices = t.unison ?? 1;
  const cut = t.cutoff ? onePole(t.cutoff) : 1;
  const ph = new Float64Array(voices), inc = new Float64Array(voices), gl = new Float64Array(voices), gr = new Float64Array(voices);
  for (let v = 0; v < voices; v++) {
    const x = voices > 1 ? v / (voices - 1) - 0.5 : 0;
    inc[v] = (freq * 2 ** ((x * (t.detune ?? 0)) / 1200)) / RATE;
    ph[v] = rand();
    const p = o.pan + x * o.spread;
    gl[v] = panL(p) / Math.sqrt(voices);
    gr[v] = panR(p) / Math.sqrt(voices);
  }
  const glideK = t.glide ? Math.exp(-1 / ((t.glideTime ?? 0.05) * RATE)) : 0;
  let g = (t.glide ?? 1) - 1, d = 1, l1 = 0, l2 = 0, r1 = 0, r2 = 0;
  const rev = o.fx.reverb ?? 0, echo = o.fx.echo ?? 0;
  let i = start % m.n;
  for (let j = 0, end = holdN + rel; j < end; j++) {
    let e = (j < attack ? j / attack : 1) * (sustain + (1 - sustain) * d);
    if (j >= holdN) e *= 1 - (j - holdN) / rel;
    d *= decayK;
    const k = 1 + g;
    g *= glideK;
    let sl = 0, sr = 0;
    for (let v = 0; v < voices; v++) {
      const dt = inc[v] * k;
      let p = ph[v] + dt;
      if (p >= 1) p -= Math.floor(p);
      ph[v] = p;
      const s = osc(t.wave, p, dt, rand);
      sl += s * gl[v];
      sr += s * gr[v];
    }
    if (cut < 1) {
      l1 += cut * (sl - l1); l2 += cut * (l1 - l2);
      r1 += cut * (sr - r1); r2 += cut * (r1 - r2);
    } else { l2 = sl; r2 = sr; }
    const a = e * level;
    m.put(i, l2 * a, r2 * a, rev, echo);
    if (++i === m.n) i = 0;
  }
}

/** Corde pincée (Karplus-Strong) : un bruit bref qui circule dans une ligne à retard de la longueur d'une période. */
function pluck(m: Mix, start: number, freq: number, t: Tone, level: number, o: Out, rand: () => number): void {
  const p = Math.max(2, Math.round(RATE / freq - 0.5));
  const line = new Float32Array(p);
  const c = onePole(t.cutoff ?? 4000);
  let lp = 0, mean = 0, pow = 0;
  for (let k = 0; k < p; k++) { lp += c * (rand() * 2 - 1 - lp); line[k] = lp; mean += lp / p; }
  for (let k = 0; k < p; k++) { line[k] -= mean; pow += (line[k] * line[k]) / p; }
  const norm = 0.5 / Math.sqrt(pow || 1);
  const n = len(t.decay ?? 1), loss = 0.001 ** (p / n), fade = len(0.005);
  const al = panL(o.pan) * level * norm, ar = panR(o.pan) * level * norm;
  const rev = o.fx.reverb ?? 0, echo = o.fx.echo ?? 0;
  let i = start % m.n, k = 0;
  for (let j = 0; j < n; j++) {
    const cur = line[k], k2 = k + 1 === p ? 0 : k + 1;
    line[k] = loss * 0.5 * (cur + line[k2]);
    k = k2;
    const s = cur * (j < fade ? j / fade : j > n - fade ? (n - j) / fade : 1);
    m.put(i, s * al, s * ar, rev, echo);
    if (++i === m.n) i = 0;
  }
}

/** Cloche FM : porteuse sinus modulée par une sinusoïde au rapport `ratio`, modulation qui s'éteint plus vite que le son. */
function bell(m: Mix, start: number, freq: number, t: Tone, level: number, o: Out): void {
  const n = len(t.decay ?? 1.5), attack = Math.max(len(t.attack ?? 0.003), 1), fade = len(0.005);
  const k = Math.exp(-6.9 / n), ki = Math.exp(-17 / n);
  const ic = freq / RATE, im = (freq * (t.ratio ?? 3.5)) / RATE;
  const al = panL(o.pan) * level, ar = panR(o.pan) * level;
  const rev = o.fx.reverb ?? 0, echo = o.fx.echo ?? 0;
  let env = 1, index = t.index ?? 2, pc = 0, pm = 0, i = start % m.n;
  for (let j = 0; j < n; j++) {
    const s = Math.sin(TAU * pc + index * Math.sin(TAU * pm)) * env * (j < attack ? j / attack : j > n - fade ? (n - j) / fade : 1);
    env *= k; index *= ki;
    pc += ic; if (pc >= 1) pc -= 1;
    pm += im; if (pm >= 1) pm -= Math.floor(pm);
    m.put(i, s * al, s * ar, rev, echo);
    if (++i === m.n) i = 0;
  }
}

/**
 * Bourdon tenu toute la boucle : chaque fréquence est arrondie à un nombre entier de cycles par boucle
 * (écart inaudible, < 0,1 Hz), donc la phase en fin de boucle est celle du début.
 */
function drone(m: Mix, s: Soundscape, p: Extract<Part, { kind: 'drone' }>, rand: () => number): void {
  const n = m.n, t = p.tone, voices = t.unison ?? 1;
  const oscs: { cycles: number; ph: number; gl: number; gr: number }[] = [];
  p.notes.forEach((deg, ni) => {
    for (let v = 0; v < voices; v++) {
      const x = voices > 1 ? v / (voices - 1) - 0.5 : 0;
      const f = hz(degreeToMidi(s.root + (p.transpose ?? 0), s.scale, deg)) * 2 ** ((x * (t.detune ?? 0)) / 1200);
      const pan = (p.pan ?? 0) + (p.notes.length > 1 ? ni / (p.notes.length - 1) - 0.5 : 0) * (p.spread ?? 0) + x * 0.3;
      const norm = 1 / Math.sqrt(voices * p.notes.length);
      oscs.push({ cycles: Math.max(1, Math.round((f * n) / RATE)), ph: rand(), gl: panL(pan) * norm, gr: panR(pan) * norm });
    }
  });
  const cut = t.cutoff ? onePole(t.cutoff) : 1, warm = Math.min(n, len(0.25)), breath = rand();
  const rev = p.reverb ?? 0, echo = p.echo ?? 0;
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
  for (let c = -warm; c < n; c++) {
    const i = c < 0 ? c + n : c;
    let sl = 0, sr = 0;
    for (const v of oscs) {
      let ph = v.ph + ((v.cycles * i) % n) / n;
      if (ph >= 1) ph -= 1;
      const o = osc(t.wave, ph, v.cycles / n, rand);
      sl += o * v.gl;
      sr += o * v.gr;
    }
    l1 += cut * (sl - l1); l2 += cut * (l1 - l2);
    r1 += cut * (sr - r1); r2 += cut * (r1 - r2);
    if (c < 0) continue;
    // Lente respiration : 2 cycles par boucle.
    const a = p.level * (0.8 + 0.2 * Math.sin(TAU * ((2 * i) / n + breath)));
    m.put(i, l2 * a, r2 * a, rev, echo);
  }
}

/** Vent ou grondement : bruit (indépendant à gauche et à droite) filtré, rafales et balayage périodiques. */
function noise(m: Mix, p: Extract<Part, { kind: 'noise' }>, seed: number): void {
  const n = m.n, warm = Math.min(n, len(0.5)), damping = 1 / p.q;
  const r = rng(seed), ph1 = r() * TAU, ph2 = r() * TAU, gusts2 = p.gusts * 2 + 1;
  const norm = p.filter === 'band' ? damping : 1; // passe-bande de gain 1 au centre
  let f = 0, lowL = 0, bandL = 0, lowR = 0, bandR = 0;
  const rev = p.reverb ?? 0, echo = p.echo ?? 0;
  for (let c = -warm; c < n; c++) {
    const i = c < 0 ? c + n : c;
    const shape = 0.7 * (0.5 + 0.5 * Math.sin((TAU * p.gusts * i) / n + ph1)) + 0.3 * (0.5 + 0.5 * Math.sin((TAU * gusts2 * i) / n + ph2));
    if ((c & 15) === 0 || c === -warm) {
      const fc = Math.min(p.cutoff * 2 ** (p.sweep * (shape - 0.5)), RATE / 7);
      f = 2 * Math.sin((Math.PI * fc) / RATE);
    }
    const xl = hashNoise(i, seed), xr = hashNoise(i, seed + 1);
    lowL += f * bandL; bandL += f * (xl - lowL - damping * bandL);
    lowR += f * bandR; bandR += f * (xr - lowR - damping * bandR);
    if (c < 0) continue;
    const a = p.level * norm * (1 - p.depth + p.depth * shape);
    m.put(i, (p.filter === 'band' ? bandL : lowL) * a, (p.filter === 'band' ? bandR : lowR) * a, rev, echo);
  }
}

/** Braises : de brefs claquements secs, surtout petits, parfois plus forts. */
function crackle(m: Mix, p: Extract<Part, { kind: 'crackle' }>, seed: number): void {
  const r = rng(seed), n = m.n;
  for (let c = Math.round((p.rate * n) / RATE); c > 0; c--) {
    const at = Math.floor(r() * n), a = p.level * (0.15 + 0.85 * r() ** 3), size = 20 + Math.floor(r() * 110), pan = r() * 1.6 - 0.8;
    const al = panL(pan) * a, ar = panR(pan) * a;
    let prev = 0;
    for (let j = 0, i = at; j < size; j++) {
      const x = (r() * 2 - 1) * (1 - j / size) ** 2;
      const y = x - prev; // dérivée : un claquement aigu, sans grave
      prev = x;
      m.put(i, y * al, y * ar, p.reverb ?? 0, p.echo ?? 0);
      if (++i === n) i = 0;
    }
  }
}

/** Notes de l'accord en cours : 0 fondamentale, 1 tierce, 2 quinte… (on empile les degrés de deux en deux). */
const chordTone = (chord: number, k: number) => chord + 2 * k;

function score(m: Mix, s: Soundscape, p: Part, seed: number): void {
  const r = rng(seed), beat = 60 / s.bpm, total = s.chords.length * s.chordBeats;
  const at = (b: number) => Math.round(b * beat * RATE);
  const chordAt = (b: number) => s.chords[Math.floor(b / s.chordBeats) % s.chords.length];
  switch (p.kind) {
    case 'pad':
      s.chords.forEach((chord, ci) => p.notes.forEach((k, ni) => {
        const midi = degreeToMidi(s.root + (p.transpose ?? 0), s.scale, chordTone(chord, k));
        const pan = (p.pan ?? 0) + (p.notes.length > 1 ? ni / (p.notes.length - 1) - 0.5 : 0) * (p.spread ?? 0);
        note(m, at(ci * s.chordBeats), s.chordBeats * beat, hz(midi), p.tone, p.level, { pan, spread: p.spread ?? 0, fx: p }, r);
      }));
      return;
    case 'seq':
      for (let k = 0; k * p.step < total; k++) {
        const entry = p.notes[k % p.notes.length];
        if (entry === null) continue;
        const b = k * p.step;
        const midi = p.pitch ?? degreeToMidi(s.root + (p.transpose ?? 0), s.scale, chordTone(chordAt(b), entry));
        const pan = (p.pan ?? 0) + (r() - 0.5) * (p.spread ?? 0);
        note(m, at(b), p.tone.hold ?? p.step * beat * 0.5, hz(midi), p.tone, p.level, { pan, spread: 0, fx: p }, r);
      }
      return;
    case 'random': {
      const [lo, hi] = p.range, n = s.scale.length;
      let deg = Math.round((lo + hi) / 2);
      for (let k = 0; k * p.step < total; k++) {
        if (r() >= p.chance) continue;
        const b = k * p.step;
        deg += [-2, -1, 1, 2][Math.floor(r() * 4)];
        if (deg < lo) deg = lo + (lo - deg);
        if (deg > hi) deg = hi - (deg - hi);
        // Plus d'une fois sur deux, on se cale sur la note de l'accord la plus proche : la mélodie reste consonante.
        const chord = chordAt(b);
        const inChord = (x: number) => { const o = (((x - chord) % n) + n) % n; return o % 2 === 0 && o <= 4; };
        if (r() < 0.6) for (const dd of [0, -1, 1, -2, 2]) if (deg + dd >= lo && deg + dd <= hi && inChord(deg + dd)) { deg += dd; break; }
        const pan = (p.pan ?? 0) + (r() - 0.5) * (p.spread ?? 0);
        const midi = degreeToMidi(s.root + (p.transpose ?? 0), s.scale, deg);
        note(m, at(b), p.tone.hold ?? p.step * beat, hz(midi), p.tone, p.level, { pan, spread: 0, fx: p }, r);
      }
      return;
    }
    case 'drone': return drone(m, s, p, r);
    case 'noise': return noise(m, p, seed);
    case 'crackle': return crackle(m, p, seed);
  }
}

/** Ligne à retard circulaire (écho, filtres de la réverbération). */
class Line {
  readonly buf: Float32Array;
  k = 0;
  lp = 0;
  constructor(n: number) { this.buf = new Float32Array(n); }
}

/** Filtre en peigne amorti (Freeverb) : renvoie la sortie, réinjecte l'entrée et la sortie assombrie. */
function comb(c: Line, x: number, fb: number, damp: number): number {
  const y = c.buf[c.k];
  c.lp = y * (1 - damp) + c.lp * damp;
  c.buf[c.k] = x + c.lp * fb;
  if (++c.k === c.buf.length) c.k = 0;
  return y;
}

function allpass(a: Line, x: number): number {
  const y = a.buf[a.k];
  a.buf[a.k] = x + y * 0.5;
  if (++a.k === a.buf.length) a.k = 0;
  return y - x;
}

/** Écho ping-pong (assombri à chaque retour) puis réverbération : 4 filtres en peigne, 2 passe-tout par canal. */
function effects(m: Mix, s: Soundscape): void {
  const n = m.n, warm = Math.min(n, len(4));
  const D = Math.max(1, len((s.echo.beats * 60) / s.bpm)), dl = new Line(D), dr = new Line(D);
  const fb = s.echo.feedback, dampE = onePole(3500);
  const [c0, c1, c2, c3] = [558, 638, 711, 778].map((l) => new Line(l));
  const cfb = 0.7 + 0.28 * s.reverb.size, damp = s.reverb.damp * 0.5;
  const [l0, l1, r0, r1] = [278, 170, 220, 112].map((l) => new Line(l));
  for (let c = -warm; c < n; c++) {
    const i = c < 0 ? c + n : c;
    const k = dl.k, yl = dl.buf[k], yr = dr.buf[k];
    dl.lp += dampE * (yr - dl.lp);
    dl.buf[k] = m.echo[i] + dl.lp * fb; // gauche : entrée + retour venu de droite
    dr.buf[k] = yl; // droite : ce qui sort de gauche
    if (++dl.k === D) dl.k = 0;

    const x = m.rev[i] + (yl + yr) * 0.25;
    const sum = (comb(c0, x, cfb, damp) + comb(c1, x, cfb, damp) + comb(c2, x, cfb, damp) + comb(c3, x, cfb, damp)) * 0.25;
    const wl = allpass(l1, allpass(l0, sum)), wr = allpass(r1, allpass(r0, sum));
    if (c < 0) continue;
    m.L[i] += yl + wl;
    m.R[i] += yr + wr;
  }
}

/** Volume perçu (dB) : RMS du milieu (G+D) sans les infra-basses. */
function loudness(L: Float32Array, R: Float32Array): number {
  const a = Math.exp((-TAU * 150) / RATE);
  let lp = 0, sum = 0;
  for (let i = 0; i < L.length; i++) {
    const x = (L[i] + R[i]) / 2;
    lp = (1 - a) * x + a * lp;
    sum += (x - lp) ** 2;
  }
  return 10 * Math.log10(sum / L.length || 1e-12);
}

/** Écrêtage doux : linéaire jusqu'à 0,6, puis s'approche de 0,98 sans jamais l'atteindre. */
function soft(x: number): number {
  const knee = 0.6, room = 0.98 - knee, a = Math.abs(x);
  return a <= knee ? x : Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
}

function finish(L: Float32Array, R: Float32Array, gain: number): Stereo {
  for (let i = 0; i < L.length; i++) { L[i] = soft(L[i] * gain); R[i] = soft(R[i] * gain); }
  return { left: L, right: R };
}

/** Effet sonore : normalisé en crête, fondu d'entrée et de sortie (aucun clic). */
function sfx(seconds: number, draw: (m: Mix) => void): Stereo {
  const m = new Mix(len(seconds));
  draw(m);
  let pk = 0;
  for (let i = 0; i < m.n; i++) pk = Math.max(pk, Math.abs(m.L[i]), Math.abs(m.R[i]));
  const fade = len(0.004), out = finish(m.L, m.R, 0.9 / (pk || 1));
  for (let j = 0; j < fade; j++) {
    const g = j / fade;
    out.left[j] *= g; out.right[j] *= g;
    out.left[m.n - 1 - j] *= g; out.right[m.n - 1 - j] *= g;
  }
  return out;
}

/** Boucle d'ambiance, au volume perçu commun à tous les décors. */
function renderLoop(s: Soundscape, seed: number): Stereo {
  const m = new Mix(Math.round(loopSeconds(s) * RATE));
  s.parts.forEach((p, k) => score(m, s, p, seed + 7919 * (k + 1)));
  effects(m, s);
  return finish(m.L, m.R, 10 ** ((LOUDNESS - loudness(m.L, m.R)) / 20));
}

/**
 * Effets sonores accordés au décor, et sa boucle d'ambiance si `withLoop`
 * (sans ambiance, on évite le gros du calcul et 3 Mo de mémoire).
 */
export function renderSoundscape(s: Soundscape, withLoop = true): RenderedSoundscape {
  const seed = s.bpm * 1000 + s.root;
  const center: Out = { pan: 0, spread: 0, fx: {} };
  const r = rng(seed);
  const deg = (d: number) => hz(degreeToMidi(s.root, s.scale, d));
  const octave = s.scale.length;
  return {
    rate: RATE,
    ...(withLoop ? { loop: renderLoop(s, seed) } : {}),
    // Saut : petit « bip » montant, sur la quinte de la tonique, deux octaves au-dessus.
    jump: sfx(0.12, (x) => note(x, 0, 0.05, hz(s.root + 31), { wave: 'triangle', attack: 0.002, decay: 0.04, release: 0.03, glide: 0.6, glideTime: 0.025, cutoff: 3500 }, 1, center, r)),
    // Choc : souffle de bruit qui s'assombrit et coup sourd qui plonge.
    crash: sfx(0.9, (x) => {
      note(x, 0, 0.35, 1, { wave: 'noise', attack: 0.001, decay: 0.12, release: 0.3, cutoff: 1800 }, 1, center, r);
      note(x, 0, 0.3, hz(s.root - 12), { wave: 'sine', attack: 0.002, decay: 0.18, release: 0.2, glide: 3, glideTime: 0.06 }, 0.9, center, r);
    }),
    // Victoire : arpège de cloches sur l'accord de la tonique, jusqu'à l'octave au-dessus.
    win: sfx(2, (x) => [0, 2, 4, octave, octave + 2, octave + 4].forEach((d, k) =>
      bell(x, len(0.09 * k), deg(octave + d), { wave: 'bell', ratio: 2, index: 1.2, decay: k === 5 ? 1.5 : 0.8 }, k === 5 ? 0.7 : 0.5, { pan: (k % 2 ? 0.3 : -0.3), spread: 0, fx: {} }))),
  };
}
