import { describe, expect, it } from 'vitest';
import { kugelLevel, kugelPar, kugelScore, kugelStars, LEVEL_COUNT, makeCourse, pisteScore, pisteStars, RUNS, solvable } from './logic.ts';

describe('Pistenjagd', () => {
  it('lays out a run: alternating gates on the piste, nothing inside a gate, the same course for the same seed', () => {
    for (let run = 0; run < RUNS.length; run++) {
      const course = makeCourse(run, 42);
      expect(course.gates.length).toBeGreaterThan(10);
      for (const gate of course.gates) {
        expect(Math.abs(gate.x - course.center(gate.z))).toBeLessThan(RUNS[run]!.halfWidth);
        const blocked = course.obstacles.some((o) => Math.abs(o.z - gate.z) < 3 && Math.abs(o.x - gate.x) < RUNS[run]!.gateWidth / 2);
        expect(blocked).toBe(false);
      }
      expect(course.gates.map((g) => g.color).slice(0, 3)).toEqual(['red', 'blue', 'red']);
      expect(makeCourse(run, 42).obstacles).toEqual(course.obstacles);
    }
  });

  it('scores time and missed gates', () => {
    const run = RUNS[0]!;
    expect(pisteScore(run, 50, 0)).toBeGreaterThan(pisteScore(run, 50, 2));
    expect(pisteScore(run, 50, 0)).toBeGreaterThan(pisteScore(run, 70, 0));
    expect(pisteStars(run, run.par, 0)).toBe(3);
    expect(pisteStars(run, run.par * 2, 0)).toBe(0);
    expect(pisteScore(run, 10_000, 0)).toBe(0);
  });
});

describe('Kugelbahn', () => {
  it('has 30 levels that can all be finished, with one start and one goal', () => {
    for (let i = 0; i < LEVEL_COUNT; i++) {
      const map = kugelLevel(i);
      expect(map.join('').split('S')).toHaveLength(2);
      expect(map.join('').split('G')).toHaveLength(2);
      expect(solvable(map), `Level ${i + 1}`).toBe(true);
      expect(kugelPar(map)).toBeGreaterThan(4);
    }
  });

  it('knows that a door needs its switch', () => {
    expect(solvable(['S#D#G'])).toBe(false);
    expect(solvable(['S#D#G', 'B#...'])).toBe(true);
    expect(solvable(['S#.#G'])).toBe(false);
  });

  it('scores the time, falls count two seconds', () => {
    const map = kugelLevel(0);
    expect(kugelScore(map, 5, 0)).toBeGreaterThan(kugelScore(map, 5, 3));
    expect(kugelStars(map, 1, 0)).toBe(3);
    expect(kugelScore(map, 999, 0)).toBe(100);
  });
});
