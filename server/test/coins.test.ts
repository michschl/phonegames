import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { addTally, balance, cleanWallet, earnedSince, mergeWallet, tallyOf } from '../../shared/coins.ts';
import type { CoinWallet, RewardSettings, SyncResponse } from '../../shared/types.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
const T = Date.now() - 60_000;

let app: FastifyInstance;
let cookie: string;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

beforeEach(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', headers: HEADERS, payload: { name: 'Anna', email: 'anna@example.ch', password: 'geheim123' } });
  cookie = cookieFrom(res);
});

afterEach(async () => {
  await app.close();
});

const wallet = (patch: Partial<CoinWallet> = {}): CoinWallet => ({
  id: 'lea',
  learner: 'Lea',
  earned: {},
  spent: {},
  history: [],
  unlocks: [],
  best: {},
  updatedAt: T,
  deleted: false,
  ...patch,
});

const rewards = (patch: Partial<RewardSettings> = {}): RewardSettings => ({
  enabled: true,
  codeHash: '',
  codeSalt: '',
  perCard: 1,
  perPoint: 1,
  dailyMax: 60,
  pricePerRound: 5,
  arena: true,
  updatedAt: T,
  ...patch,
});

const sync = async (payload: object): Promise<SyncResponse> => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/sync',
    headers: { ...HEADERS, cookie },
    payload: { library: [], groups: [], ...payload },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as SyncResponse;
};

describe('coins of «Belohnungen»', () => {
  it('merges two phones without losing a coin, a purchase or a record', () => {
    const phone = wallet({ earned: { phone: 12 }, spent: { phone: 5 }, unlocks: ['auto:blitz'], best: { 'memo:1': 300 }, history: [{ id: 'a', at: 1, amount: 12, reason: 'Kartenkasten' }] });
    const tablet = wallet({ earned: { phone: 7, tablet: 4 }, spent: {}, best: { 'memo:1': 450, 'rennen:2': 90 }, history: [{ id: 'b', at: 2, amount: 4, reason: 'Aufgaben' }], updatedAt: T + 5 });
    const merged = mergeWallet(phone, tablet);
    expect(balance(merged)).toBe(12 + 4 - 5);
    expect(merged.unlocks).toEqual(['auto:blitz']);
    expect(merged.best).toEqual({ 'memo:1': 450, 'rennen:2': 90 });
    expect(merged.history.map((e) => e.id)).toEqual(['a', 'b']);
    // Merging again changes nothing.
    expect(mergeWallet(merged, phone)).toEqual(merged);
  });

  it('adds the games played together per device, so two phones never lose a game', () => {
    const phone = addTally(wallet(), 'phone', { 'spion:punkte': 4, 'spion:spiele': 1 }, T);
    const tablet = addTally(addTally(wallet(), 'tablet', { 'spion:punkte': 2, 'spion:spiele': 1, 'spion:siege': 1 }, T), 'tablet', { 'spion:spiele': 1 }, T + 1);
    const merged = mergeWallet(phone, tablet);
    expect([tallyOf(merged, 'spion:punkte'), tallyOf(merged, 'spion:spiele'), tallyOf(merged, 'spion:siege')]).toEqual([6, 3, 1]);
    // Old wallets without totals still merge.
    expect(tallyOf(mergeWallet(wallet(), phone), 'spion:punkte')).toBe(4);
    expect(cleanWallet({ ...phone, tally: { 'x:punkte': { a: -2 } } }).tally).toEqual({ 'x:punkte': { a: 0 } });
  });

  it('cleans what a device sends and counts only coins from learning towards the daily limit', () => {
    const clean = cleanWallet(wallet({ earned: { phone: -3, tablet: 2.7 }, spent: { x: Number.NaN } as Record<string, number> }));
    expect(clean.earned).toEqual({ phone: 0, tablet: 2 });
    expect(clean.spent).toEqual({ x: 0 });
    const day = wallet({
      history: [
        { id: 'a', at: 100, amount: 10, reason: 'Kartenkasten' },
        { id: 'b', at: 200, amount: 20, reason: 'Geschenk' },
        { id: 'c', at: 300, amount: -5, reason: 'Phoni-Rennen' },
        { id: 'd', at: 50, amount: 7, reason: 'Gestern' },
      ],
    });
    expect(earnedSince(day, 100)).toBe(10);
  });

  it('keeps wallets and settings on the server; older settings do not overwrite newer ones', async () => {
    await sync({ wallets: [wallet({ earned: { phone: 10 } })], rewards: rewards({ pricePerRound: 3, updatedAt: T + 10 }) });
    const res = await sync({ wallets: [wallet({ earned: { tablet: 5 }, spent: { tablet: 2 } })], rewards: rewards({ enabled: false, updatedAt: T }) });
    expect(res.wallets).toHaveLength(1);
    expect(balance(res.wallets![0])).toBe(13);
    expect(res.rewards).toMatchObject({ enabled: true, pricePerRound: 3 });
    // Values out of range are cut.
    const later = await sync({ rewards: rewards({ perCard: 500, pricePerRound: -4, updatedAt: T + 20 }) });
    expect(later.rewards).toMatchObject({ perCard: 10, pricePerRound: 0, arena: true });
    // Parents hide the «Arena».
    expect((await sync({ rewards: rewards({ arena: false, updatedAt: T + 30 }) })).rewards).toMatchObject({ arena: false });
    // Older apps send neither.
    const old = await sync({});
    expect(old.wallets).toHaveLength(1);
  });

  it('confirms the password for a forgotten code', async () => {
    const check = (password: string) => app.inject({ method: 'POST', url: '/api/account/check-password', headers: { ...HEADERS, cookie }, payload: { password } });
    expect((await check('geheim123')).statusCode).toBe(204);
    expect((await check('falsch!!')).statusCode).toBe(403);
  });
});
