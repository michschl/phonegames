import { GAP, hasGap, normalizeGap } from '../../../shared/learn.ts';
import {
  LIMITS,
  type CardProgress,
  type LearnCard,
  type LearnCardKind,
  type LearnDraftCard,
  type LearnMode,
  type LearnProgress,
  type LearnStack,
} from '../../../shared/types.ts';
import { formatValue, parseEstimate } from './numbers.ts';
import { normalize, shuffle } from './util.ts';

export { GAP, hasGap };

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

export interface KastenStatus {
  /**
   * start = noch nicht begonnen, due = Karten zum Wiederholen fällig, new = nur neue Karten offen,
   * done = für heute erledigt, mastered = alle Karten in Fach 5 und nichts fällig.
   */
  state: 'start' | 'due' | 'new' | 'done' | 'mastered';
  /** Cards learned before that are due again now. */
  due: number;
  /** Cards never asked yet. */
  fresh: number;
  /** When the next card is due – only when nothing is due now. */
  nextDue: number | null;
}

/** Where a person stands with a stack – for badges and the colour of the name tiles. */
export function kastenStatus(stack: LearnStack, progress: LearnProgress | undefined, now = Date.now()): KastenStatus {
  const known = progress?.cards ?? {};
  let due = 0;
  let fresh = 0;
  let mastered = 0;
  let next = Infinity;
  for (const card of stack.cards) {
    const entry = known[card.id];
    if (!entry) fresh += 1;
    else if (entry.due <= now) due += 1;
    else next = Math.min(next, entry.due);
    if (entry?.box === BOXES) mastered += 1;
  }
  const state: KastenStatus['state'] =
    fresh === stack.cards.length ? 'start' : due > 0 ? 'due' : fresh > 0 ? 'new' : mastered === stack.cards.length ? 'mastered' : 'done';
  return { state, due, fresh, nextDue: due === 0 && Number.isFinite(next) ? next : null };
}

