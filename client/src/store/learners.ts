import { useMemo } from 'react';
import type { LearnStack, Player } from '../../../shared/types.ts';
import { kastenStatus, learnStreak } from '../lib/learn.ts';
import { collectLearners, defaultLearner, learnerColor, learnerId, sameName } from '../lib/learners.ts';
import { useAuth } from './auth.ts';
import { useData } from './data.ts';
import { useSettings } from './settings.ts';

/** Everyone who can learn this stack (see collectLearners). */
export function useLearners(stackId?: string | null): Player[] {
  const progress = useData((s) => s.progress);
  const groups = useData((s) => s.groups);
  const self = useAuth((s) => s.user?.name);
  const extra = useSettings((s) => s.learnerNames);
  const learnGroupId = useSettings((s) => s.lastGroupByGame.spickzettel);
  return useMemo(
    () =>
      collectLearners({
        stackId,
        progress: Object.values(progress),
        groups: Object.values(groups),
        learnGroupId,
        self,
        extra,
      }),
    [stackId, progress, groups, learnGroupId, self, extra],
  );
}

/** The preselected learner for a stack (see defaultLearner). */
export function useDefaultLearner(stackId: string | null | undefined, learners: Player[]): string | null {
  const lastByStack = useSettings((s) => s.lastLearnerByStack);
  const last = useSettings((s) => s.lastLearner);
  return defaultLearner(learners, stackId, lastByStack, last);
}

export interface DueEntry {
  stack: LearnStack;
  learner: Player;
  due: number;
}

/** Who has cards due again, per stack – most first. New cards do not count, only repeating. */
export function useDueList(): DueEntry[] {
  const stacks = useData((s) => s.stacks);
  const progress = useData((s) => s.progress);
  const learners = useLearners();
  return useMemo(() => {
    const now = Date.now();
    const list: DueEntry[] = [];
    for (const entry of Object.values(progress)) {
      const stack = stacks[entry.stackId];
      if (entry.deleted || !stack || stack.deleted) continue;
      const { due } = kastenStatus(stack, entry, now);
      if (due === 0) continue;
      const learner = learners.find((p) => sameName(p.name, entry.player)) ?? {
        id: learnerId(entry.player),
        name: entry.player,
        color: learnerColor(entry.player),
      };
      list.push({ stack, learner, due });
    }
    return list.sort((a, b) => b.due - a.due);
  }, [stacks, progress, learners]);
}

/** Days in a row this person learned (any stack), see learnStreak. */
export function useStreak(name: string | null | undefined): { days: number; today: boolean } {
  const progress = useData((s) => s.progress);
  return useMemo(() => (name ? learnStreak(Object.values(progress), name) : { days: 0, today: false }), [progress, name]);
}

/** Streaks of everyone at once (normalised name → days), for lists of people. */
export function useStreaks(): (name: string) => number {
  const progress = useData((s) => s.progress);
  return useMemo(() => {
    const list = Object.values(progress);
    const cache = new Map<string, number>();
    return (name: string) => {
      if (!cache.has(name)) cache.set(name, learnStreak(list, name).days);
      return cache.get(name)!;
    };
  }, [progress]);
}
