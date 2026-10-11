/**
 * Ambiances sonores, une par décor : uniquement des notes et des paramètres de synthèse, aucun fichier audio.
 * `synth.ts` en fait une boucle stéréo (rendue hors du fil principal, cf. `render.worker.ts`).
 * Ajouter un décor sans ambiance ne compile pas (`Record<ThemeId, …>`).
 */
import type { ThemeId } from '../render/themes';

export type Wave = 'sine' | 'triangle' | 'saw' | 'square' | 'noise' | 'pluck' | 'bell';

/** Timbre d'une note. Durées en secondes. */
export interface Tone {
  wave: Wave;
  /** Montée linéaire, puis chute exponentielle (`decay`, constante de temps) vers `sustain` (0…1). */
  attack?: number;
  decay?: number;
  sustain?: number;
  /** Fin linéaire après la tenue. */
  release?: number;
  /** Tenue d'une note de motif ; les nappes, elles, tiennent tout l'accord. */
  hold?: number;
  /** Passe-bas (Hz), 12 dB/octave. */
  cutoff?: number;
  /** Voix désaccordées (épaisseur) : `detune` = écart en cents entre les deux extrêmes. */
  unison?: number;
  detune?: number;
  /** Glissando : la note part de `glide` × sa fréquence (grosse caisse, chant d'oiseau). */
  glide?: number;
  glideTime?: number;
  /** Cloche FM : rapport modulante / porteuse et indice de modulation. */
  ratio?: number;
  index?: number;
}

/** Envois vers les effets communs (0…1). */
export interface Sends { reverb?: number; echo?: number }

interface Voice extends Sends {
  tone: Tone;
  /** Transposition depuis la tonique, en demi-tons (0 par défaut). */
  transpose?: number;
  level: number;
  /** Position stéréo (-1…1) et écart aléatoire autour. */
  pan?: number;
  spread?: number;
}

export type Part =
  /** Nappe : les notes de l'accord (`notes` : 0 fondamentale, 1 tierce, 2 quinte, 3 septième…) tenues tout l'accord. */
  | (Voice & { kind: 'pad'; notes: readonly number[] })
  /** Motif répété, un pas tous les `step` temps : notes de l'accord, ou `pitch` fixe (percussions) ; null = silence. */
  | (Voice & { kind: 'seq'; step: number; notes: readonly (number | null)[]; pitch?: number })
  /** Mélodie aléatoire (graine fixe) : marche dans la gamme entre les degrés `range`, une note par pas avec `chance`. */
  | (Voice & { kind: 'random'; step: number; chance: number; range: readonly [number, number] })
  /** Bourdon continu : degrés de la gamme tenus toute la boucle, avec une lente respiration. */
  | (Voice & { kind: 'drone'; notes: readonly number[] })
  /** Bruit filtré (vent, grondement) avec rafales : `gusts` cycles par boucle, `sweep` octaves de balayage. */
  | (Sends & { kind: 'noise'; filter: 'low' | 'band'; cutoff: number; q: number; sweep: number; gusts: number; depth: number; level: number })
  /** Crépitements (braises) : `rate` par seconde en moyenne. */
  | (Sends & { kind: 'crackle'; rate: number; level: number });

export interface Soundscape {
  bpm: number;
  /** Tonique (note MIDI) et gamme (demi-tons depuis la tonique). */
  root: number;
  scale: readonly number[];
  /** Grille d'accords : degrés de la gamme, un accord tous les `chordBeats` temps. La boucle dure toute la grille. */
  chords: readonly number[];
  chordBeats: number;
  parts: readonly Part[];
  /** Réverbération (taille 0…1) et écho ping-pong (`beats` temps), où les voix envoient selon leurs `Sends`. */
  reverb: { size: number; damp: number };
  echo: { beats: number; feedback: number };
}

export const loopSeconds = (s: Soundscape): number => (s.chords.length * s.chordBeats * 60) / s.bpm;

/** Degré de gamme → note MIDI (degré 7 d'une gamme de 7 notes = octave au-dessus). */
export function degreeToMidi(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length;
  const oct = Math.floor(degree / n);
  return root + 12 * oct + scale[degree - oct * n];
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];

