import { Link } from 'react-router';
import { soloLearnPath } from '../games/spickzettel/modes.ts';
import { useDueList } from '../store/learners.ts';
import { Icon } from './Icon.tsx';
import { Avatar } from './ui.tsx';

/** Rows shown on the start page – the rest is one tap away. */
const SHOWN = 3;

/** «Heute fällig» on the start page: one row per person and stack, one tap starts the first card. */
export function LearnDue({ moreTo = '/spiel/spickzettel' }: { moreTo?: string }) {
  const due = useDueList();
  if (due.length === 0) return null;
  const more = due.length - SHOWN;
  return (
    <section className="learn-due" aria-labelledby="learn-due-title">
      <h2 className="learn-due__title" id="learn-due-title">
        <span aria-hidden="true">📚</span> Heute fällig
      </h2>
      <ul className="learn-due__list">
        {due.slice(0, SHOWN).map(({ stack, learner, due: count }) => (
          <li key={`${stack.id}-${learner.id}`}>
            <Link to={soloLearnPath(stack.id, 'kasten', learner.name)} className="learn-due__row" viewTransition>
              <Avatar name={learner.name} color={learner.color} size={36} />
              <span className="learn-due__text">
                <strong>{learner.name}</strong>
                <small>
                  {count} {count === 1 ? 'Karte' : 'Karten'} · «{stack.title}»
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
      {more > 0 && (
        <Link to={moreTo} className="learn-due__more" viewTransition>
          und {more} {more === 1 ? 'weiterer Kartenkasten' : 'weitere Kartenkästen'}
        </Link>
      )}
    </section>
  );
}
