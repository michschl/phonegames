/*
 * «Plumps!» – the classic dice game with sticks and a box, as rules without any screen:
 *
 * The lid of the box has six holes. Five of them hold one stick each, the sixth is open: what goes in
 * there falls into the box and is gone. Everybody starts with the same number of sticks; whoever gets rid
 * of the last one wins. A roll names a hole: free → a stick goes in, taken → the stick there comes back to
 * the hand of the one who rolled, the open hole → the stick is gone and the same person rolls again.
 */

/** Which dice are rolled: the one with numbers, the one with colours, or both (the player chooses which one counts). */
export type DiceMode = 'zahlen' | 'farben' | 'beide';

/** Rolling again: only after the open hole («sechs»), or as long as you dare after every stick you got rid of («frei»). */
export type RollAgain = 'sechs' | 'frei';

export interface PlumpsSettings {
  dice: DiceMode;
  sticks: number;
  again: RollAgain;
}

export const DEFAULT_SETTINGS: PlumpsSettings = { dice: 'zahlen', sticks: 5, again: 'sechs' };

export interface Hole {
  /** 1–6, the face of the number die. */
  n: number;
  color: string;
  /** The colour in words – colour alone must never be the only sign. */
  name: string;
}

/** The six holes of the lid. Number and colour mean the same hole, so both dice can be used. */
export const HOLES: Hole[] = [
  { n: 1, color: '#4d7cff', name: 'Blau' },
  { n: 2, color: '#21c46b', name: 'Grün' },
  { n: 3, color: '#ffd23f', name: 'Gelb' },
  { n: 4, color: '#ff8a3d', name: 'Orange' },
  { n: 5, color: '#a56bff', name: 'Violett' },
  { n: 6, color: '#ff5a5f', name: 'Rot' },
];

/** The open hole: 6 on the number die, red on the colour die. */
export const DROP = 6;

export interface PlumpsState {
  /** Player ids in the order of their turns. */
  order: string[];
  /** Sticks in the hand of each player. */
  hands: Record<string, number>;
  /** Holes 1–5: the id of the player whose stick stands there, or null. */
  holes: (string | null)[];
  /** Sticks that fell into the box. */
  box: number;
  /** Whose turn it is: an index into `order`. */
  turn: number;
  winner: string | null;
}

export function newGame(order: string[], sticks: number, starter = 0): PlumpsState {
  return {
    order,
    hands: Object.fromEntries(order.map((id) => [id, sticks])),
    holes: [null, null, null, null, null],
    box: 0,
    turn: order.length > 0 ? ((starter % order.length) + order.length) % order.length : 0,
    winner: null,
  };
}

/** What the dice show: a face from 1 to 6 each (the colour die: the hole of that colour), null = not rolled. */
export interface Roll {
  number: number | null;
  color: number | null;
}

const face = (random: () => number): number => Math.min(6, Math.floor(random() * 6) + 1);

export function rollDice(mode: DiceMode, random: () => number = Math.random): Roll {
  return {
    number: mode === 'farben' ? null : face(random),
    color: mode === 'zahlen' ? null : face(random),
  };
}

/**
 * The holes a roll allows. With both dice the player chooses between two holes – unless both dice name the
 * same one: a double hit, the stick goes straight into the box.
 */
export function holesOf(roll: Roll): { holes: number[]; double: boolean } {
  const { number, color } = roll;
  if (number !== null && color !== null) return number === color ? { holes: [number], double: true } : { holes: [number, color], double: false };
  const only = number ?? color;
  return { holes: only === null ? [] : [only], double: false };
}

/** What happened to the stick: put into a free hole, taken out of an occupied one, or dropped into the box. */
export type Outcome = 'placed' | 'taken' | 'dropped';

export interface Move {
  state: PlumpsState;
  player: string;
  hole: number;
  outcome: Outcome;
  /** Whose stick was taken out of the hole. */
  from: string | null;
  double: boolean;
  won: boolean;
}

/** The player on turn plays a hole (1–6). A double hit drops the stick into the box whatever the hole. */
export function play(state: PlumpsState, hole: number, double = false): Move {
  const player = state.order[state.turn]!;
  const hands = { ...state.hands };
  const holes = [...state.holes];
  let box = state.box;
  let outcome: Outcome;
  let from: string | null = null;
  if (double || hole === DROP) {
    outcome = 'dropped';
    hands[player] = hands[player]! - 1;
    box += 1;
  } else if (holes[hole - 1] === null) {
    outcome = 'placed';
    hands[player] = hands[player]! - 1;
    holes[hole - 1] = player;
  } else {
    outcome = 'taken';
    from = holes[hole - 1]!;
    hands[player] = hands[player]! + 1;
    holes[hole - 1] = null;
  }
  const won = hands[player] === 0;
  return { state: { ...state, hands, holes, box, winner: won ? player : null }, player, hole, outcome, from, double, won };
}

/**
 * How it goes on after a move: the game is over, the same player rolls again, may choose to roll again or to
 * stop, or the next one is on.
 */
export function afterMove(move: Move, again: RollAgain): 'over' | 'again' | 'choice' | 'next' {
  if (move.won) return 'over';
  if (move.outcome === 'taken') return 'next';
  if (again === 'frei') return 'choice';
  return move.outcome === 'dropped' ? 'again' : 'next';
}

/** The next player is on. */
export function pass(state: PlumpsState): PlumpsState {
  return { ...state, turn: (state.turn + 1) % state.order.length };
}

/** Fewest sticks first; the winner (no stick left) leads. */
export function ranking(state: PlumpsState): { id: string; sticks: number }[] {
  return state.order.map((id, i) => ({ id, sticks: state.hands[id] ?? 0, i })).sort((a, b) => a.sticks - b.sticks || a.i - b.i).map(({ id, sticks }) => ({ id, sticks }));
}
