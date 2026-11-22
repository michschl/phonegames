import { seeded, type Rng } from '../solo/logic.ts';

/*
 * Beat-Bahn: a song made by the app (drums, bass, chords, a melody) and the notes to tap – the melody on
 * four lanes, low to high. The same seed gives the same song. Pure functions, see beat.test.ts.
 */

export interface BeatStyle {
  name: string;
  bpm: number;
  /** Notes per beat at most (2 = eighths). */
  grid: number;
  lead: OscillatorType;
  /** Root notes of the chords (MIDI), one chord per bar. */
  progression: number[];
}

export const STYLES: BeatStyle[] = [
  { name: 'Pop', bpm: 100, grid: 2, lead: 'triangle', progression: [60, 67, 69, 65] }, // C G Am F
  { name: 'House', bpm: 122, grid: 2, lead: 'sawtooth', progression: [57, 53, 60, 55] }, // Am F C G
  { name: 'Chip', bpm: 140, grid: 2, lead: 'square', progression: [62, 58, 60, 57] }, // Dm Bb C A
];

export interface Note {
  /** Seconds from the start of the song. */
  time: number;
  lane: number;
  /** MIDI pitch of the melody note. */
  pitch: number;
}

export interface Section {
  name: 'intro' | 'verse' | 'chorus' | 'break' | 'outro';
  bars: number;
}

export interface Song {
  style: BeatStyle;
  /** Seconds per beat. */
  beat: number;
  bars: number;
  sections: Section[];
  notes: Note[];
  /** Seconds until the song has ended. */
  length: number;
}

const SECTIONS: Section[] = [
  { name: 'intro', bars: 4 },
  { name: 'verse', bars: 8 },
  { name: 'chorus', bars: 8 },
  { name: 'break', bars: 4 },
  { name: 'chorus', bars: 8 },
  { name: 'outro', bars: 4 },
];

/** Minor/major scale steps above the chord root that sound good in every bar. */
const CHORD_TONES = [0, 4, 7, 12];
const MINOR_TONES = [0, 3, 7, 12];

/** A two-bar motif: positions (in grid steps of the two bars) and a chord tone index 0–3 each. */
function motif(rng: Rng, steps: number, density: number): { step: number; tone: number }[] {
  const result: { step: number; tone: number }[] = [];
  let tone = Math.floor(rng() * 4);
  for (let step = 0; step < steps; step++) {
    const strong = step % 2 === 0;
    if (rng() < (strong ? density : density * 0.45)) {
      tone = Math.max(0, Math.min(3, tone + (rng() < 0.5 ? -1 : 1) * (rng() < 0.3 ? 2 : 1)));
      result.push({ step, tone });
    }
  }
  if (result.length === 0) result.push({ step: 0, tone: 0 });
  return result;
}

export function makeSong(styleIndex: number, seed: number): Song {
  const style = STYLES[styleIndex] ?? STYLES[0]!;
  const rng = seeded(seed);
  const beat = 60 / style.bpm;
  const stepsPerBar = 4 * style.grid;
  const step = beat / style.grid;
  const minor = styleIndex !== 0;
  // One motif for verses, a busier one for the choruses – repeated, so the player learns it.
  const verse = motif(rng, stepsPerBar * 2, 0.45);
  const chorus = motif(rng, stepsPerBar * 2, 0.7);
  const notes: Note[] = [];
  let bar = 0;
  const lead = 1.5 + beat * 4; // a count-in before the first note
  for (const section of SECTIONS) {
    for (let b = 0; b < section.bars; b++, bar++) {
      const root = style.progression[bar % style.progression.length]!;
      const tones = minor && bar % 4 !== 2 ? MINOR_TONES : CHORD_TONES;
      const pattern =
        section.name === 'intro' || section.name === 'outro'
          ? [{ step: 0, tone: 0 }, { step: stepsPerBar / 2, tone: 2 }]
          : section.name === 'break'
            ? [{ step: 0, tone: 3 }]
            : section.name === 'verse'
              ? verse
              : chorus;
      for (const event of pattern) {
        // Two-bar motifs: the first half in even bars, the second in odd bars.
        const local = section.name === 'verse' || section.name === 'chorus' ? event.step - (b % 2) * stepsPerBar : event.step;
        if (local < 0 || local >= stepsPerBar) continue;
        notes.push({ time: lead + (bar * stepsPerBar + local) * step, lane: event.tone, pitch: root + 12 + tones[event.tone]! });
      }
    }
  }
  notes.sort((a, b) => a.time - b.time);
  return { style, beat, bars: bar, sections: SECTIONS, notes, length: lead + bar * stepsPerBar * step + 1.5 };
}

/** The section at a time of the song (for the light show). */
export function sectionAt(song: Song, time: number): Section['name'] {
  const lead = 1.5 + song.beat * 4;
  const barLength = song.beat * 4;
  let bar = Math.floor((time - lead) / barLength);
  if (bar < 0) return 'intro';
  for (const section of song.sections) {
    if (bar < section.bars) return section.name;
    bar -= section.bars;
  }
  return 'outro';
}

export type Judgement = 'perfekt' | 'gut' | 'daneben';

/** How exact a tap was: up to 60 ms «Perfekt», up to 130 ms «Gut». */
export function judge(offset: number): Judgement {
  const off = Math.abs(offset);
  return off <= 0.06 ? 'perfekt' : off <= 0.13 ? 'gut' : 'daneben';
}

export const WINDOW = 0.13;

/** The multiplier for a streak: ×1, from 10 in a row ×2, from 20 ×3, from 30 ×4. */
export function multiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(combo / 10));
}

export function points(judgement: Judgement, combo: number): number {
  return (judgement === 'perfekt' ? 300 : judgement === 'gut' ? 100 : 0) * multiplier(combo);
}

/** Stars from the share of notes hit (perfect counts full, good half). */
export function beatStars(perfect: number, good: number, total: number): number {
  const share = total > 0 ? (perfect + good * 0.5) / total : 0;
  return share >= 0.85 ? 3 : share >= 0.6 ? 2 : share >= 0.35 ? 1 : 0;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
