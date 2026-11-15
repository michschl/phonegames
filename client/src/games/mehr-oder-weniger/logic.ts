import type { FactItem, FactSet } from './facts.ts';

export interface MehrSettings {
  rounds: number;
}

export const DEFAULT_SETTINGS: MehrSettings = { rounds: 5 };

export interface Duel {
  set: FactSet;
  left: FactItem;
  right: FactItem;
  /** Which side wins according to the set's question. */
  winner: 'left' | 'right';
}

/** Values must differ clearly, so rounded data never decides a duel. */
export function clearlyDifferent(a: number, b: number, unit: string): boolean {
  if (unit === 'Jahr') return Math.abs(a - b) >= 10;
  const low = Math.min(Math.abs(a), Math.abs(b));
  const high = Math.max(Math.abs(a), Math.abs(b));
  return high >= low * 1.1;
}

export function pickDuel(sets: FactSet[], random: () => number = Math.random, avoid: Set<string> = new Set()): Duel {
  for (let attempt = 0; attempt < 200; attempt++) {
    const set = sets[Math.floor(random() * sets.length)]!;
    const left = set.items[Math.floor(random() * set.items.length)]!;
    const right = set.items[Math.floor(random() * set.items.length)]!;
    if (left === right || !clearlyDifferent(left.value, right.value, set.unit)) continue;
    const key = duelKey(set.id, left.name, right.name);
    if (avoid.has(key) && attempt < 150) continue;
    const higherWins = set.higherWins ?? true;
    const leftWins = higherWins ? left.value > right.value : left.value < right.value;
    return { set, left, right, winner: leftWins ? 'left' : 'right' };
  }
  throw new Error('pickDuel: no suitable pair found');
}

export function duelKey(setId: string, a: string, b: string): string {
  return [setId, ...[a, b].sort()].join('|');
}
