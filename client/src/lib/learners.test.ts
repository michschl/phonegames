import { describe, expect, it } from 'vitest';
import type { LearnCard, LearnProgress, LearnStack, PlayerGroup } from '../../../shared/types.ts';
import { addLearningDay, learnStreak, localDay, modeFits, nextRepetition } from './learn.ts';
import { collectLearners, defaultLearner, learnerColor, obviousLearner } from './learners.ts';

const progress = (stackId: string, player: string, updatedAt: number, patch: Partial<LearnProgress> = {}): LearnProgress => ({
  id: `p-${stackId}-${player}`,
  stackId,
  player,
  cards: { c1: { box: 1, due: 0 } },
  updatedAt,
  deleted: false,
  ...patch,
});

const group = (id: string, names: string[], color = '#5b8cff'): PlayerGroup => ({
  id,
  name: id,
  emoji: '🏡',
  players: names.map((name) => ({ id: `${id}-${name}`, name, color })),
  createdAt: 0,
  updatedAt: 0,
  deleted: false,
});

const names = (list: { name: string }[]) => list.map((p) => p.name);

describe('collectLearners', () => {
  it('lists who learned the stack first (latest first), then the Spickzettel group, oneself, added names and others', () => {
    const list = collectLearners({
      stackId: 's1',
      progress: [progress('s1', 'Ben', 10), progress('s1', 'Lina', 20), progress('s2', 'Noah', 30)],
      groups: [group('familie', ['Mia', 'lina']), group('party', ['Kevin', 'Sandra'])],
      learnGroupId: 'familie',
      self: 'Mama',
      extra: ['Elia'],
    });
    expect(names(list)).toEqual(['Lina', 'Ben', 'Mia', 'Mama', 'Elia', 'Noah']);
  });

  it('takes the colour from a group and is case-insensitive', () => {
    const list = collectLearners({ progress: [progress('s1', 'LINA', 1)], groups: [group('g', ['lina'], '#ff3d8b')], extra: [] });
    expect(list).toEqual([{ id: 'learner-lina', name: 'LINA', color: '#ff3d8b' }]);
  });

  it('ignores deleted and empty progress', () => {
    const list = collectLearners({
      progress: [progress('s1', 'Weg', 1, { deleted: true }), progress('s1', 'Leer', 2, { cards: {} })],
      groups: [],
      self: 'Mama',
      extra: [],
    });
    expect(names(list)).toEqual(['Mama']);
  });

  it('gives names without a group a stable colour', () => {
    expect(learnerColor('Lina')).toBe(learnerColor(' lina '));
    expect(learnerColor('Lina')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('defaultLearner', () => {
  const learners = [
    { id: 'a', name: 'Mama', color: '#000000' },
    { id: 'b', name: 'Lina', color: '#000000' },
  ];
  it('prefers who learned this stack last, then who learned last, then the first', () => {
    expect(defaultLearner(learners, 's1', { s1: 'lina' }, 'Mama')).toBe('Lina');
    expect(defaultLearner(learners, 's2', { s1: 'Lina' }, 'Lina')).toBe('Lina');
    expect(defaultLearner(learners, 's2', {}, null)).toBe('Mama');
    expect(defaultLearner(learners, 's2', {}, 'Gone')).toBe('Mama');
  });
});

describe('obviousLearner', () => {
  const lina = [{ id: 'b', name: 'Lina', color: '#000000' }];
  it('starts right away for whoever learned the stack last', () => {
    expect(obviousLearner([...lina, { id: 'a', name: 'Mama', color: '#000000' }], 's1', { s1: 'Lina' }, [])).toBe('Lina');
  });
  it('starts right away for the only person who learns at all', () => {
    expect(obviousLearner(lina, 'new', {}, [progress('s1', 'Lina', 1)])).toBe('Lina');
  });
  it('asks when nobody has learned yet or several people learn', () => {
    expect(obviousLearner(lina, 'new', {}, [])).toBeNull();
    expect(obviousLearner([...lina, { id: 'a', name: 'Mama', color: '#000000' }], 'new', {}, [progress('s1', 'Lina', 1)])).toBeNull();
  });
});

describe('modeFits', () => {
  const card = (id: string, patch: Partial<LearnCard> = {}): LearnCard => ({
    id,
    kind: 'translation',
    prompt: `prompt ${id}`,
    answer: `answer ${id}`,
    accepted: [],
    distractors: [],
    ...patch,
  });
  const stack = (cards: LearnCard[]): LearnStack => ({
    id: 's',
    title: 'S',
    subject: '',
    languages: [],
    cards,
    suggestedModes: [],
    source: 'text',
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  });
  it('offers only what the cards allow', () => {
    const three = stack([card('1'), card('2'), card('3')]);
    expect(modeFits('kasten', three)).toBe(true);
    expect(modeFits('blitz', three)).toBe(false);
    expect(modeFits('duell', three)).toBe(false);
    expect(modeFits('luecke', three)).toBe(false);
    expect(modeFits('schaetzen', three)).toBe(false);
    const years = stack(['1291', '1315', '1386', '1848'].map((year, i) => card(`${i}`, { kind: 'number', answer: year })));
    expect(modeFits('schaetzen', years)).toBe(true);
    expect(modeFits('blitz', years)).toBe(true);
    const cloze = stack(['Bern', 'Rhein', 'Aare'].map((word, i) => card(`${i}`, { kind: 'cloze', prompt: 'Das ist ___.', answer: word })));
    expect(modeFits('luecke', cloze)).toBe(true);
    expect(modeFits('kasten', stack([]))).toBe(false);
  });
});

describe('learning days and streak', () => {
  const NOON = new Date(2026, 10, 16, 12).getTime();
  const DAY = 24 * 60 * 60 * 1000;
  const day = (offset: number) => localDay(NOON + offset * DAY);

  it('keeps sorted, unique days, the newest 60', () => {
    expect(addLearningDay(['2026-11-15'], '2026-11-14')).toEqual(['2026-11-14', '2026-11-15']);
    expect(addLearningDay(['2026-11-15'], '2026-11-15')).toEqual(['2026-11-15']);
    const many = Array.from({ length: 60 }, (_, i) => localDay(NOON - (60 - i) * DAY));
    expect(addLearningDay(many, day(0))).toHaveLength(60);
    expect(addLearningDay(many, day(0)).at(-1)).toBe(day(0));
  });

  it('counts days in a row over all stacks of a person', () => {
    const list = [
      progress('s1', 'Lina', 1, { days: [day(-3), day(-1)] }),
      progress('s2', 'lina', 1, { days: [day(-2), day(0)] }),
      progress('s1', 'Ben', 1, { days: [day(0)] }),
    ];
    expect(learnStreak(list, 'Lina', NOON)).toEqual({ days: 4, today: true });
    expect(learnStreak(list, 'Ben', NOON)).toEqual({ days: 1, today: true });
  });

  it('keeps the streak until a whole day is missed', () => {
    const yesterday = [progress('s1', 'Lina', 1, { days: [day(-2), day(-1)] })];
    expect(learnStreak(yesterday, 'Lina', NOON)).toEqual({ days: 2, today: false });
    const gap = [progress('s1', 'Lina', 1, { days: [day(-3), day(-2)] })];
    expect(learnStreak(gap, 'Lina', NOON)).toEqual({ days: 0, today: false });
    expect(learnStreak([progress('s1', 'Alt', 1)], 'Alt', NOON)).toEqual({ days: 0, today: false });
  });
});

describe('nextRepetition', () => {
  const NOW = new Date(2026, 10, 16, 15).getTime();
  const TOMORROW_MORNING = new Date(2026, 10, 17, 8).getTime();
  const TOMORROW_EVENING = new Date(2026, 10, 17, 20).getTime();
  const LATER = new Date(2026, 10, 20, 9).getTime();
  const cards = ['a', 'b', 'c', 'd'].map((id) => ({ id, kind: 'qa' as const, prompt: id, answer: id, accepted: [], distractors: [] }));
  const learnStack: LearnStack = { id: 's', title: 'S', subject: '', languages: [], cards, suggestedModes: [], source: 'text', createdAt: 0, updatedAt: 0, deleted: false };

  it('says when the next cards are due and how many by the end of that day', () => {
    const entry = progress('s', 'Lina', 1, {
      cards: { a: { box: 2, due: TOMORROW_MORNING }, b: { box: 2, due: TOMORROW_EVENING }, c: { box: 3, due: LATER }, d: { box: 1, due: NOW - 1 } },
    });
    expect(nextRepetition(learnStack, entry, NOW)).toEqual({ at: TOMORROW_MORNING, count: 2 });
    expect(nextRepetition(learnStack, undefined, NOW)).toBeNull();
  });
});
