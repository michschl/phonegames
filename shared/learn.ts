/*
 * Shared helpers for learning cards – used by the server (photo analysis) and the app.
 */

/** How the gap of a Lückentext card is written in its prompt. */
export const GAP = '___';

const GAP_RUN = /_{2,}/g;
const DOTS_RUN = /\.{3,}|…+/g;

/**
 * Brings the gap of a Lückentext prompt into the standard form «___».
 * Accepts underscores, dots («…») or – if neither is there – the answer itself in the
 * sentence. Returns null when the sentence has no gap or more than one.
 */
export function normalizeGap(prompt: string, answer: string): string | null {
  for (const pattern of [GAP_RUN, DOTS_RUN]) {
    const matches = prompt.match(pattern);
    if (matches?.length === 1) return prompt.replace(pattern, GAP);
    if (matches && matches.length > 1) return null;
  }
  const word = answer.trim();
  if (!word) return null;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inSentence = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
  const match = inSentence.exec(prompt);
  if (!match) return null;
  const start = match.index + match[1]!.length;
  return `${prompt.slice(0, start)}${GAP}${prompt.slice(start + word.length)}`;
}

/** The prompt has exactly one gap in the standard form. */
export function hasGap(prompt: string): boolean {
  return prompt.split(GAP).length === 2;
}
