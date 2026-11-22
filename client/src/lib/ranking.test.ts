import { describe, expect, it } from 'vitest';
import { familyRanking, familyTotals, placeOf, winnersOf } from './ranking.ts';

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

describe('family totals of games played together', () => {
  it('adds the counts of all devices and ranks by points, then wins', () => {
    const w = (learner: string, tally: Record<string, Record<string, number>>) => ({ learner, tally, deleted: false });
    const totals = familyTotals(
      [
        w('Lea', { 'spion:punkte': { a: 6, b: 4 }, 'spion:siege': { a: 1 }, 'spion:spiele': { a: 2, b: 1 } }),
        w('Tim', { 'spion:punkte': { a: 10 }, 'spion:siege': { a: 2 }, 'spion:spiele': { a: 3 } }),
        w('Mia', { 'spion:spiele': { a: 1 } }),
        w('Ben', { 'zeichnen:punkte': { a: 3 }, 'zeichnen:spiele': { a: 1 } }),
      ],
      'spion',
    );
    expect(totals.map((e) => [e.learner, e.points, e.wins, e.games, e.place])).toEqual([
      ['Tim', 10, 2, 3, 1],
      ['Lea', 10, 1, 3, 2],
      ['Mia', 0, 0, 1, 3],
    ]);
  });

  it('knows the winners of a game', () => {
    expect(winnersOf({ a: 3, b: 5, c: 5 })).toEqual(['b', 'c']);
    expect(winnersOf({ a: 0 })).toEqual([]);
  });
});
