import type { SoloLevel } from './types.ts';

/*
 * The rules of the games of «Allein spielen» that can be tested without a screen: scores, puzzles,
 * things to sort. See logic.test.ts.
 */

export type Rng = () => number;

/** A random number generator with a seed (for the tests); Math.random otherwise. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(list: readonly T[], rng: Rng = Math.random): T {
  return list[Math.floor(rng() * list.length)]!;
}

export function shuffled<T>(list: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** 0–3 stars from a share of the best possible result. */
export function starsFor(share: number): number {
  return share >= 0.9 ? 3 : share >= 0.65 ? 2 : share >= 0.35 ? 1 : 0;
}

/* ------------------------------------------------------------- Memo-Blitz */

export const MEMO_SETS = [
  ['🐶', '🐱', '🦊', '🐼', '🐸', '🦁', '🐵', '🐧', '🐙', '🦄', '🐢', '🦋'],
  ['🍎', '🍌', '🍓', '🍇', '🍉', '🥕', '🍒', '🍍', '🥝', '🌽', '🍋', '🥨'],
  ['🚗', '🚀', '🚲', '🚂', '🚁', '⛵', '🚌', '🛴', '🚜', '✈️', '🚒', '🛸'],
  ['⚽', '🎸', '🎈', '🎨', '🧸', '🪁', '🎲', '🏀', '🎺', '🛼', '🪀', '🎯'],
];

export const MEMO_SIZE: Record<SoloLevel, { pairs: number; columns: number; previewMs: number }> = {
  1: { pairs: 6, columns: 3, previewMs: 4000 },
  2: { pairs: 10, columns: 4, previewMs: 3000 },
};

export function memoDeck(level: SoloLevel, rng: Rng = Math.random): string[] {
  const symbols = shuffled(pick(MEMO_SETS, rng), rng).slice(0, MEMO_SIZE[level].pairs);
  return shuffled([...symbols, ...symbols], rng);
}

/** Few moves and little time give more points; never below 10 per pair. */
export function memoScore(pairs: number, moves: number, seconds: number): number {
  const extraMoves = Math.max(0, moves - pairs);
  return Math.max(pairs * 10, pairs * 100 - extraMoves * 12 - Math.round(seconds) * 2);
}

export function memoStars(pairs: number, moves: number): number {
  const extra = Math.max(0, moves - pairs) / pairs;
  return extra <= 0.5 ? 3 : extra <= 1 ? 2 : extra <= 1.8 ? 1 : 0;
}

/* --------------------------------------------------------- Muster-Meister */

export interface Puzzle {
  /** The row; null is the gap («❓»). */
  items: (string | null)[];
  answer: string;
  /** Four choices, the answer among them. */
  options: string[];
  /** Numbers are shown bigger and the options as numbers. */
  numbers?: boolean;
}

const COLORS = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠'];
const SHAPES = ['⭐', '❤️', '🔷', '🔺', '🌙', '☀️'];
const ARROWS = ['⬆️', '➡️', '⬇️', '⬅️'];
const DIAGONAL = ['↗️', '↘️', '↙️', '↖️'];

function withOptions(answer: string, pool: string[], rng: Rng): string[] {
  const wrong = shuffled(
    [...new Set(pool)].filter((x) => x !== answer),
    rng,
  ).slice(0, 3);
  return shuffled([answer, ...wrong], rng);
}

/** A repeating row of a pattern like AB, AAB, ABC – the gap at the end or in the middle. */
function repeating(unit: string[], length: number, gapAt: number, pool: string[], rng: Rng): Puzzle {
  const row = Array.from({ length }, (_, i) => unit[i % unit.length]!);
  const answer = row[gapAt]!;
  return { items: row.map((x, i) => (i === gapAt ? null : x)), answer, options: withOptions(answer, pool, rng) };
}

function patternPuzzle(rng: Rng, hard: boolean): Puzzle {
  const pool = shuffled(pick([COLORS, SHAPES], rng), rng);
  const [a, b, c, d] = pool as [string, string, string, string];
  const units = hard ? [[a, b, c], [a, a, b, b], [a, b, b, c], [a, b, c, d], [a, b, a, c]] : [[a, b], [a, a, b], [a, b, b], [a, b, c]];
  const unit = pick(units, rng);
  const length = Math.max(6, unit.length * 2 + 1);
  const gapAt = hard && rng() < 0.4 ? Math.floor(length / 2) : length - 1;
  return repeating(unit, length, gapAt, pool.slice(0, 5), rng);
}

