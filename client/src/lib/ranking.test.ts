import { describe, expect, it } from 'vitest';
import { familyRanking, placeOf } from './ranking.ts';

const wallet = (learner: string, best: Record<string, number>, deleted = false) => ({ learner, best, deleted });

describe('family leaderboard', () => {
  it('ranks everybody with a score, equal scores share a place', () => {
    const ranking = familyRanking(
      [wallet('Lea', { 'memo:1': 500 }), wallet('Tim', { 'memo:1': 640, 'memo:2': 10 }), wallet('Mia', { 'memo:1': 500 }), wallet('Ben', {}), wallet('Alt', { 'memo:1': 999 }, true)],
      'memo:1',
    );
    expect(ranking.map((e) => [e.learner, e.score, e.place])).toEqual([
      ['Tim', 640, 1],
      ['Lea', 500, 2],
      ['Mia', 500, 2],
    ]);
    expect(placeOf(ranking, 'mia')?.place).toBe(2);
    expect(placeOf(ranking, 'Ben')).toBeNull();
  });
});
