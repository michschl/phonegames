import { LIMITS, type CardProgress, type LearnCard, type LearnCardKind, type LearnDraftCard, type LearnProgress, type LearnStack } from '../../../shared/types.ts';
import { normalize, shuffle } from './util.ts';

/*
 * Learning stacks: the Kartenkasten (Leitner system), text import, multiple
 * choice and photo preparation. Pure functions where possible – see learn.test.ts.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Days until a card is due again after it was known, per box (index = box). Box 1 = again today. */
export const BOX_DAYS = [0, 0, 1, 3, 7, 14] as const;
/** A card known in the last box comes back after a month. */
const MASTERED_DAYS = 30;
export const BOXES = 5;

function startOfDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Where a card goes after an answer: known → one box up, not known → back to box 1, due right away. */
export function nextProgress(current: CardProgress | undefined, correct: boolean, now = Date.now()): CardProgress {
  if (!correct) return { box: 1, due: now };
  const box = Math.min(BOXES, (current?.box ?? 1) + 1);
  const days = current?.box === BOXES ? MASTERED_DAYS : BOX_DAYS[box]!;
  return { box, due: startOfDay(now) + days * DAY };
}

export function isDue(progress: CardProgress | undefined, now = Date.now()): boolean {
  return !progress || progress.due <= now;
}

/** Cards to learn now: due cards first (lowest box first), new cards last, at most `max`. */
export function dueCards(stack: LearnStack, progress: LearnProgress | undefined, max: number, now = Date.now()): LearnCard[] {
  const known = progress?.cards ?? {};
  const due = stack.cards.filter((card) => isDue(known[card.id], now));
  const seen = due.filter((card) => known[card.id]).sort((a, b) => known[a.id]!.box - known[b.id]!.box || known[a.id]!.due - known[b.id]!.due);
  const fresh = due.filter((card) => !known[card.id]);
  return [...seen, ...fresh].slice(0, max);
}

/** How many cards are new (index 0) and in each box (1–5). */
export function boxCounts(stack: LearnStack, progress: LearnProgress | undefined): number[] {
  const counts = Array<number>(BOXES + 1).fill(0);
  for (const card of stack.cards) counts[progress?.cards[card.id]?.box ?? 0]! += 1;
  return counts;
}

/** Progress record id – the same for a stack and a person on every device. */
export function progressId(stackId: string, player: string): string {
  // FNV-1a over the normalised name keeps the id short and URL safe.
  let hash = 0x811c9dc5;
  for (const char of normalize(player)) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `p-${stackId}-${hash.toString(36)}`;
}

/* ------------------------------------------------------------ answers */

/** Up to four options for multiple choice: the answer, the card's own wrong answers, then answers of other cards. */
export function choicesFor(card: LearnCard, stack: LearnStack): string[] {
  const taken = new Set([card.answer, ...card.accepted].map((a) => normalize(a)));
  const wrong: string[] = [];
  const add = (option: string) => {
    const key = normalize(option);
    if (wrong.length >= 3 || taken.has(key)) return;
    taken.add(key);
    wrong.push(option);
  };
  card.distractors.forEach(add);
  const others = shuffle(stack.cards.filter((c) => c.id !== card.id));
  others.filter((c) => c.kind === card.kind).forEach((c) => add(c.answer));
  others.forEach((c) => add(c.answer));
  return shuffle([card.answer, ...wrong]);
}

/** Multiple choice works when every card can get three wrong answers. */
export function canPlayChoice(stack: LearnStack): boolean {
  return stack.cards.length >= 4 || stack.cards.every((c) => c.distractors.length >= 3);
}

/* -------------------------------------------------------------- import */

const SEPARATORS = ['\t', ' = ', ' – ', ' — ', ' -> ', ' → ', ' - ', ': ', ';', '='];

/**
 * Cards from typed or pasted text, one per line: «le chien = der Hund»,
 * «Hauptort von Bern? – Bern». Lines without a separator are skipped.
 */
export function parseTextCards(text: string): LearnDraftCard[] {
  const cards: LearnDraftCard[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim();
    if (!line) continue;
    const separator = SEPARATORS.find((sep) => line.includes(sep));
    if (!separator) continue;
    const index = line.indexOf(separator);
    const prompt = line.slice(0, index).trim().slice(0, LIMITS.cardText);
    const answer = line.slice(index + separator.length).trim().slice(0, LIMITS.cardText);
    if (!prompt || !answer) continue;
    const kind: LearnCardKind = /^[\d'’.,\s-]+$/.test(answer) ? 'number' : prompt.endsWith('?') ? 'qa' : 'translation';
    cards.push({ kind, prompt, answer, accepted: [], distractors: [], uncertain: '' });
    if (cards.length >= LIMITS.cardsPerStack) break;
  }
  return cards;
}

/* --------------------------------------------------------------- photos */

/**
 * Shrinks a photo to at most `maxSide` pixels on the long side and returns a
 * JPEG data URL – small enough to send, sharp enough to read handwriting.
 */
export async function preparePhoto(file: Blob, maxSide = 2000, quality = 0.82): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Dieses Bild kann ich nicht lesen. Bitte nimm ein JPEG- oder PNG-Foto.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let url = canvas.toDataURL('image/jpeg', quality);
  // Very detailed photos: try once more with stronger compression.
  if (url.length > 2_000_000) url = canvas.toDataURL('image/jpeg', 0.6);
  return url;
}

/** Emoji for a subject, for the stack cards. */
export function subjectEmoji(subject: string): string {
  const s = normalize(subject);
  const table: [RegExp, string][] = [
    [/franz|french/, '🥖'],
    [/engl/, '💂'],
    [/ital/, '🍝'],
    [/span/, '💃'],
    [/latein/, '🏛️'],
    [/deutsch/, '📖'],
    [/mathe|rechnen|geometr/, '➗'],
    [/geo/, '🗺️'],
    [/gesch/, '🏰'],
    [/bio|natur|nmg/, '🌱'],
    [/chem/, '⚗️'],
    [/phys/, '🧲'],
    [/musik/, '🎵'],
  ];
  return table.find(([pattern]) => pattern.test(s))?.[1] ?? '📝';
}
