import { tallyOf } from '../../../shared/coins.ts';
import type { CoinWallet } from '../../../shared/types.ts';

/*
 * Family leaderboards: the best score of every person of the account in a game (and level), from the
 * records kept in the wallets (CoinWallet.best). Pure functions, see ranking.test.ts.
 */

export interface RankEntry {
  learner: string;
  score: number;
  place: number;
}

/** Everybody with a score for `key`, best first; equal scores share a place. */
export function familyRanking(wallets: Iterable<Pick<CoinWallet, 'learner' | 'best' | 'deleted'>>, key: string): RankEntry[] {
  const entries = [...wallets]
    .filter((w) => !w.deleted && (w.best[key] ?? 0) > 0)
    .map((w) => ({ learner: w.learner, score: w.best[key]! }))
    .sort((a, b) => b.score - a.score || a.learner.localeCompare(b.learner, 'de-CH'));
  let place = 0;
  return entries.map((entry, i) => {
    if (i === 0 || entry.score < entries[i - 1]!.score) place = i + 1;
    return { ...entry, place };
  });
}

/** The place of a person, or null without a score. */
export function placeOf(ranking: RankEntry[], learner: string): RankEntry | null {
  return ranking.find((entry) => entry.learner.toLowerCase() === learner.toLowerCase()) ?? null;
}

export interface TotalEntry {
  learner: string;
  points: number;
  wins: number;
  games: number;
  place: number;
}

/** Games played together: everybody's total points, wins and games in a game – most points first, then wins. */
export function familyTotals(wallets: Iterable<Pick<CoinWallet, 'learner' | 'tally' | 'deleted'>>, gameId: string): TotalEntry[] {
  const entries = [...wallets]
    .filter((w) => !w.deleted)
    .map((w) => ({
      learner: w.learner,
      points: tallyOf(w, `${gameId}:punkte`),
      wins: tallyOf(w, `${gameId}:siege`),
      games: tallyOf(w, `${gameId}:spiele`),
    }))
    .filter((e) => e.games > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.learner.localeCompare(b.learner, 'de-CH'));
  let place = 0;
  return entries.map((entry, i) => {
    const prev = entries[i - 1];
    if (!prev || entry.points < prev.points || (entry.points === prev.points && entry.wins < prev.wins)) place = i + 1;
    return { ...entry, place };
  });
}

/** Who won a game: everybody with the most points (nobody when nobody scored). */
export function winnersOf(points: Record<string, number>): string[] {
  const best = Math.max(0, ...Object.values(points));
  return best > 0 ? Object.keys(points).filter((id) => points[id] === best) : [];
}
