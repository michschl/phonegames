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

/** Accepts "4'478", "4 478", "4.478,5", "1,5" … */
export function parseEstimate(input: string): number | null {
  let text = input.trim().replace(/[\s'’`]/g, '');
  if (!text) return null;
  // "4.478,5" → thousands dot + decimal comma
  if (/,\d{1,2}$/.test(text) && text.includes('.')) text = text.replace(/\./g, '');
  text = text.replace(',', '.');
  // "4.478" with exactly three decimals is most likely a thousands separator.
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-CH', { maximumFractionDigits: 1 });
}

/** Display a value with its unit; years without thousands separator. */
export function formatValue(value: number, unit: string): string {
  if (unit === 'Jahr') return String(Math.round(value));
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

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
