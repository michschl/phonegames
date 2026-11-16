import { describe, expect, it } from 'vitest';
import type { LearnCard, LearnProgress, LearnStack } from '../../../shared/types.ts';
import {
  boxCounts,
  cardNumber,
  checkTypedAnswer,
  choicesFor,
  clozeCards,
  dueCards,
  dueDayLabel,
  estimateCards,
  estimateVerdict,
  formatCardNumber,
  kastenStatus,
  nextProgress,
  parseTextCards,
  progressId,
  scoreEstimates,
  splitGap,
  suggestedModes,
} from './learn.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 16, 15, 30).getTime();
const MIDNIGHT = new Date(2026, 10, 16).getTime();

const card = (id: string, answer: string, patch: Partial<LearnCard> = {}): LearnCard => ({
  id,
  kind: 'translation',
  prompt: `prompt ${id}`,
  answer,
  accepted: [],
  distractors: [],
  ...patch,
});

const stack = (cards: LearnCard[]): LearnStack => ({
  id: 'stack-1',
  title: 'Test',
  subject: 'Französisch',
  languages: [],
  cards,
  suggestedModes: ['kasten'],
  source: 'text',
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

describe('Kartenkasten', () => {
  it('moves known cards up one box and sends missed cards back to box 1', () => {
    expect(nextProgress(undefined, true, NOW)).toEqual({ box: 2, due: MIDNIGHT + DAY });
    expect(nextProgress({ box: 2, due: 0 }, true, NOW)).toEqual({ box: 3, due: MIDNIGHT + 3 * DAY });
    expect(nextProgress({ box: 4, due: 0 }, true, NOW)).toEqual({ box: 5, due: MIDNIGHT + 14 * DAY });
    // Known in the last box: mastered, back in a month.
    expect(nextProgress({ box: 5, due: 0 }, true, NOW)).toEqual({ box: 5, due: MIDNIGHT + 30 * DAY });
    expect(nextProgress({ box: 4, due: 0 }, false, NOW)).toEqual({ box: 1, due: NOW });
  });

  it('picks due cards, lowest box first, new cards last', () => {
    const s = stack([card('a', '1'), card('b', '2'), card('c', '3'), card('d', '4')]);
    const progress: LearnProgress = {
      id: 'p',
      stackId: s.id,
      player: 'Lea',
      cards: { a: { box: 3, due: NOW - 1 }, b: { box: 1, due: NOW - 1 }, c: { box: 4, due: NOW + DAY } },
      updatedAt: 0,
      deleted: false,
    };
    expect(dueCards(s, progress, 10, NOW).map((c) => c.id)).toEqual(['b', 'a', 'd']);
    expect(dueCards(s, progress, 2, NOW).map((c) => c.id)).toEqual(['b', 'a']);
    expect(boxCounts(s, progress)).toEqual([1, 1, 0, 1, 1, 0]);
  });

  it('tells where a person stands with a stack', () => {
    const s = stack([card('a', '1'), card('b', '2'), card('c', '3')]);
    const at = (cards: LearnProgress['cards']): LearnProgress => ({ id: 'p', stackId: s.id, player: 'Lea', cards, updatedAt: 0, deleted: false });
    expect(kastenStatus(s, undefined, NOW)).toEqual({ state: 'start', due: 0, fresh: 3, nextDue: null });
    expect(kastenStatus(s, at({ a: { box: 2, due: NOW - 1 }, b: { box: 3, due: NOW + DAY } }), NOW)).toEqual({
      state: 'due',
      due: 1,
      fresh: 1,
      nextDue: null,
    });
    expect(kastenStatus(s, at({ a: { box: 2, due: NOW + DAY } }), NOW).state).toBe('new');
    const done = at({ a: { box: 2, due: MIDNIGHT + DAY }, b: { box: 5, due: MIDNIGHT + 3 * DAY }, c: { box: 5, due: MIDNIGHT + 30 * DAY } });
    expect(kastenStatus(s, done, NOW)).toEqual({ state: 'done', due: 0, fresh: 0, nextDue: MIDNIGHT + DAY });
    const mastered = at({ a: { box: 5, due: MIDNIGHT + 30 * DAY }, b: { box: 5, due: MIDNIGHT + 14 * DAY }, c: { box: 5, due: MIDNIGHT + 30 * DAY } });
    expect(kastenStatus(s, mastered, NOW).state).toBe('mastered');
  });

  it('names the day cards are due again', () => {
    expect(dueDayLabel(MIDNIGHT + DAY, NOW)).toBe('morgen');
    expect(dueDayLabel(MIDNIGHT + 2 * DAY, NOW)).toBe('übermorgen');
    expect(dueDayLabel(MIDNIGHT + 7 * DAY, NOW)).toBe('in 7 Tagen');
  });

  it('gives a stack and a person the same progress id on every device', () => {
    expect(progressId('stack-1', 'Léa ')).toBe(progressId('stack-1', 'lea'));
    expect(progressId('stack-1', 'Lea')).not.toBe(progressId('stack-1', 'Ben'));
    expect(progressId('stack-1', 'Lea')).toMatch(/^p-stack-1-[a-z0-9]+$/);
  });
});

describe('multiple choice', () => {
  it('offers the answer and three different wrong answers', () => {
    const s = stack([
      card('a', 'der Hund', { distractors: ['die Katze'] }),
      card('b', 'das Haus'),
      card('c', 'die Katze'),
      card('d', 'der Hund'),
      card('e', 'die Schule'),
    ]);
    const options = choicesFor(s.cards[0]!, s);
    expect(options).toHaveLength(4);
    expect(options).toContain('der Hund');
    expect(options).toContain('die Katze');
    expect(new Set(options).size).toBe(4);
  });
});

describe('text import', () => {
  it('reads one card per line with common separators', () => {
    const cards = parseTextCards(
      ['le chien = der Hund', '2. la maison – das Haus', 'Hauptort von Bern? - Bern', 'Gründung der Eidgenossenschaft: 1291', '', 'ohne Trenner', 'Matterhorn = 4478 m'].join('\n'),
    );
    expect(cards.map((c) => [c.kind, c.prompt, c.answer])).toEqual([
      ['translation', 'le chien', 'der Hund'],
      ['translation', 'la maison', 'das Haus'],
      ['qa', 'Hauptort von Bern?', 'Bern'],
      ['number', 'Gründung der Eidgenossenschaft', '1291'],
      ['number', 'Matterhorn', '4478 m'],
    ]);
  });
});

describe('typed answers', () => {
  const hund = card('a', 'der Hund');
  it('ignores case, spaces and punctuation', () => {
    expect(checkTypedAnswer('  Der hund. ', hund).verdict).toBe('right');
    expect(checkTypedAnswer('', hund).verdict).toBe('wrong');
  });

  it('counts a missing article, accent or a small typo as almost right', () => {
    expect(checkTypedAnswer('Hund', hund)).toEqual({ verdict: 'almost', note: 'Achte auf den Artikel.' });
    expect(checkTypedAnswer('gluecklich', card('b', 'glücklich')).verdict).toBe('almost');
    expect(checkTypedAnswer("l'ecole", card('c', 'l’école')).verdict).toBe('almost');
    expect(checkTypedAnswer('die Shcule', card('d', 'die Schule'))).toEqual({ verdict: 'almost', note: 'Kleiner Tippfehler.' });
  });

  it('accepts any part of «viel, sehr» and the alternatives', () => {
    expect(checkTypedAnswer('sehr', card('e', 'viel, sehr')).verdict).toBe('right');
    expect(checkTypedAnswer('Wagen', card('f', 'das Auto', { accepted: ['der Wagen'] })).verdict).toBe('almost');
  });

  it('stays strict where a typo changes the word', () => {
    expect(checkTypedAnswer('Haus', card('g', 'Hand')).verdict).toBe('wrong');
    expect(checkTypedAnswer('die Katze', hund).verdict).toBe('wrong');
    expect(checkTypedAnswer('1219', card('h', '1291', { kind: 'number' })).verdict).toBe('wrong');
  });
});

describe('Lückentext', () => {
  it('reads gaps in brackets – one card per bracket', () => {
    const cards = parseTextCards(['Die Aare fliesst durch [Bern].', 'Der [Rhein] fliesst in die [Nordsee].', 'Die Hauptstadt ist ___ = Bern', 'le chien [m] = der Hund'].join('\n'));
    expect(cards.map((c) => [c.kind, c.prompt, c.answer])).toEqual([
      ['cloze', 'Die Aare fliesst durch ___.', 'Bern'],
      ['cloze', 'Der ___ fliesst in die Nordsee.', 'Rhein'],
      ['cloze', 'Der Rhein fliesst in die ___.', 'Nordsee'],
      ['cloze', 'Die Hauptstadt ist ___', 'Bern'],
      ['translation', 'le chien [m]', 'der Hund'],
    ]);
  });

  it('splits a sentence at its gap and keeps the order of the text', () => {
    expect(splitGap('Die Aare fliesst durch ___.')).toEqual(['Die Aare fliesst durch ', '.']);
    expect(splitGap('Keine Lücke')).toBeNull();
    const s = stack([card('a', 'Bern', { kind: 'cloze', prompt: 'Hauptstadt: ___' }), card('b', '1'), card('c', 'Aare', { kind: 'cloze', prompt: 'Fluss: ___' })]);
    expect(clozeCards(s).map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('Schätzrunde', () => {
  it('reads numbers, units and years from answers', () => {
    expect(cardNumber('1291')).toEqual({ value: 1291, unit: '', year: true });
    expect(cardNumber("4'478 m")).toEqual({ value: 4478, unit: 'm', year: false });
    expect(cardNumber('ca. 8,7 Mio.')).toEqual({ value: 8.7, unit: 'Mio.', year: false });
    expect(cardNumber('26 Kantone')).toEqual({ value: 26, unit: 'Kantone', year: false });
    expect(cardNumber('1848–1874')).toBeNull();
    expect(cardNumber('der Hund')).toBeNull();
    expect(formatCardNumber(cardNumber('1291')!)).toBe('1291');
    expect(formatCardNumber(cardNumber('4478 m')!)).toMatch(/^4['’]478 m$/);
  });

  it('only uses number and question cards', () => {
    const s = stack([card('a', '1291', { kind: 'number' }), card('b', '20', { kind: 'translation' }), card('c', '4478 m', { kind: 'qa' }), card('d', 'Bern', { kind: 'qa' })]);
    expect(estimateCards(s).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('judges guesses in years or relative to the number', () => {
    const year = cardNumber('1291')!;
    expect([1291, 1295, 1315, 1350].map((g) => estimateVerdict(year, g))).toEqual(['exact', 'close', 'near', 'off']);
    const height = cardNumber('4478 m')!;
    expect([4480, 4300, 3700, 3000].map((g) => estimateVerdict(height, g))).toEqual(['exact', 'close', 'near', 'off']);
    const small = cardNumber('7')!;
    expect([7, 8, 10, 11].map((g) => estimateVerdict(small, g))).toEqual(['exact', 'close', 'near', 'off']);
  });

  it('gives a bonus point to the closest guess', () => {
    const results = scoreEstimates(cardNumber('1291')!, { lea: 1300, ben: 1291, mia: 1500 });
    expect(results.map((r) => [r.playerId, r.verdict, r.closest, r.points])).toEqual([
      ['ben', 'exact', true, 4],
      ['lea', 'near', false, 1],
      ['mia', 'off', false, 0],
    ]);
    // Alone there is nobody to beat.
    expect(scoreEstimates(cardNumber('1291')!, { lea: 1291 })[0]).toMatchObject({ closest: false, points: 3 });
  });

  it('suggests the modes the cards allow', () => {
    const numbers = stack(['1291', '1315', '1386'].map((a, i) => card(`n${i}`, a, { kind: 'number' })));
    expect([...suggestedModes(numbers)].sort()).toEqual(['kasten', 'schaetzen']);
  });
});