/** «morgen», «übermorgen», «in 5 Tagen» – when cards are due again. */
export function dueDayLabel(due: number, now = Date.now()): string {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  return days <= 0 ? 'heute' : days === 1 ? 'morgen' : days === 2 ? 'übermorgen' : `in ${days} Tagen`;
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
/** Separators that never appear inside a normal sentence – a line with one of them is not a Lückentext. */
const STRONG_SEPARATORS = ['\t', ' = ', ' – ', ' — ', ' -> ', ' → '];
const BRACKET = /\[([^[\]]{1,80})\]/g;

/** «Die [Aare] fliesst durch [Bern].» → one Lückentext card per bracket; the other brackets are filled in. */
function clozeFromLine(line: string): LearnDraftCard[] {
  const gaps = [...line.matchAll(BRACKET)];
  return gaps
    .map((gap) => {
      let prompt = '';
      let last = 0;
      for (const other of gaps) {
        prompt += line.slice(last, other.index) + (other === gap ? GAP : other[1]!.trim());
        last = other.index! + other[0].length;
      }
      prompt = (prompt + line.slice(last)).replace(/\s+/g, ' ').trim();
      return { kind: 'cloze' as const, prompt, answer: gap[1]!.trim(), accepted: [], distractors: [], uncertain: '' };
    })
    .filter((card) => card.answer && card.prompt.length <= LIMITS.cardText);
}

/**
 * Cards from typed or pasted text, one per line: «le chien = der Hund»,
 * «Hauptort von Bern? – Bern», or a Lückentext «Die Aare fliesst durch [Bern].».
 * Lines without a separator or brackets are skipped.
 */
export function parseTextCards(text: string): LearnDraftCard[] {
  const cards: LearnDraftCard[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim();
    if (!line) continue;
    const outside = line.replace(BRACKET, '');
    if (outside !== line && !STRONG_SEPARATORS.some((sep) => outside.includes(sep))) {
      cards.push(...clozeFromLine(line));
    } else {
      const separator = SEPARATORS.find((sep) => line.includes(sep));
      if (!separator) continue;
      const index = line.indexOf(separator);
      let prompt = line.slice(0, index).trim().slice(0, LIMITS.cardText);
      const answer = line.slice(index + separator.length).trim().slice(0, LIMITS.cardText);
      if (!prompt || !answer) continue;
      let kind: LearnCardKind = cardNumber(answer) ? 'number' : prompt.endsWith('?') ? 'qa' : 'translation';
      const gapped = /_{2,}|…|\.{3}/.test(prompt) ? normalizeGap(prompt, answer) : null;
      if (gapped) {
        prompt = gapped;
        kind = 'cloze';
      }
      cards.push({ kind, prompt, answer, accepted: [], distractors: [], uncertain: '' });
    }
    if (cards.length >= LIMITS.cardsPerStack) break;
  }
  return cards.slice(0, LIMITS.cardsPerStack);
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

/* -------------------------------------------------------- typed answers */

export interface TypedVerdict {
  /** right = korrekt, almost = zählt als richtig (Tippfehler, Akzent, Artikel), wrong = falsch. */
  verdict: 'right' | 'almost' | 'wrong';
  /** Short explanation for «almost». */
  note?: string;
}

const ARTICLES = /^(der|die|das|den|dem|des|ein|eine|einen|le|la|les|l'|l’|un|une|des|the|a|an|il|lo|gli|el|los|las)\s*/i;

/** Lower case, no punctuation, single spaces. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[.,;:!?"«»„“”()\[\]…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Also without accents and with ä → a (so «gluecklich» and «glucklich» both match «glücklich»). */
function loose(text: string): string {
  return normalize(plain(text).replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'))
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/ß/g, 'ss');
}

function withoutArticle(text: string): string {
  return text.replace(ARTICLES, '').trim();
}

/** Edit distance where swapping two neighbouring letters («Shcule») counts as one typo. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** All answers that count: the answer, its parts («viel, sehr»), and the accepted alternatives. */
function expectedAnswers(card: LearnCard): string[] {
  const parts = card.answer.split(/\s*(?:,|;|\/|\bodr?\b|\boder\b)\s*/).filter(Boolean);
  return [...new Set([card.answer, ...card.accepted, ...(parts.length > 1 ? parts : [])])];
}

/**
 * Checks a typed answer kindly: case, spaces and punctuation never matter;
 * a missing accent, a missing article or one small typo count as «almost right».
 */
export function checkTypedAnswer(input: string, card: LearnCard): TypedVerdict {
  const typed = plain(input);
  if (!typed) return { verdict: 'wrong' };
  const answers = expectedAnswers(card);
  if (answers.some((a) => plain(a) === typed)) return { verdict: 'right' };
  if (answers.some((a) => loose(a) === loose(typed))) return { verdict: 'almost', note: 'Achte auf Akzente und Umlaute.' };
  if (answers.some((a) => withoutArticle(loose(a)) === withoutArticle(loose(typed)) && withoutArticle(loose(a)))) {
    return { verdict: 'almost', note: 'Achte auf den Artikel.' };
  }
  const typo = answers.some((a) => {
    const target = withoutArticle(loose(a));
    const mine = withoutArticle(loose(typed));
    if (target.length < 5) return false;
    return distance(target, mine) <= (target.length >= 10 ? 2 : 1);
  });
  if (typo) return { verdict: 'almost', note: 'Kleiner Tippfehler.' };
  return { verdict: 'wrong' };
}

/* ----------------------------------------------------------- Lückentext */

/** Text before and after the gap of a Lückentext card, or null for other cards. */
export function splitGap(prompt: string): [string, string] | null {
  const parts = prompt.split(GAP);
  return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
}

/** The Lückentext cards of a stack, in the order of the text. */
export function clozeCards(stack: LearnStack): LearnCard[] {
  return stack.cards.filter((card) => card.kind === 'cloze' && hasGap(card.prompt));
}

/* ----------------------------------------------------------- Schätzrunde */

export interface CardNumber {
  value: number;
  /** «m», «Mio.», «Kantone» … or empty. */
  unit: string;
  /** A year like 1291 – shown without thousands separator, judged in years. */
  year: boolean;
}

const NUMBER_ANSWER = /^(?:ca\.?|rund|etwa|ungefähr)?\s*([-−]?\d[\d'’ .,]*)\s*([^\d]{0,16})$/i;

/** The number in an answer like «1291», «4478 m» or «8,7 Mio.» – null if the answer is not just a number. */
export function cardNumber(answer: string): CardNumber | null {
  const match = NUMBER_ANSWER.exec(answer.trim());
  if (!match) return null;
  const value = parseEstimate(match[1]!.replace('−', '-').replace(/[.,]$/, ''));
  if (value === null) return null;
  const unit = match[2]!.trim().replace(/^\.$/, '');
  const year = Number.isInteger(value) && value >= 1000 && value <= 2100 && (unit === '' || /^[nv]\.\s*chr\.?$/i.test(unit));
  return { value, unit, year };
}

export function formatCardNumber(number: CardNumber): string {
  return number.year ? `${number.value}${number.unit ? ` ${number.unit}` : ''}` : formatValue(number.value, number.unit);
}

/** Cards whose answer is a number or year – for the Schätzrunde. */
export function estimateCards(stack: LearnStack): LearnCard[] {
  return stack.cards.filter((card) => (card.kind === 'number' || card.kind === 'qa') && cardNumber(card.answer) !== null);
}

export type EstimateVerdict = 'exact' | 'close' | 'near' | 'off';

export const ESTIMATE_POINTS: Record<EstimateVerdict, number> = { exact: 3, close: 2, near: 1, off: 0 };

/**
 * How good a guess is. Years: exact, ±5 years, ±25 years. Other numbers: exact (rounding),
 * within 5 % (at least ±1 for whole numbers), within 20 % (at least ±3).
 */
export function estimateVerdict(answer: CardNumber, guess: number): EstimateVerdict {
  const diff = Math.abs(guess - answer.value);
  if (answer.year) return diff === 0 ? 'exact' : diff <= 5 ? 'close' : diff <= 25 ? 'near' : 'off';
  const scale = Math.abs(answer.value);
  const whole = Number.isInteger(answer.value);
  if (diff <= scale * 0.001) return 'exact';
  if (diff <= Math.max(scale * 0.05, whole ? 1 : 0)) return 'close';
  if (diff <= Math.max(scale * 0.2, whole ? 3 : 0)) return 'near';
  return 'off';
}

export interface EstimateResult {
  playerId: string;
  guess: number;
  diff: number;
  verdict: EstimateVerdict;
  /** Closest guess of the round (with several people) – one bonus point. */
  closest: boolean;
  points: number;
}

/** All guesses of a round, closest first. */
export function scoreEstimates(answer: CardNumber, guesses: Record<string, number>): EstimateResult[] {
  const entries = Object.entries(guesses).map(([playerId, guess]) => {
    const verdict = estimateVerdict(answer, guess);
    return { playerId, guess, diff: Math.abs(guess - answer.value), verdict };
  });
  const best = Math.min(...entries.map((e) => e.diff));
  return entries
    .map((entry) => {
      const closest = entries.length > 1 && entry.diff === best && entry.verdict !== 'off';
      return { ...entry, closest, points: ESTIMATE_POINTS[entry.verdict] + (closest ? 1 : 0) };
    })
    .sort((a, b) => a.diff - b.diff);
}

/* ----------------------------------------------------------- game modes */

/** Cards a mode needs – fewer and the mode cannot start. */
export const MODE_MIN_CARDS = { schaetzen: 3, luecke: 3 } as const;

/** Cards needed for a Blitzrunde – otherwise the same cards come round all the time. */
export const BLITZ_MIN_CARDS = 4;

/** Whether a mode can be played with the stack at all – modes that do not fit are not offered. */
export function modeFits(mode: LearnMode, stack: LearnStack): boolean {
  switch (mode) {
    case 'kasten':
      return stack.cards.length > 0;
    case 'luecke':
      return clozeCards(stack).length >= MODE_MIN_CARDS.luecke;
    case 'duell':
      return canPlayChoice(stack);
    case 'blitz':
      return stack.cards.length >= BLITZ_MIN_CARDS;
    case 'schaetzen':
      return estimateCards(stack).length >= MODE_MIN_CARDS.schaetzen;
  }
}

/** Modes that fit a stack: what the AI suggested plus what the cards allow. */
export function suggestedModes(stack: LearnStack): Set<LearnMode> {
  const modes = new Set<LearnMode>(stack.suggestedModes);
  if (estimateCards(stack).length >= MODE_MIN_CARDS.schaetzen) modes.add('schaetzen');
  if (clozeCards(stack).length >= MODE_MIN_CARDS.luecke) modes.add('luecke');
  return modes;
}

/* -------------------------------------------------------- stack choice */

/**
 * The stacks suggested on the setup screen: due cards first (most first), then the ones learned
 * or edited most recently. The chosen stack is always among them.
 */
export function recommendStacks(
  stacks: LearnStack[],
  progress: Record<string, LearnProgress>,
  due: Record<string, number>,
  selectedId: string | null,
  count = 3,
): LearnStack[] {
  const lastActivity = new Map<string, number>();
  for (const stack of stacks) lastActivity.set(stack.id, stack.updatedAt);
  for (const entry of Object.values(progress)) {
    if (entry.deleted || !lastActivity.has(entry.stackId)) continue;
    lastActivity.set(entry.stackId, Math.max(lastActivity.get(entry.stackId)!, entry.updatedAt));
  }
  const ranked = [...stacks].sort(
    (a, b) => (due[b.id] ?? 0) - (due[a.id] ?? 0) || lastActivity.get(b.id)! - lastActivity.get(a.id)!,
  );
  const shown = ranked.slice(0, count);
  const selected = stacks.find((stack) => stack.id === selectedId);
  if (selected && !shown.includes(selected)) shown[shown.length - 1] = selected;
  return shown;
}
