import { describe, expect, it } from 'vitest';
import { makePuzzle, memoDeck, memoScore, memoStars, puzzlePoints, seeded, slideSeconds, SORT_SETS, sortRound, starsFor } from './logic.ts';

describe('Memo-Blitz', () => {
  it('lays out pairs and rewards few moves', () => {
    const deck = memoDeck(1, seeded(1));
    expect(deck).toHaveLength(12);
    for (const symbol of deck) expect(deck.filter((x) => x === symbol)).toHaveLength(2);
    expect(memoDeck(2, seeded(2))).toHaveLength(20);
    expect(memoScore(6, 6, 10)).toBe(580);
    expect(memoScore(6, 30, 200)).toBe(60);
    expect(memoStars(6, 8)).toBe(3);
    expect(memoStars(10, 40)).toBe(0);
  });
});

describe('Muster-Meister', () => {
  it('always has the answer among four different options', () => {
    for (const level of [1, 2] as const) {
      for (let seed = 0; seed < 200; seed++) {
        const rng = seeded(seed);
        for (let i = 0; i < 10; i++) {
          const puzzle = makePuzzle(level, i, rng);
          expect(puzzle.options).toHaveLength(4);
          expect(new Set(puzzle.options).size).toBe(4);
          expect(puzzle.options).toContain(puzzle.answer);
          expect(puzzle.items.filter((x) => x === null)).toHaveLength(1);
        }
      }
    }
  });

  it('continues a number row by its rule', () => {
    let found = false;
    for (let seed = 0; seed < 50 && !found; seed++) {
      const puzzle = makePuzzle(1, 8, seeded(seed));
      if (!puzzle.numbers) continue;
      const row = puzzle.items.slice(0, 4).map(Number);
      const step = row[1]! - row[0]!;
      if (row.every((n, i) => i === 0 || n - row[i - 1]! === step)) {
        expect(Number(puzzle.answer)).toBe(row[3]! + step);
        found = true;
      }
    }
    expect(found).toBe(true);
    expect(puzzlePoints(0)).toBe(150);
    expect(puzzlePoints(20)).toBe(100);
  });
});

describe('Sortier-Rutsche', () => {
  it('has as many things for each side, without doubles, and gets faster', () => {
    for (const level of [1, 2] as const) {
      for (const set of SORT_SETS[level]) {
        expect(set.items.filter((i) => i.right)).toHaveLength(10);
        expect(new Set(set.items.map((i) => i.text)).size).toBe(20);
      }
    }
    const round = sortRound(2, seeded(3));
    expect(round.queue).toHaveLength(20);
    expect(slideSeconds(1, 0)).toBeGreaterThan(slideSeconds(1, 10));
    expect(slideSeconds(2, 100)).toBe(1.4);
  });

  it('gives stars for a share of the best result', () => {
    expect([starsFor(1), starsFor(0.7), starsFor(0.4), starsFor(0.1)]).toEqual([3, 2, 1, 0]);
  });
});
