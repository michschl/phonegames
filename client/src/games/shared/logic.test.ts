import { beforeEach, describe, expect, it } from 'vitest';
import type { Player } from '../../../../shared/types.ts';
import { drawFresh } from './deck.ts';
import { effectiveSpies, scoreRound, setupRound as setupSpion } from '../spion/logic.ts';
import { LOCATIONS } from '../spion/locations.ts';
import { setupRound as setupDoppel, wordFor } from '../doppelgaenger/logic.ts';
import { PAIRS } from '../doppelgaenger/pairs.ts';
import { assignRoles, resolveNight, winner, wolfCount } from '../dorf/logic.ts';

beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, color: '#ff3d8b' }));

describe('drawFresh', () => {
  it('does not repeat until most of the pool was seen', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}` }));
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) seen.add(drawFresh('test', pool, (c) => c.id).id);
    expect(seen.size).toBe(16);
  });

  it('respects excluded ids', () => {
    const pool = [{ id: 'a' }, { id: 'b' }];
    for (let i = 0; i < 10; i++) expect(drawFresh('ex', pool, (c) => c.id, { exclude: ['a'] }).id).toBe('b');
  });
});

describe('Spion unter uns', () => {
  it('assigns spies and roles and offers the real location', () => {
    const ps = players(7);
    const round = setupSpion(ps, LOCATIONS[0]!, 2, Math.random, LOCATIONS);
    expect(round.spyIds).toHaveLength(2);
    expect(Object.keys(round.roles)).toHaveLength(5);
    expect(round.options.some((l) => l.id === LOCATIONS[0]!.id)).toBe(true);
    expect(round.options.length).toBeLessThanOrEqual(24);
  });

  it('uses only one spy in small groups', () => {
    expect(effectiveSpies(4, 2)).toBe(1);
    expect(effectiveSpies(6, 2)).toBe(2);
  });

  it('scores civilians and spies', () => {
    const ps = players(4);
    expect(scoreRound(ps, ['p0'], 'spy-caught')).toEqual({ p0: 0, p1: 1, p2: 1, p3: 1 });
    expect(scoreRound(ps, ['p0'], 'spy-escaped')).toEqual({ p0: 2, p1: 0, p2: 0, p3: 0 });
  });

  it('has enough distinct locations', () => {
    expect(LOCATIONS.length).toBeGreaterThanOrEqual(40);
    expect(LOCATIONS.every((l) => l.roles.length > 0)).toBe(true);
  });
});

describe('Doppelgänger', () => {
  it('gives the imposter the other word and never lets them start', () => {
    for (let i = 0; i < 50; i++) {
      const ps = players(5);
      const round = setupDoppel(ps, PAIRS[0]!, { imposters: 1, blank: false });
      expect(round.imposterIds).toHaveLength(1);
      expect(round.imposterIds).not.toContain(round.firstSpeaker);
      const imposter = round.imposterIds[0]!;
      expect(wordFor(round, imposter)).not.toBe(round.word);
      expect([PAIRS[0]!.a, PAIRS[0]!.b]).toContain(wordFor(round, imposter));
    }
  });

  it('gives no word in "ahnungslos" mode', () => {
    const round = setupDoppel(players(4), PAIRS[1]!, { imposters: 1, blank: true });
    expect(wordFor(round, round.imposterIds[0]!)).toBeNull();
  });
});

describe('Nachts im Dorf', () => {
  it('scales the number of werewolves', () => {
    expect(wolfCount(5)).toBe(1);
    expect(wolfCount(8)).toBe(2);
    expect(wolfCount(12)).toBe(3);
  });

  it('assigns every player exactly one role', () => {
    const ps = players(9);
    const roles = assignRoles(ps, { seherin: true, beschuetzer: true, discussionMinutes: 3, voice: true });
    const values = Object.values(roles);
    expect(values).toHaveLength(9);
    expect(values.filter((r) => r === 'werwolf')).toHaveLength(2);
    expect(values.filter((r) => r === 'seherin')).toHaveLength(1);
    expect(values.filter((r) => r === 'beschuetzer')).toHaveLength(1);
  });

  it('detects the winner', () => {
    const roles = { a: 'werwolf', b: 'dorf', c: 'dorf', d: 'seherin' } as const;
    expect(winner(roles, ['a', 'b', 'c', 'd'])).toBeNull();
    expect(winner(roles, ['a', 'b'])).toBe('wolf');
    expect(winner(roles, ['b', 'c', 'd'])).toBe('dorf');
  });

  it('protection saves the victim', () => {
    expect(resolveNight('a', 'a')).toBeNull();
    expect(resolveNight('a', 'b')).toBe('a');
  });
});
