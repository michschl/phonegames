import type { LearnProgress, Player, PlayerGroup } from '../../../shared/types.ts';
import { normalize, PLAYER_COLORS } from './util.ts';

/*
 * People who learn with Spickzettel. A Kartenkasten belongs to a name – the same name is the
 * same person on every device – so learning needs no player group.
 */

/** The same colour for the same name, for people who are in no group. */
export function learnerColor(name: string): string {
  let hash = 0;
  for (const char of normalize(name)) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length]!;
}

export function learnerId(name: string): string {
  return `learner-${normalize(name)}`;
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normalize(a) === normalize(b);
}

/** A Kartenkasten someone actually learns with – not deleted, not removed, with cards. */
function isLive(entry: LearnProgress): boolean {
  return isOffered(entry) && Object.keys(entry.cards).length > 0;
}

/** Who has a Kartenkasten for a stack – also an empty one: the name was added in «Wer lernt?». */
function isOffered(entry: LearnProgress): boolean {
  return !entry.deleted && !entry.removed;
}

export interface LearnerSources {
  /** The stack being learned: whoever learned it comes first, most recent first. */
  stackId?: string | null;
  progress: LearnProgress[];
  groups: PlayerGroup[];
  /** The group last used for Spickzettel – its members are offered too. */
  learnGroupId?: string;
  /** The account holder. */
  self?: string;
  /** Names added as learners on this device. */
  extra: string[];
}

/**
 * Everyone who can learn: who has a Kartenkasten for this stack (also an empty one – added in «Wer
 * lernt?»), the members of the Spickzettel group, the account holder, names older versions kept on
 * this device and who learns other stacks. Party groups are
 * not offered as a whole – the friends from the games evening do not learn French vocabulary.
 * People removed from this stack are left out – but whoever has a Kartenkasten for it is shown.
 */
export function collectLearners({ stackId, progress, groups, learnGroupId, self, extra }: LearnerSources): Player[] {
  const colors = new Map<string, string>();
  for (const group of groups) {
    if (group.deleted) continue;
    for (const player of group.players) if (!colors.has(normalize(player.name))) colors.set(normalize(player.name), player.color);
  }
  const found = new Map<string, Player>();
  // Removed from this stack (on any device) – see LearnProgress.removed.
  const left = new Set(
    stackId ? progress.filter((e) => e.stackId === stackId && e.removed && !e.deleted).map((e) => normalize(e.player)) : [],
  );
  const add = (raw: string, learnsThis = false) => {
    const name = raw.trim();
    const key = normalize(name);
    if (!key || found.has(key) || (left.has(key) && !learnsThis)) return;
    found.set(key, { id: learnerId(name), name, color: colors.get(key) ?? learnerColor(name) });
  };
  const live = progress.filter(isOffered).sort((a, b) => b.updatedAt - a.updatedAt);
  if (stackId) for (const entry of live) if (entry.stackId === stackId) add(entry.player, true);
  const learnGroup = groups.find((group) => group.id === learnGroupId && !group.deleted);
  for (const player of learnGroup?.players ?? []) add(player.name);
  if (self) add(self);
  for (const name of extra) add(name);
  for (const entry of live) add(entry.player);
  return [...found.values()];
}

/** Who is preselected: who learned this stack last on this device, else who learned last, else the first. */
export function defaultLearner(
  learners: Player[],
  stackId: string | null | undefined,
  lastByStack: Record<string, string>,
  last: string | null,
): string | null {
  const known = (name: string | null | undefined) => learners.find((p) => sameName(p.name, name))?.name;
  return (stackId ? known(lastByStack[stackId]) : undefined) ?? known(last) ?? learners[0]?.name ?? null;
}

/**
 * Who can start right away without being asked: the person who learned this stack last, or the
 * only person who learns at all. Otherwise the app asks – a parent saves, a child learns.
 */
export function obviousLearner(
  learners: Player[],
  stackId: string,
  lastByStack: Record<string, string>,
  progress: LearnProgress[],
): string | null {
  const last = learners.find((p) => sameName(p.name, lastByStack[stackId]));
  if (last) return last.name;
  if (learners.length !== 1) return null;
  const only = learners[0]!;
  return progress.some((entry) => isLive(entry) && sameName(entry.player, only.name)) ? only.name : null;
}
