import { describe, expect, it } from 'vitest';
import { afterMove, DROP, HOLES, holesOf, newGame, pass, play, ranking, rollDice, type PlumpsState } from './logic.ts';

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** What a sensible player chooses between two holes: the open one before a free one before an occupied one. */
function betterHole(state: PlumpsState, holes: number[]): number | null {
  const value = (hole: number) => (hole === DROP ? 2 : state.holes[hole - 1] === null ? 1 : 0);
  const [a, b] = holes;
  if (a === undefined || b === undefined) return a ?? null;
  return value(a) === value(b) ? null : value(a) > value(b) ? a : b;
}

describe('Plumps', () => {
  it('everybody starts with the same sticks, the lid is empty', () => {
    const game = newGame(['a', 'b', 'c'], 5, 4);
    expect(game.hands).toEqual({ a: 5, b: 5, c: 5 });
    expect(game.holes).toEqual([null, null, null, null, null]);
    expect(game.box).toBe(0);
    // The starter wraps around.
    expect(game.turn).toBe(1);
    expect(HOLES.map((h) => h.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(HOLES.map((h) => h.color)).size).toBe(6);
  });

  it('rolls the dice of the mode, faces from 1 to 6', () => {
    expect(rollDice('zahlen', sequence(0))).toEqual({ number: 1, color: null });
    expect(rollDice('farben', sequence(0.999999))).toEqual({ number: null, color: 6 });
    expect(rollDice('beide', sequence(0.5, 0.2))).toEqual({ number: 4, color: 2 });
    // Even a 1 from the generator stays on the die.
    expect(rollDice('zahlen', () => 1).number).toBe(6);
    for (let i = 0; i < 200; i++) {
      const roll = rollDice('beide');
      expect(roll.number).toBeGreaterThanOrEqual(1);
      expect(roll.number).toBeLessThanOrEqual(6);
      expect(roll.color).toBeGreaterThanOrEqual(1);
      expect(roll.color).toBeLessThanOrEqual(6);
    }
  });

  it('one die names one hole, two dice give a choice – or a double hit', () => {
    expect(holesOf({ number: 3, color: null })).toEqual({ holes: [3], double: false });
    expect(holesOf({ number: null, color: 6 })).toEqual({ holes: [6], double: false });
    expect(holesOf({ number: 2, color: 5 })).toEqual({ holes: [2, 5], double: false });
    expect(holesOf({ number: 4, color: 4 })).toEqual({ holes: [4], double: true });
    expect(holesOf({ number: null, color: null })).toEqual({ holes: [], double: false });
  });

  it('a free hole takes a stick, an occupied one gives it back to whoever rolled', () => {
    let game = newGame(['a', 'b'], 3);
    const placed = play(game, 2);
    expect(placed.outcome).toBe('placed');
    expect(placed.state.hands.a).toBe(2);
    expect(placed.state.holes).toEqual([null, 'a', null, null, null]);
    expect(afterMove(placed, 'sechs')).toBe('next');
    game = pass(placed.state);
    expect(game.turn).toBe(1);

    const taken = play(game, 2);
    expect(taken.outcome).toBe('taken');
    expect(taken.from).toBe('a');
    expect(taken.player).toBe('b');
    expect(taken.state.hands.b).toBe(4);
    expect(taken.state.holes[1]).toBeNull();
    // Taking a stick ends the turn, however brave the rule.
    expect(afterMove(taken, 'sechs')).toBe('next');
    expect(afterMove(taken, 'frei')).toBe('next');
    // The game before is untouched.
    expect(game.hands.b).toBe(3);
  });

  it('the open hole swallows the stick and gives another roll', () => {
    const game = newGame(['a', 'b'], 3);
    const dropped = play(game, DROP);
    expect(dropped.outcome).toBe('dropped');
    expect(dropped.state.hands.a).toBe(2);
    expect(dropped.state.box).toBe(1);
    expect(dropped.state.holes.every((h) => h === null)).toBe(true);
    expect(afterMove(dropped, 'sechs')).toBe('again');
    // With free rolling the player may stop after any stick that is gone.
    expect(afterMove(dropped, 'frei')).toBe('choice');
    expect(afterMove(play(game, 1), 'frei')).toBe('choice');
  });

  it('a double hit drops the stick into the box, even over an occupied hole', () => {
    const start = pass(play(newGame(['a', 'b'], 3), 4).state);
    const double = play(start, 4, true);
    expect(double.outcome).toBe('dropped');
    expect(double.double).toBe(true);
    expect(double.state.box).toBe(1);
    expect(double.state.hands.b).toBe(2);
    // The stick of the other player stays where it is.
    expect(double.state.holes[3]).toBe('a');
  });

  it('whoever gets rid of the last stick wins', () => {
    let game = newGame(['a', 'b'], 2);
    game = play(game, DROP).state;
    const last = play(game, 3);
    expect(last.won).toBe(true);
    expect(last.state.winner).toBe('a');
    expect(afterMove(last, 'sechs')).toBe('over');
    expect(afterMove(last, 'frei')).toBe('over');
    expect(ranking(last.state)).toEqual([
      { id: 'a', sticks: 0 },
      { id: 'b', sticks: 2 },
    ]);
  });

  it('the turn goes round', () => {
    let game = newGame(['a', 'b', 'c'], 3, 2);
    expect(game.order[game.turn]).toBe('c');
    game = pass(game);
    expect(game.order[game.turn]).toBe('a');
  });

  it('the helper of this test knows the better of two holes', () => {
    const game = pass(play(newGame(['a', 'b'], 3), 2).state);
    // The open hole beats a free one, a free one beats an occupied one.
    expect(betterHole(game, [1, DROP])).toBe(DROP);
    expect(betterHole(game, [2, 1])).toBe(1);
    expect(betterHole(game, [2, DROP])).toBe(DROP);
    // Two free holes: no difference.
    expect(betterHole(game, [1, 3])).toBeNull();
    expect(betterHole(game, [4])).toBe(4);
  });

  it('a whole game with random rolls always ends with one winner and no stick lost', () => {
    for (const mode of ['zahlen', 'farben', 'beide'] as const) {
      for (let round = 0; round < 40; round++) {
        const sticks = 3 + (round % 3);
        let game = newGame(['a', 'b', 'c'], sticks);
        let rolls = 0;
        while (!game.winner && rolls < 5000) {
          rolls++;
          const { holes, double } = holesOf(rollDice(mode));
          const move = play(game, betterHole(game, holes) ?? holes[0]!, double);
          game = move.state;
          const next = afterMove(move, round % 2 ? 'frei' : 'sechs');
          if (next === 'next' || next === 'choice') game = pass(game);
          // Every stick is in a hand, in a hole or in the box.
          const total = Object.values(game.hands).reduce((a, b) => a + b, 0) + game.holes.filter(Boolean).length + game.box;
          expect(total).toBe(3 * sticks);
        }
        expect(game.winner).not.toBeNull();
        expect(game.hands[game.winner!]).toBe(0);
      }
    }
  });
});
