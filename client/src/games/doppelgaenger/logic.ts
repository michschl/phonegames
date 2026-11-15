import type { Player } from '../../../../shared/types.ts';
import { shuffle } from '../../lib/util.ts';
import type { WordPair } from './pairs.ts';

export interface DoppelSettings {
  imposters: number;
  /** "Ahnungslos": the imposter gets no word at all. */
  blank: boolean;
}

export const DEFAULT_SETTINGS: DoppelSettings = { imposters: 1, blank: false };

export interface DoppelRound {
  pair: WordPair;
  /** Word of the majority. */
  word: string;
  /** Word of the imposter(s) – null in "ahnungslos" mode. */
  otherWord: string | null;
  imposterIds: string[];
  firstSpeaker: string;
}

/** Two imposters only from 7 players on. */
export function effectiveImposters(playerCount: number, wanted: number): number {
  return playerCount >= 7 ? Math.min(2, Math.max(1, wanted)) : 1;
}

export function setupRound(
  players: Player[],
  pair: WordPair,
  settings: DoppelSettings,
  random: () => number = Math.random,
): DoppelRound {
  const swap = random() < 0.5;
  const word = swap ? pair.b : pair.a;
  const other = swap ? pair.a : pair.b;
  const imposterIds = shuffle(players)
    .slice(0, effectiveImposters(players.length, settings.imposters))
    .map((p) => p.id);
  // The first speaker is never an imposter – they would have nothing to copy.
  const civilians = players.filter((p) => !imposterIds.includes(p.id));
  const firstSpeaker = civilians[Math.floor(random() * civilians.length)]!.id;
  return { pair, word, otherWord: settings.blank ? null : other, imposterIds, firstSpeaker };
}

export function wordFor(round: DoppelRound, playerId: string): string | null {
  return round.imposterIds.includes(playerId) ? round.otherWord : round.word;
}
