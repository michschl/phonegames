import type { Player } from '../../../../shared/types.ts';
import { shuffle } from '../../lib/util.ts';
import type { SpyLocation } from './locations.ts';

export interface SpionSettings {
  minutes: number;
  spies: number;
}

export const DEFAULT_SETTINGS: SpionSettings = { minutes: 8, spies: 1 };

export interface SpionRound {
  location: SpyLocation;
  spyIds: string[];
  /** Role per non-spy player. */
  roles: Record<string, string>;
  /** Who asks the first question. */
  firstAsker: string;
  /** Locations shown to the spy this round (always contains the real one). */
  options: SpyLocation[];
}

const OPTION_COUNT = 24;

/** Two spies only make sense from 6 players on. */
export function effectiveSpies(playerCount: number, wanted: number): number {
  return playerCount >= 6 ? Math.min(2, Math.max(1, wanted)) : 1;
}

export function setupRound(
  players: Player[],
  location: SpyLocation,
  spies: number,
  random: () => number = Math.random,
  allLocations: SpyLocation[] = [location],
): SpionRound {
  const order = shuffle(players);
  const spyIds = order.slice(0, effectiveSpies(players.length, spies)).map((p) => p.id);
  const roles: Record<string, string> = {};
  const roleBag = shuffle(location.roles);
  players
    .filter((p) => !spyIds.includes(p.id))
    .forEach((p, i) => {
      roles[p.id] = roleBag[i % roleBag.length]!;
    });
  const firstAsker = players[Math.floor(random() * players.length)]!.id;
  const others = shuffle(allLocations.filter((l) => l.id !== location.id)).slice(0, OPTION_COUNT - 1);
  const options = [location, ...others].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { location, spyIds, roles, firstAsker, options };
}

export type SpionOutcome = 'spy-caught' | 'spy-escaped' | 'spy-guessed' | 'spy-wrong-guess';

/** Points per player for a finished round. Civilians +1 each, spies +2 each. */
export function scoreRound(players: Player[], spyIds: string[], outcome: SpionOutcome): Record<string, number> {
  const spiesWin = outcome === 'spy-escaped' || outcome === 'spy-guessed';
  const points: Record<string, number> = {};
  for (const p of players) {
    const isSpy = spyIds.includes(p.id);
    points[p.id] = spiesWin ? (isSpy ? 2 : 0) : isSpy ? 0 : 1;
  }
  return points;
}
