import { Link } from 'react-router';
import { soloLearnPath } from '../games/spickzettel/modes.ts';
import { useStreaks, type DueEntry } from '../store/learners.ts';
import { Icon } from './Icon.tsx';
import { Streak } from './LearnerPicker.tsx';
import { Avatar } from './ui.tsx';

/** One row per person and stack with cards due – one tap starts the first card. */
export function DueRows({ entries }: { entries: DueEntry[] }) {
  const streak = useStreaks();
  return (
    <ul className="learn-due__list">
      {entries.map(({ stack, learner, due }) => (
        <li key={`${stack.id}-${learner.id}`}>
          <Link to={soloLearnPath(stack.id, 'kasten', learner.name)} className="learn-due__row" viewTransition>
            <Avatar name={learner.name} color={learner.color} size={36} />
            <span className="learn-due__text">
              <strong>
                {learner.name}
                <Streak days={streak(learner.name)} />
              </strong>
              <small>
                {due} {due === 1 ? 'Karte' : 'Karten'} · «{stack.title}»
              </small>
            </span>
            <span className="learn-due__go" aria-hidden="true">
              <Icon name="play" size={18} />
            </span>
            <span className="sr-only">lernen</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