function arrowPuzzle(rng: Rng): Puzzle {
  const set = pick([ARROWS, DIAGONAL], rng);
  const step = pick([1, 1, 2, 3], rng); // turning a quarter, half or three quarters
  const start = Math.floor(rng() * 4);
  const row = Array.from({ length: 6 }, (_, i) => set[(start + i * step) % 4]!);
  const answer = row[5]!;
  return { items: [...row.slice(0, 5), null], answer, options: withOptions(answer, [...set], rng) };
}

function numberPuzzle(rng: Rng, hard: boolean): Puzzle {
  const kinds = hard ? ['add', 'sub', 'double', 'growing', 'alternate', 'square'] : ['add', 'add', 'sub'];
  const kind = pick(kinds, rng);
  let row: number[] = [];
  if (kind === 'add') {
    const step = 2 + Math.floor(rng() * (hard ? 9 : 4));
    const start = 1 + Math.floor(rng() * 10);
    row = Array.from({ length: 5 }, (_, i) => start + i * step);
  } else if (kind === 'sub') {
    const step = 2 + Math.floor(rng() * (hard ? 8 : 3));
    const start = step * 5 + Math.floor(rng() * 10);
    row = Array.from({ length: 5 }, (_, i) => start - i * step);
  } else if (kind === 'double') {
    const start = 1 + Math.floor(rng() * 3);
    row = Array.from({ length: 5 }, (_, i) => start * 2 ** i);
  } else if (kind === 'growing') {
    const start = 1 + Math.floor(rng() * 5);
    row = [start];
    for (let i = 1; i < 5; i++) row.push(row[i - 1]! + i);
  } else if (kind === 'alternate') {
    const up = 3 + Math.floor(rng() * 5);
    const down = 1 + Math.floor(rng() * 2);
    row = [10 + Math.floor(rng() * 10)];
    for (let i = 1; i < 5; i++) row.push(row[i - 1]! + (i % 2 === 1 ? up : -down));
  } else {
    const start = 1 + Math.floor(rng() * 3);
    row = Array.from({ length: 5 }, (_, i) => (start + i) ** 2);
  }
  const answer = row[4]!;
  const near = [answer + 1, answer - 1, answer + 2, answer - 2, answer + (row[4]! - row[3]!), row[3]! + 1, answer + 10].filter((n) => n >= 0);
  return {
    items: [...row.slice(0, 4).map(String), null],
    answer: String(answer),
    options: withOptions(String(answer), near.map(String), rng),
    numbers: true,
  };
}

/** The puzzle number `index` (0–9) of a round: easier at the start, harder at the end. */
export function makePuzzle(level: SoloLevel, index: number, rng: Rng = Math.random): Puzzle {
  if (level === 1) {
    if (index < 4) return patternPuzzle(rng, false);
    if (index < 7) return rng() < 0.5 ? patternPuzzle(rng, true) : arrowPuzzle(rng);
    return rng() < 0.5 ? numberPuzzle(rng, false) : patternPuzzle(rng, true);
  }
  if (index < 3) return rng() < 0.5 ? patternPuzzle(rng, true) : arrowPuzzle(rng);
  if (index < 6) return rng() < 0.6 ? numberPuzzle(rng, false) : arrowPuzzle(rng);
  return numberPuzzle(rng, true);
}

/** Points for a right answer: 100, plus up to 50 for speed. */
export function puzzlePoints(seconds: number): number {
  return 100 + Math.max(0, Math.round(50 - seconds * 5));
}

/* ------------------------------------------------------- Sortier-Rutsche */

export interface SortSet {
  left: string;
  right: string;
  items: { text: string; right: boolean }[];
}

const items = (list: string, right: boolean) => list.split(' ').map((text) => ({ text, right }));

