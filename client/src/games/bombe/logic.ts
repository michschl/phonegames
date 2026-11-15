import { CATEGORIES } from './questions.ts';

export type DurationPreset = 'kurz' | 'mittel' | 'lang' | 'chaos';

export const DURATIONS: Record<DurationPreset, { label: string; hint: string; min: number; max: number }> = {
  kurz: { label: 'Kurz', hint: '10–25 s', min: 10, max: 25 },
  mittel: { label: 'Mittel', hint: '20–45 s', min: 20, max: 45 },
  lang: { label: 'Lang', hint: '35–70 s', min: 35, max: 70 },
  chaos: { label: 'Chaos', hint: '5–90 s', min: 5, max: 90 },
};

export interface BombeSettings {
  duration: DurationPreset;
  /** The ticking gets faster towards the end. */
  accelerate: boolean;
  categories: string[];
}

export const DEFAULT_SETTINGS: BombeSettings = {
  duration: 'mittel',
  accelerate: true,
  categories: CATEGORIES.map((c) => c.id),
};

/** Secret fuse length of a round in seconds. */
export function rollFuse(preset: DurationPreset, random: () => number = Math.random): number {
  const { min, max } = DURATIONS[preset] ?? DURATIONS.mittel;
  return min + random() * (max - min);
}

const BASE_INTERVAL = 0.6;
const MIN_INTERVAL = 0.13;
const ACCELERATE_FROM = 0.55;

/**
 * Seconds between two ticks at a given progress (0 = lit, 1 = boom).
 * Constant at first, then speeding up quadratically – players feel that the
 * end is near, but the random fuse length keeps the exact moment a surprise.
 */
export function tickInterval(progress: number, accelerate: boolean): number {
  if (!accelerate || progress < ACCELERATE_FROM) return BASE_INTERVAL;
  const t = Math.min(1, (progress - ACCELERATE_FROM) / (1 - ACCELERATE_FROM));
  return BASE_INTERVAL - (BASE_INTERVAL - MIN_INTERVAL) * t * t;
}

/** 0 … 1 – how "hot" the bomb looks, derived from the tick speed. */
export function heatFromInterval(interval: number): number {
  return Math.max(0, Math.min(1, (BASE_INTERVAL - interval) / (BASE_INTERVAL - MIN_INTERVAL)));
}

/**
 * Random starting player. With three or more players the previous starter is
 * skipped so that rounds feel varied.
 */
export function pickStarter(playerCount: number, previous: number | null, random: () => number = Math.random): number {
  if (playerCount <= 1) return 0;
  if (previous === null || playerCount < 3) return Math.floor(random() * playerCount);
  const index = Math.floor(random() * (playerCount - 1));
  return index >= previous ? index + 1 : index;
}
