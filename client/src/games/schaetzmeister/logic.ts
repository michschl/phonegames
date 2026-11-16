export interface SchaetzSettings {
  rounds: number;
  categories: string[];
}

export const CATEGORY_OPTIONS = [
  { id: 'schweiz', label: 'Schweiz', emoji: '🇨🇭' },
  { id: 'natur', label: 'Natur', emoji: '🌋' },
  { id: 'tiere', label: 'Tiere', emoji: '🐘' },
  { id: 'geschichte', label: 'Geschichte', emoji: '🏰' },
  { id: 'mensch', label: 'Mensch', emoji: '🫀' },
  { id: 'technik', label: 'Technik', emoji: '⚙️' },
  { id: 'weltall', label: 'Weltall', emoji: '🪐' },
  { id: 'sport', label: 'Sport', emoji: '🏅' },
];

export const DEFAULT_SETTINGS: SchaetzSettings = { rounds: 10, categories: CATEGORY_OPTIONS.map((c) => c.id) };

export { formatNumber, formatValue, parseEstimate } from '../../lib/numbers.ts';

export interface RankedGuess {
  playerId: string;
  guess: number;
  distance: number;
  points: number;
  exact: boolean;
}

/**
 * Closest guess 3 points, second 2, third 1 (ties share the rank).
 * Hitting the answer within 1 % earns 2 bonus points.
 */
export function scoreGuesses(answer: number, guesses: Record<string, number>): RankedGuess[] {
  const ranked = Object.entries(guesses)
    .map(([playerId, guess]) => ({ playerId, guess, distance: Math.abs(guess - answer) }))
    .sort((a, b) => a.distance - b.distance);
  const tolerance = Math.max(Math.abs(answer) * 0.01, 0.0001);
  return ranked.map((entry) => {
    const rank = ranked.findIndex((e) => e.distance === entry.distance);
    const exact = entry.distance <= tolerance;
    const base = rank < 3 && ranked.length > 1 ? 3 - rank : ranked.length === 1 && exact ? 1 : 0;
    return { ...entry, exact, points: base + (exact ? 2 : 0) };
  });
}
