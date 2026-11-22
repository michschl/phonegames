import { describe, expect, it } from 'vitest';
import { canPlace, CHAIN_LEVELS, chainScore, chainStars, createWorld, release, runChain, stepWorld } from './chain.ts';

const starsIn = (map: string[]) => map.join('').split('*').length - 1;

describe('Kettenreaktion', () => {
  it('has levels with one ball to release, a goal and two stars on an 8 × 12 board', () => {
    expect(CHAIN_LEVELS).toHaveLength(10);
    for (const level of CHAIN_LEVELS) {
      expect(level.map).toHaveLength(12);
      for (const row of level.map) expect(row).toHaveLength(8);
      expect(level.map.join('').split('o').length - 1).toBe(1);
      expect(level.map.join('')).toContain('G');
      expect(starsIn(level.map)).toBe(2);
    }
  });

  it('every level fails without parts and is solved by its solution with all stars', () => {
    for (const level of CHAIN_LEVELS) {
      expect(runChain(level, []).status, level.name).toBe('fail');
      for (const p of level.solution) {
        const others = level.solution.filter((q) => q !== p);
        expect(canPlace(level, others, p.col, p.row, p.kind), `${level.name} ${p.kind}@${p.col},${p.row}`).toBe(true);
      }
      const used: Record<string, number> = {};
      for (const p of level.solution) used[p.kind] = (used[p.kind] ?? 0) + 1;
      for (const [kind, n] of Object.entries(used)) expect(n, level.name).toBeLessThanOrEqual(level.parts[kind as keyof typeof level.parts] ?? 0);
      const result = runChain(level, level.solution);
      expect(result.status, level.name).toBe('goal');
      expect(result.stars, level.name).toBe(2);
    }
  });

  it('only builds on free cells; springs and dominoes need a block below', () => {
    const level = CHAIN_LEVELS[2]!;
    expect(canPlace(level, [], 3, 10, 'feder')).toBe(true);
    expect(canPlace(level, [], 3, 9, 'feder')).toBe(false);
    expect(canPlace(level, [], 3, 9, 'rampe')).toBe(true);
    expect(canPlace(level, [], 0, 11, 'rampe')).toBe(false);
    expect(canPlace(level, [{ col: 3, row: 9, kind: 'rampe' }], 3, 9, 'brett')).toBe(false);
  });

  it('a ball falling into the open stops as stuck; a run ends at the latest after its time', () => {
    const level = CHAIN_LEVELS[0]!;
    const result = runChain(level, []);
    expect(result).toMatchObject({ status: 'fail', reason: 'stuck', stars: 0 });
    const w = createWorld(level, []);
    expect(w.status).toBe('edit');
    stepWorld(w);
    expect(w.balls[0]!.y).toBe(11.5);
    release(w);
    stepWorld(w);
    expect(w.balls[0]!.y).toBeLessThan(11.5);
  });

  it('a button opens the gates', () => {
    const level = CHAIN_LEVELS[5]!;
    const w = createWorld(level, level.solution);
    expect([...w.solid].filter((v) => v === 2)).toHaveLength(1);
    release(w);
    while (w.status === 'run' && !w.pressed) stepWorld(w);
    expect(w.pressed).toBe(true);
    expect([...w.solid].filter((v) => v === 2)).toHaveLength(0);
  });

  it('scores stars, parts left over and tries', () => {
    expect(chainStars(0)).toBe(1);
    expect(chainStars(2)).toBe(3);
    expect(chainScore(2, 0, 1)).toBe(900);
    expect(chainScore(2, 1, 1)).toBe(980);
    expect(chainScore(0, 0, 3)).toBe(320);
    expect(chainScore(0, 0, 30)).toBe(100);
    expect(chainScore(2, 0, 1, 2)).toBe(780);
  });
});
