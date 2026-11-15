import { shuffle } from '../../lib/util.ts';

export interface HutTerm {
  id: string;
  text: string;
}

export const HUT_ROUNDS = [
  { title: 'Erklären', emoji: '🗣️', rule: 'Erkläre den Begriff mit beliebig vielen Worten – nur der Begriff selbst ist tabu.' },
  { title: 'Ein Wort', emoji: '☝️', rule: 'Nur ein einziges Wort als Hinweis! Ihr kennt die Begriffe ja schon aus Runde 1.' },
  { title: 'Pantomime', emoji: '🎭', rule: 'Keine Worte, keine Geräusche – nur Gesten und Mimik.' },
] as const;

export interface HutSettings {
  termsPerPlayer: number;
  seconds: number;
}

export const DEFAULT_SETTINGS: HutSettings = { termsPerPlayer: 4, seconds: 60 };

/** Normalised terms without duplicates (case-insensitive). */
export function collectTerms(entries: string[]): HutTerm[] {
  const seen = new Set<string>();
  const terms: HutTerm[] = [];
  entries.forEach((raw, i) => {
    const text = raw.trim().replace(/\s+/g, ' ');
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    terms.push({ id: `t${i}`, text });
  });
  return terms;
}

/** Fresh, shuffled pool for a round. */
export function newPool(terms: HutTerm[]): string[] {
  return shuffle(terms.map((t) => t.id));
}

/** Skipped cards go to the end of the pool. */
export function skipCard(pool: string[]): string[] {
  if (pool.length < 2) return pool;
  const [first, ...rest] = pool;
  return [...rest, first!];
}
