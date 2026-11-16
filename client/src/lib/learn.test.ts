import { describe, expect, it } from 'vitest';
import type { LearnCard, LearnProgress, LearnStack } from '../../../shared/types.ts';
import { boxCounts, checkTypedAnswer, choicesFor, dueCards, nextProgress, parseTextCards, progressId } from './learn.ts';

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
      ['le chien = der Hund', '2. la maison – das Haus', 'Hauptort von Bern? - Bern', 'Gründung der Eidgenossenschaft: 1291', '', 'ohne Trenner'].join('\n'),
    );
    expect(cards.map((c) => [c.kind, c.prompt, c.answer])).toEqual([
      ['translation', 'le chien', 'der Hund'],
      ['translation', 'la maison', 'das Haus'],
      ['qa', 'Hauptort von Bern?', 'Bern'],
      ['number', 'Gründung der Eidgenossenschaft', '1291'],
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
