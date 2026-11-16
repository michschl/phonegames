import { useMemo } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { kastenStatus, progressId, type KastenStatus } from '../../lib/learn.ts';
import { useData, useStack } from '../../store/data.ts';
import type { PlayerStatus, PlayerStatusInfo } from '../types.ts';

/** Colour, badge and text of a name tile for where a person stands in the Kartenkasten. */
export function kastenTile(status: KastenStatus): PlayerStatus {
  switch (status.state) {
    case 'due':
      return { tone: 'orange', badge: String(status.due), label: `${status.due} fällig${status.fresh > 0 ? ` · ${status.fresh} neu` : ''}` };
    case 'new':
      return { tone: 'blue', label: `${status.fresh} ${status.fresh === 1 ? 'neue Karte' : 'neue Karten'}` };
    case 'done':
      return { tone: 'green', badge: '✓', label: 'Heute erledigt' };
    case 'mastered':
      return { tone: 'yellow', badge: '⭐', label: 'Alles in Fach 5' };
    default:
      return { tone: 'neutral', label: 'Noch nicht begonnen' };
  }
}

export const KASTEN_LEGEND: PlayerStatusInfo['legend'] = [
  { tone: 'orange', label: 'Karten fällig' },
  { tone: 'blue', label: 'neue Karten' },
  { tone: 'green', label: 'heute erledigt' },
  { tone: 'yellow', label: 'alles in Fach 5' },
  { tone: 'neutral', label: 'noch nicht begonnen' },
];

/** Name tile status of each person (by player id) for a stack, or null without a stack. */
export function useKastenTiles(stackId: string | null | undefined, players: Player[]): Record<string, PlayerStatus> | null {
  const stack = useStack(stackId);
  const progress = useData((s) => s.progress);
  return useMemo(() => {
    if (!stack) return null;
    const now = Date.now();
    const tiles: Record<string, PlayerStatus> = {};
    for (const player of players) {
      const entry = progress[progressId(stack.id, player.name)];
      tiles[player.id] = kastenTile(kastenStatus(stack, entry && !entry.deleted ? entry : undefined, now));
    }
    return tiles;
  }, [stack, progress, players]);
}
