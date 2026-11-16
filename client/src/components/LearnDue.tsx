import { useMemo } from 'react';
import { Link } from 'react-router';
import type { LearnStack } from '../../../shared/types.ts';
import { kastenStatus, subjectEmoji } from '../lib/learn.ts';
import { useData } from '../store/data.ts';
import { Icon } from './Icon.tsx';

interface DueEntry {
  stack: LearnStack;
  player: string;
  due: number;
}

/** Cards that people have started learning and that are due again – the heart of repeating. */
function useDueReminders(): DueEntry[] {
  const stacks = useData((s) => s.stacks);
  const progress = useData((s) => s.progress);
  return useMemo(() => {
    const now = Date.now();
    const list: DueEntry[] = [];
    for (const entry of Object.values(progress)) {
      const stack = stacks[entry.stackId];
      if (entry.deleted || !stack || stack.deleted) continue;
      // New cards are not counted – only cards someone already learned and should repeat now.
      const { due } = kastenStatus(stack, entry, now);
      if (due > 0) list.push({ stack, player: entry.player, due });
    }
    return list.sort((a, b) => b.due - a.due);
  }, [stacks, progress]);
}

/** «Heute fällig» on the start page. */
export function LearnDue() {
  const due = useDueReminders();
  const first = due[0];
  if (!first) return null;
  const more = due.length - 1;
  return (
    <Link to={`/spiel/spickzettel?stapel=${first.stack.id}&modus=kasten`} className="install-banner learn-due" viewTransition>
      <span className="install-banner__icon learn-due__icon" aria-hidden="true">
        {subjectEmoji(first.stack.subject)}
      </span>
      <span>
        <strong>Heute fällig: {first.due} {first.due === 1 ? 'Karte' : 'Karten'}</strong>
        <small>
          {first.player} · «{first.stack.title}»{more > 0 && ` · und ${more} weitere${more === 1 ? 'r' : ''} Kartenkasten`}
        </small>
      </span>
      <Icon name="next" />
    </Link>
  );
}
