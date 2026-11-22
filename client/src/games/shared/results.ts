import { useEffect } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { winnersOf } from '../../lib/ranking.ts';
import { useData } from '../../store/data.ts';

/*
 * Points per person in the games played together: a game reports its current points (and, for team
 * games, who won); when it ends (leaving the game screen) they are added to everybody's totals for the
 * family leaderboard – points, wins and games played.
 */

interface Session {
  gameId: string;
  players: Player[];
  points: Record<string, number>;
  /** Player ids of the winners; null = the ones with the most points. */
  winners: string[] | null;
  /** Something happened worth counting (a point, a decided game). */
  counted: boolean;
}

let session: Session | null = null;

/** The game screen opened. */
export function startSession(gameId: string, players: Player[]): void {
  session = { gameId, players, points: {}, winners: null, counted: false };
}

/** The game screen closes: the points of this game go into the totals (once). */
export function endSession(): void {
  const current = session;
  session = null;
  commit(current);
}

/** «Neues Spiel» on the same screen: the finished game counts, the next one starts from zero. */
export function nextGame(): void {
  const current = session;
  if (!current) return;
  session = { ...current, points: {}, winners: null, counted: false };
  commit(current);
}

function commit(current: Session | null): void {
  if (!current || !current.counted || current.players.length === 0) return;
  const winners = new Set(current.winners ?? winnersOf(current.points));
  useData.getState().recordGame(
    current.gameId,
    current.players.map((p) => ({ name: p.name, points: Math.max(0, current.points[p.id] ?? 0), won: winners.has(p.id) })),
  );
}

/**
 * A game reports its points per player id (and the winners, if not simply the most points). Called on
 * every change; only the last report counts.
 */
export function useReportScores(points: Record<string, number>, winners: string[] | null = null): void {
  useEffect(() => {
    if (!session) return;
    session.points = points;
    session.winners = winners;
    session.counted = session.counted || Object.values(points).some((v) => v > 0) || (winners !== null && winners.length > 0);
  }, [points, winners]);
}
