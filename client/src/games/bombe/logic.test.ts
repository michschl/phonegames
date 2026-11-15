import { beforeEach, describe, expect, it } from 'vitest';
import { DURATIONS, heatFromInterval, pickStarter, rollFuse, tickInterval } from './logic.ts';
import { ALL_QUESTIONS, CATEGORIES, nextQuestion } from './questions.ts';

// Minimal localStorage stub for the node test environment.
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('rollFuse', () => {
  it('stays within the preset range', () => {
    for (const preset of Object.keys(DURATIONS) as (keyof typeof DURATIONS)[]) {
      expect(rollFuse(preset, () => 0)).toBe(DURATIONS[preset].min);
      expect(rollFuse(preset, () => 0.9999)).toBeLessThan(DURATIONS[preset].max);
    }
  });
});

describe('tickInterval', () => {
  it('is constant without acceleration', () => {
    expect(tickInterval(0.1, false)).toBe(tickInterval(0.99, false));
  });

  it('speeds up towards the end', () => {
    const early = tickInterval(0.2, true);
    const late = tickInterval(0.95, true);
    expect(late).toBeLessThan(early);
    expect(tickInterval(1, true)).toBeGreaterThan(0.1);
    expect(heatFromInterval(early)).toBe(0);
    expect(heatFromInterval(tickInterval(1, true))).toBe(1);
  });
});

describe('pickStarter', () => {
  it('never repeats the previous starter with 3+ players', () => {
    for (let i = 0; i < 200; i++) {
      const previous = i % 4;
      expect(pickStarter(4, previous)).not.toBe(previous);
    }
  });

  it('returns valid indices', () => {
    expect(pickStarter(2, 1, () => 0.99)).toBe(1);
    expect(pickStarter(5, null, () => 0)).toBe(0);
  });
});

describe('questions', () => {
  it('has unique ids and Swiss spelling', () => {
    const ids = ALL_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ALL_QUESTIONS.some((q) => q.text.includes('ß'))).toBe(false);
    expect(ALL_QUESTIONS.length).toBeGreaterThan(250);
  });

  it('only picks from the selected categories and avoids repeats', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = nextQuestion(['schweiz']);
      expect(q.category.id).toBe('schweiz');
      seen.add(q.id);
    }
    expect(seen.size).toBe(Math.min(20, ALL_QUESTIONS.filter((q) => q.category.id === 'schweiz').length));
  });

  it('falls back to all categories', () => {
    const q = nextQuestion([]);
    expect(CATEGORIES.map((c) => c.id)).toContain(q.category.id);
  });
});