// Timbres partagés.
const kick: Tone = { wave: 'sine', attack: 0.002, decay: 0.12, hold: 0.25, release: 0.05, glide: 4, glideTime: 0.03 };
const pluck = (decay: number, cutoff: number): Tone => ({ wave: 'pluck', decay, cutoff });

export const SOUNDSCAPES: Record<ThemeId, Soundscape> = {
  // Synthwave : la mineur, i–VI–III–VII, arpège carré en écho, basse pulsée, grosse caisse à chaque temps.
  neon: {
    bpm: 100, root: 45, scale: MINOR, chords: [0, 5, 2, 6, 0, 5, 3, 4], chordBeats: 4,
    reverb: { size: 0.6, damp: 0.4 }, echo: { beats: 0.75, feedback: 0.4 },
    parts: [
      { kind: 'pad', notes: [0, 1, 2], transpose: 12, level: 0.2, spread: 0.8, reverb: 0.5,
        tone: { wave: 'saw', unison: 3, detune: 18, attack: 0.5, release: 0.8, sustain: 1, cutoff: 1500 } },
      { kind: 'seq', step: 0.5, notes: [0], transpose: -12, level: 0.32, reverb: 0.05,
        tone: { wave: 'saw', attack: 0.004, decay: 0.12, sustain: 0.25, hold: 0.2, release: 0.04, cutoff: 500 } },
      { kind: 'seq', step: 0.25, notes: [0, 1, 2, 3, 4, 3, 2, 1], transpose: 24, level: 0.18, pan: 0.25, echo: 0.5, reverb: 0.3,
        tone: { wave: 'square', attack: 0.003, decay: 0.08, hold: 0.1, release: 0.04, cutoff: 2800 } },
      { kind: 'seq', step: 1, notes: [0], pitch: 33, level: 0.55, tone: kick },
      { kind: 'random', step: 1, chance: 0.3, range: [7, 14], transpose: 12, level: 0.18, spread: 1, reverb: 0.8, echo: 0.4,
        tone: { wave: 'bell', ratio: 2, index: 1.5, attack: 0.005, decay: 0.6 } },
    ],
  },
  // Clairière : ré majeur pentatonique, harpe pincée au hasard, oiseaux, feuillage dans le vent, basse douce.
  foret: {
    bpm: 80, root: 50, scale: MAJOR_PENTATONIC, chords: [0, 3, 1, 4], chordBeats: 6,
    reverb: { size: 0.75, damp: 0.5 }, echo: { beats: 1.5, feedback: 0.3 },
    parts: [
      { kind: 'pad', notes: [0, 1, 2], transpose: 12, level: 0.16, spread: 0.7, reverb: 0.6,
        tone: { wave: 'triangle', unison: 2, detune: 8, attack: 1.5, release: 2, sustain: 1, cutoff: 1800 } },
      { kind: 'pad', notes: [0], transpose: -12, level: 0.22, tone: { wave: 'sine', attack: 0.8, release: 1.5, sustain: 1 } },
      { kind: 'random', step: 0.5, chance: 0.5, range: [5, 13], level: 0.85, spread: 0.7, reverb: 0.5, echo: 0.3,
        tone: pluck(1.4, 3000) },
      { kind: 'random', step: 0.25, chance: 0.07, range: [20, 26], level: 0.27, spread: 1.6, reverb: 0.4,
        tone: { wave: 'sine', attack: 0.004, decay: 0.05, hold: 0.09, release: 0.02, glide: 0.75, glideTime: 0.04 } },
      { kind: 'noise', filter: 'band', cutoff: 1100, q: 0.9, sweep: 1, gusts: 3, depth: 0.75, level: 0.1, reverb: 0.2 },
    ],
  },
  // Désert : mi phrygien dominant (couleur orientale), bourdon façon tanpura, oud pincé, tambour, vent qui siffle.
  dunes: {
    bpm: 88, root: 40, scale: PHRYGIAN_DOMINANT, chords: [0, 1, 0, 6], chordBeats: 6,
    reverb: { size: 0.55, damp: 0.6 }, echo: { beats: 0.5, feedback: 0.25 },
    parts: [
      { kind: 'drone', notes: [0, 4, 7], level: 0.14, spread: 0.6, reverb: 0.3,
        tone: { wave: 'saw', unison: 2, detune: 6, cutoff: 700 } },
      { kind: 'random', step: 0.25, chance: 0.35, range: [7, 16], level: 0.6, spread: 0.6, reverb: 0.35, echo: 0.25,
        tone: pluck(0.9, 2200) },
      { kind: 'seq', step: 0.5, notes: [0, null, null, 0, null, null, 0, null], pitch: 45, level: 0.35, reverb: 0.2,
        tone: { wave: 'sine', attack: 0.002, decay: 0.09, hold: 0.18, release: 0.04, glide: 2, glideTime: 0.02 } },
      { kind: 'seq', step: 0.5, notes: [null, null, 0, null, 0, null, null, 0], pitch: 96, level: 0.32, pan: -0.3, reverb: 0.3,
        tone: { wave: 'noise', attack: 0.001, decay: 0.025, hold: 0.05, release: 0.01, cutoff: 6000 } },
      { kind: 'noise', filter: 'band', cutoff: 600, q: 1.6, sweep: 1.2, gusts: 2, depth: 0.85, level: 0.25, reverb: 0.2 },
    ],
  },
  // Banquise : fa lydien, nappe de verre, cloches cristallines en écho, vent glacé qui siffle, grande réverbération.
  glacier: {
    bpm: 60, root: 53, scale: LYDIAN, chords: [0, 1, 5, 1], chordBeats: 4,
    reverb: { size: 0.9, damp: 0.25 }, echo: { beats: 1, feedback: 0.45 },
    parts: [
      { kind: 'pad', notes: [0, 1, 2, 3], level: 0.13, spread: 0.9, reverb: 0.7,
        tone: { wave: 'triangle', unison: 3, detune: 7, attack: 1.8, release: 2.5, sustain: 1, cutoff: 2600 } },
      { kind: 'pad', notes: [0], transpose: -12, level: 0.16, tone: { wave: 'sine', attack: 1.2, release: 2, sustain: 1 } },
      { kind: 'random', step: 0.5, chance: 0.4, range: [7, 16], level: 0.25, spread: 1.4, reverb: 0.6, echo: 0.45,
        tone: { wave: 'bell', ratio: 3.5, index: 2, attack: 0.003, decay: 2 } },
      { kind: 'noise', filter: 'band', cutoff: 1500, q: 5, sweep: 1.4, gusts: 3, depth: 0.85, level: 0.2, reverb: 0.3 },
    ],
  },
  // Volcan : do# phrygien, bourdon grave, grondement de la terre, braises qui crépitent, battement de cœur.
  volcan: {
    bpm: 84, root: 37, scale: PHRYGIAN, chords: [0, 1, 0, 6], chordBeats: 6,
    reverb: { size: 0.7, damp: 0.55 }, echo: { beats: 0.75, feedback: 0.3 },
    parts: [
      { kind: 'drone', notes: [0, 4], level: 0.2, spread: 0.4, reverb: 0.2,
        tone: { wave: 'saw', unison: 2, detune: 10, cutoff: 320 } },
      { kind: 'pad', notes: [0, 1, 2], transpose: 12, level: 0.12, spread: 0.8, reverb: 0.5,
        tone: { wave: 'saw', unison: 2, detune: 12, attack: 1.5, release: 2, sustain: 1, cutoff: 750 } },
      { kind: 'noise', filter: 'low', cutoff: 110, q: 0.8, sweep: 0.8, gusts: 3, depth: 0.5, level: 0.7 },
      { kind: 'crackle', rate: 7, level: 1, reverb: 0.25 },
      { kind: 'seq', step: 0.25, notes: [0, null, 0, null, null, null, null, null, null, null, null, null, null, null, null, null],
        pitch: 37, level: 0.5, reverb: 0.15, tone: { ...kick, glide: 2.5, decay: 0.15, hold: 0.3 } },
      { kind: 'random', step: 1, chance: 0.35, range: [0, 5], level: 0.24, spread: 0.4, reverb: 0.4, echo: 0.2,
        tone: { wave: 'saw', attack: 0.15, decay: 0.8, sustain: 0.4, hold: 1.2, release: 0.6, cutoff: 600 } },
    ],
  },
};
