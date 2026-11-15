import type { Player } from '../../../../shared/types.ts';
import { shuffle } from '../../lib/util.ts';

export type Role = 'werwolf' | 'seherin' | 'beschuetzer' | 'dorf';

export const ROLES: Record<Role, { name: string; emoji: string; text: string; team: 'wolf' | 'dorf' }> = {
  werwolf: {
    name: 'Werwolf',
    emoji: '🐺',
    text: 'Nachts wählt ihr Werwölfe gemeinsam ein Opfer. Tagsüber: ganz unschuldig tun!',
    team: 'wolf',
  },
  seherin: {
    name: 'Seherin',
    emoji: '🔮',
    text: 'Jede Nacht darfst du heimlich nachsehen, ob eine Person ein Werwolf ist.',
    team: 'dorf',
  },
  beschuetzer: {
    name: 'Beschützer',
    emoji: '🛡️',
    text: 'Jede Nacht schützt du eine Person vor den Werwölfen – aber nicht zweimal hintereinander dieselbe.',
    team: 'dorf',
  },
  dorf: {
    name: 'Dorfbewohner',
    emoji: '🧑‍🌾',
    text: 'Finde zusammen mit den anderen die Werwölfe und verbanne sie aus dem Dorf.',
    team: 'dorf',
  },
};

export interface DorfSettings {
  seherin: boolean;
  beschuetzer: boolean;
  discussionMinutes: number;
  voice: boolean;
}

export const DEFAULT_SETTINGS: DorfSettings = { seherin: true, beschuetzer: true, discussionMinutes: 3, voice: true };

export function wolfCount(players: number): number {
  if (players >= 12) return 3;
  if (players >= 8) return 2;
  return 1;
}

export function assignRoles(players: Player[], settings: DorfSettings): Record<string, Role> {
  const order = shuffle(players);
  const roles: Record<string, Role> = {};
  let i = 0;
  for (let w = 0; w < wolfCount(players.length); w++) roles[order[i++]!.id] = 'werwolf';
  if (settings.seherin && order[i]) roles[order[i++]!.id] = 'seherin';
  if (settings.beschuetzer && players.length >= 6 && order[i]) roles[order[i++]!.id] = 'beschuetzer';
  for (; i < order.length; i++) roles[order[i]!.id] = 'dorf';
  return roles;
}

/** Werewolves win once they are at least as many as everyone else. */
export function winner(roles: Record<string, Role>, alive: string[]): 'wolf' | 'dorf' | null {
  const wolves = alive.filter((id) => roles[id] === 'werwolf').length;
  if (wolves === 0) return 'dorf';
  if (wolves >= alive.length - wolves) return 'wolf';
  return null;
}

/** Who dies at dawn: the victim, unless protected. */
export function resolveNight(victim: string | null, protectedId: string | null): string | null {
  if (!victim || victim === protectedId) return null;
  return victim;
}
