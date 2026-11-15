import { describe, expect, it } from 'vitest';
import { formatValue, parseEstimate, scoreGuesses } from '../schaetzmeister/logic.ts';
import { QUESTIONS } from '../schaetzmeister/questions.ts';
import { clearlyDifferent, pickDuel } from '../mehr-oder-weniger/logic.ts';
import { FACT_SETS } from '../mehr-oder-weniger/facts.ts';

describe('Schätzmeister', () => {
  it('parses Swiss number formats', () => {
    expect(parseEstimate("4'478")).toBe(4478);
    expect(parseEstimate('4 478')).toBe(4478);
    expect(parseEstimate('4.478')).toBe(4478);
    expect(parseEstimate('1,5')).toBe(1.5);
    expect(parseEstimate('8.2')).toBe(8.2);
    expect(parseEstimate('4.478,5')).toBe(4478.5);
    expect(parseEstimate('abc')).toBeNull();
    expect(parseEstimate('')).toBeNull();
  });

  it('ranks the closest guesses', () => {
    const result = scoreGuesses(100, { a: 90, b: 130, c: 100, d: 500 });
    expect(result.map((r) => r.playerId)).toEqual(['c', 'a', 'b', 'd']);
    expect(result.find((r) => r.playerId === 'c')).toMatchObject({ exact: true, points: 5 });
    expect(result.find((r) => r.playerId === 'a')!.points).toBe(2);
    expect(result.find((r) => r.playerId === 'd')!.points).toBe(0);
  });

  it('lets ties share a rank', () => {
    const result = scoreGuesses(10, { a: 8, b: 12, c: 20 });
    expect(result.find((r) => r.playerId === 'a')!.points).toBe(3);
    expect(result.find((r) => r.playerId === 'b')!.points).toBe(3);
  });

  it('formats years without separators', () => {
    expect(formatValue(1865, 'Jahr')).toBe('1865');
  });

  it('has valid questions', () => {
    expect(QUESTIONS.length).toBeGreaterThan(50);
    expect(QUESTIONS.every((q) => Number.isFinite(q.answer) && q.text.endsWith('?'))).toBe(true);
  });
});

describe('Mehr oder weniger', () => {
  it('only compares clearly different values', () => {
    expect(clearlyDifferent(100, 105, 'm')).toBe(false);
    expect(clearlyDifferent(100, 112, 'm')).toBe(true);
    expect(clearlyDifferent(1900, 1905, 'Jahr')).toBe(false);
  });

  it('picks valid duels with the right winner', () => {
    for (let i = 0; i < 300; i++) {
      const duel = pickDuel(FACT_SETS);
      const higherWins = duel.set.higherWins ?? true;
      const leftWins = higherWins ? duel.left.value > duel.right.value : duel.left.value < duel.right.value;
      expect(duel.winner).toBe(leftWins ? 'left' : 'right');
      expect(duel.left.name).not.toBe(duel.right.name);
    }
  });
});
