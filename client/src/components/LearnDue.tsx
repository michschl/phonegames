import { Link } from 'react-router';
import type { LearnTopic } from '../../../shared/types.ts';
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

/** Tests of the next seven days – one tap opens the topic with its goals and documents. */
export function ExamRows({ exams }: { exams: { topic: LearnTopic; days: number }[] }) {
  return (
    <ul className="learn-due__list">
      {exams.map(({ topic, days }) => (
        <li key={topic.id}>
          <Link to={`/aufgaben/${topic.id}`} className="learn-due__row learn-due__row--exam" viewTransition>
            <span className="learn-due__exam" aria-hidden="true">
              📝
            </span>
            <span className="learn-due__text">
              <strong>{days === 0 ? 'Prüfung heute' : days === 1 ? 'Prüfung morgen' : `Prüfung in ${days} Tagen`}</strong>
              <small>
                «{topic.title}»{topic.subject ? ` · ${topic.subject}` : ''}
              </small>
            </span>
            <span className="learn-due__go" aria-hidden="true">
              <Icon name="next" size={18} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
