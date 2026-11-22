import { LIMITS, type CoinEvent, type CoinWallet, type RewardSettings } from './types.ts';

/*
 * Coins of «Belohnungen»: earned by learning, spent on rounds of «Allein spielen». Shared by app and
 * server, so both merge wallets the same way. A wallet counts per device (earned, spent): merging takes
 * the larger count of each device, so coins added on two phones at the same time all stay.
 */

export const DEFAULT_REWARDS: Omit<RewardSettings, 'updatedAt'> = {
  enabled: false,
  codeHash: '',
  codeSalt: '',
  perCard: 1,
  perPoint: 1,
  dailyMax: 60,
  pricePerRound: 5,
};

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);

export function balance(wallet: Pick<CoinWallet, 'earned' | 'spent'> | undefined): number {
  return wallet ? Math.max(0, sum(wallet.earned) - sum(wallet.spent)) : 0;
}

/** Coins earned by learning on the day that starts at `dayStart` (gifts by parents do not count). */
export function earnedSince(wallet: Pick<CoinWallet, 'history'> | undefined, dayStart: number): number {
  if (!wallet) return 0;
  return wallet.history.filter((e) => e.at >= dayStart && e.amount > 0 && !e.reason.startsWith('Geschenk')).reduce((a, e) => a + e.amount, 0);
}

function maxPerKey(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = { ...a };
  for (const [key, value] of Object.entries(b)) result[key] = Math.max(result[key] ?? 0, value);
  return result;
}

function latestHistory(events: CoinEvent[]): CoinEvent[] {
  const byId = new Map<string, CoinEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id)).slice(-LIMITS.walletHistory);
}

/** Both states of a wallet together: no coin, purchase or record gets lost. */
export function mergeWallet(a: CoinWallet | undefined, b: CoinWallet): CoinWallet {
  if (!a) return b;
  const newer = b.updatedAt >= a.updatedAt ? b : a;
  return {
    id: a.id,
    learner: newer.learner,
    earned: maxPerKey(a.earned, b.earned),
    spent: maxPerKey(a.spent, b.spent),
    history: latestHistory([...a.history, ...b.history]),
    unlocks: [...new Set([...a.unlocks, ...b.unlocks])].slice(0, LIMITS.walletUnlocks),
    best: maxPerKey(a.best, b.best),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    deleted: newer.deleted,
  };
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), 1e9) : 0);
const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

function counts(value: unknown, max: number): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== 'object') return result;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, max)) {
    if (typeof key === 'string' && key.length <= 64) result[key] = count(raw);
  }
  return result;
}

/** A wallet as received from a device, made safe (sizes, numbers). */
export function cleanWallet(raw: CoinWallet): CoinWallet {
  const history = Array.isArray(raw.history) ? raw.history : [];
  return {
    id: String(raw.id).slice(0, 64),
    learner: String(raw.learner ?? '').trim().slice(0, LIMITS.nameMax),
    earned: counts(raw.earned, LIMITS.walletDevices),
    spent: counts(raw.spent, LIMITS.walletDevices),
    history: latestHistory(
      history
        .filter((e) => e && typeof e.id === 'string' && typeof e.at === 'number' && typeof e.amount === 'number' && Number.isFinite(e.amount))
        .map((e) => ({ id: e.id.slice(0, 64), at: e.at, amount: Math.round(e.amount), reason: String(e.reason ?? '').slice(0, LIMITS.coinReason) })),
    ),
    unlocks: Array.isArray(raw.unlocks) ? [...new Set(raw.unlocks.filter((u) => typeof u === 'string').map((u) => u.slice(0, 40)))].slice(0, LIMITS.walletUnlocks) : [],
    best: counts(raw.best, LIMITS.walletBest),
    updatedAt: time(raw.updatedAt),
    deleted: raw.deleted === true,
  };
}

/** Settings as received from a device, made safe. */
export function cleanRewards(raw: RewardSettings): RewardSettings {
  const within = (value: unknown, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.round(value))) : fallback;
  return {
    enabled: raw.enabled === true,
    codeHash: typeof raw.codeHash === 'string' ? raw.codeHash.slice(0, 128) : '',
    codeSalt: typeof raw.codeSalt === 'string' ? raw.codeSalt.slice(0, 64) : '',
    perCard: within(raw.perCard, 10, DEFAULT_REWARDS.perCard),
    perPoint: within(raw.perPoint, 10, DEFAULT_REWARDS.perPoint),
    dailyMax: within(raw.dailyMax, 1000, DEFAULT_REWARDS.dailyMax),
    pricePerRound: within(raw.pricePerRound, 100, DEFAULT_REWARDS.pricePerRound),
    updatedAt: time(raw.updatedAt),
  };
}

/** A new, empty wallet. */
export function emptyWallet(id: string, learner: string, now: number): CoinWallet {
  return { id, learner, earned: {}, spent: {}, history: [], unlocks: [], best: {}, updatedAt: now, deleted: false };
}

/** Adds coins (positive) or takes them (negative) on this device, with an entry in the history. */
export function bookCoins(wallet: CoinWallet, device: string, event: CoinEvent): CoinWallet {
  const earned = event.amount > 0 ? { ...wallet.earned, [device]: (wallet.earned[device] ?? 0) + event.amount } : wallet.earned;
  const spent = event.amount < 0 ? { ...wallet.spent, [device]: (wallet.spent[device] ?? 0) - event.amount } : wallet.spent;
  return { ...wallet, earned, spent, history: latestHistory([...wallet.history, event]), updatedAt: Math.max(wallet.updatedAt + 1, event.at), deleted: false };
}
