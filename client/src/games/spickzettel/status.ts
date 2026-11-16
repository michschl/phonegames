import { useMemo } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { kastenStatus, progressId, type KastenStatus } from '../../lib/learn.ts';
import { useData, useStack } from '../../store/data.ts';
import type { PlayerStatus, PlayerStatusInfo } from '../types.ts';

/** Colour, badges and text of a name tile for where a person stands in the Kartenkasten. */
export function kastenTile(status: KastenStatus): PlayerStatus {
  switch (status.state) {
    case 'due':
      return { tone: 'orange', due: status.due, label: `${status.due} fällig${status.fresh > 0 ? ` · ${status.fresh} neu` : ''}` };
    case 'new':
      return { tone: 'blue', due: 0, label: `${status.fresh} ${status.fresh === 1 ? 'neue Karte' : 'neue Karten'}` };
    case 'done':
      return { tone: 'green', due: 0, badge: '✓', label: 'Heute erledigt' };
    case 'mastered':
      return { tone: 'yellow', due: 0, badge: '★', label: 'Alles in Fach 5' };
    default:
      return { tone: 'neutral', due: 0, label: 'Noch nicht begonnen' };
  }
}

export const KASTEN_LEGEND: PlayerStatusInfo['legend'] = [
  { key: 'due', label: 'rote Zahl: fällige Karten' },
  { key: '✓', label: 'heute erledigt', tone: 'green' },
  { key: '★', label: 'alles in Fach 5', tone: 'yellow' },
];

/** Name tile status of a person for a stack (null without a stack); results are cached per name. */
export function useKastenTiles(stackId: string | null | undefined): ((player: Player) => PlayerStatus) | null {
  const stack = useStack(stackId);
  const progress = useData((s) => s.progress);
  return useMemo(() => {
    if (!stack) return null;
    const now = Date.now();
    const cache = new Map<string, PlayerStatus>();
    return (player: Player) => {
      let tile = cache.get(player.name);
      if (!tile) {
        const entry = progress[progressId(stack.id, player.name)];
        tile = kastenTile(kastenStatus(stack, entry && !entry.deleted ? entry : undefined, now));
        cache.set(player.name, tile);
      }
      return tile;
    };
  }, [stack, progress]);
}