export const SORT_SETS: Record<SoloLevel, SortSet[]> = {
  1: [
    { left: '🍎 Obst', right: '🥕 Gemüse', items: [...items('🍎 🍌 🍓 🍇 🍐 🍒 🍉 🍑 🍍 🥝', false), ...items('🥕 🥦 🌽 🥒 🍆 🫑 🧅 🥬 🥔 🧄', true)] },
    { left: '🌳 Land', right: '🌊 Wasser', items: [...items('🐄 🐎 🐑 🐿️ 🦔 🐘 🦒 🐇 🐓 🦊', false), ...items('🐟 🐙 🐬 🦈 🐳 🦀 🐡 🦑 🐠 🦐', true)] },
    { left: '🕊️ Fliegt', right: '🚶 Fliegt nicht', items: [...items('🦅 🦉 🐝 🦋 🐦 🦇 🚁 ✈️ 🪁 🎈', false), ...items('🐌 🐢 🐘 🐄 🚗 🚲 🐊 🦔 🐖 🚂', true)] },
    { left: '☀️ Sommer', right: '❄️ Winter', items: [...items('🩴 🍦 🏖️ 🩱 🕶️ 🍉 🌻 🏄 ⛱️ 🌞', false), ...items('⛄ 🧣 🧤 🎿 🛷 ⛸️ 🧊 🌨️ 🎄 🧥', true)] },
    { left: '🔢 bis 10', right: '🔟 über 10', items: [...items('3 7 1 9 5 2 8 4 6 10', false), ...items('12 15 20 11 17 14 30 19 13 25', true)] },
  ],
  2: [
    { left: 'gerade', right: 'ungerade', items: [...items('14 28 36 50 72 96 108 64 42 88', false), ...items('17 33 49 51 75 99 121 63 85 27', true)] },
    { left: 'Säugetier', right: 'kein Säugetier', items: [...items('🐬 🦇 🐋 🐄 🦔 🐘 🐒 🦘 🐿️ 🐻', false), ...items('🐊 🐍 🦈 🐢 🐸 🐧 🦅 🐝 🐙 🦎', true)] },
    {
      left: 'Nomen',
      right: 'Verb',
      items: [...items('Haus Baum Freude Schule Hund Brücke Wolke Spiel Mut Velo', false), ...items('laufen singen denken bauen fliegen lesen helfen springen essen rufen', true)],
    },
    { left: 'unter 50', right: '50 und mehr', items: [...items('6·7 9·5 4·8 3·9 7·6 2·19 5·9 6·8 30+12 70−25', false), ...items('7·8 6·9 9·9 8·7 5·10 25+25 100−40 8·8 7·9 12·5', true)] },
    { left: '🇨🇭 Kanton', right: 'kein Kanton', items: [...items('Uri Bern Jura Zug Glarus Tessin Wallis Aargau Thurgau Genf', false), ...items('Rhein Säntis Lugano Matterhorn Davos Rigi Aare Pilatus Montreux Gotthard', true)] },
  ],
};

/** The things of a round – from one set, alternating sides a little so no side wins by guessing. */
export function sortRound(level: SoloLevel, rng: Rng = Math.random): { set: SortSet; queue: SortSet['items'] } {
  const set = pick(SORT_SETS[level], rng);
  return { set, queue: shuffled(set.items, rng) };
}

/** Seconds a thing needs to slide down – faster with every correct answer. */
export function slideSeconds(level: SoloLevel, sorted: number): number {
  const start = level === 1 ? 4.2 : 3.4;
  const end = level === 1 ? 1.9 : 1.4;
  return Math.max(end, start - sorted * 0.12);
}

/* --------------------------------------------------------- Farben-Fänger */

export const BUBBLE_COLORS = [
  { id: 'rot', name: 'Rot', adjective: 'Rote', color: '#ff4f6d' },
  { id: 'blau', name: 'Blau', adjective: 'Blaue', color: '#3a86ff' },
  { id: 'gelb', name: 'Gelb', adjective: 'Gelbe', color: '#ffd23f' },
  { id: 'gruen', name: 'Grün', adjective: 'Grüne', color: '#2bb673' },
  { id: 'lila', name: 'Lila', adjective: 'Lila', color: '#8b5cf6' },
  { id: 'orange', name: 'Orange', adjective: 'Orange', color: '#ff8a3d' },
] as const;

export type BubbleColor = (typeof BUBBLE_COLORS)[number];

export function bubbleColors(level: SoloLevel): readonly BubbleColor[] {
  return BUBBLE_COLORS.slice(0, level === 1 ? 4 : 6);
}

/** Points for a right bubble: 10, plus 2 for every right one in a row before (at most +10). */
export function bubblePoints(streak: number): number {
  return 10 + Math.min(10, streak * 2);
}
