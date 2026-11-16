import { Link } from 'react-router';
import { soloLearnPath } from '../games/spickzettel/modes.ts';
import { useDueList, type DueEntry } from '../store/learners.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './ui.tsx';

/** Rows shown on the start page – the rest is one tap away. */
const SHOWN = 3;

/** One row per person and stack with cards due – one tap starts the first card. */
export function DueRows({ entries }: { entries: DueEntry[] }) {
  return (
    <ul className="learn-due__list">
      {entries.map(({ stack, learner, due }) => (
        <li key={`${stack.id}-${learner.id}`}>
          <Link to={soloLearnPath(stack.id, 'kasten', learner.name)} className="learn-due__row" viewTransition>
            <Avatar name={learner.name} color={learner.color} size={36} />
            <span className="learn-due__text">
              <strong>{learner.name}</strong>
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

/** «Heute fällig» on the start page. */
export function LearnDue() {
  const due = useDueList();
  if (due.length === 0) return null;
  const more = due.length - SHOWN;
  return (
    <section className="learn-due" aria-labelledby="learn-due-title">
      <h2 className="learn-due__title" id="learn-due-title">
        <span aria-hidden="true">📚</span> Heute fällig
      </h2>
      <DueRows entries={due.slice(0, SHOWN)} />
      {more > 0 && (
        <Link to="/lernen" className="learn-due__more" viewTransition>
          und {more} {more === 1 ? 'weiterer Kartenkasten' : 'weitere Kartenkästen'}
        </Link>
      )}
    </section>
  );
}
