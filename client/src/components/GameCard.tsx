import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { GameDefinition } from '../games/types.ts';
import { Icon } from './Icon.tsx';

function GameArt({ game, size }: { game: GameDefinition; size: number }) {
  if (game.Art) return <game.Art size={size} />;
  return (
    <span className="game-art__emoji" style={{ fontSize: size * 0.62 }} aria-hidden="true">
      {game.emoji}
    </span>
  );
}

const gradient = (game: GameDefinition) =>
  ({ '--g1': game.colors[0], '--g2': game.colors[1] }) as CSSProperties;

/** Big tile for "Meine Spiele". */
export function GameTile({ game, index = 0 }: { game: GameDefinition; index?: number }) {
  return (
    <Link
      to={`/spiel/${game.id}`}
      className="game-tile"
      style={{ ...gradient(game), animationDelay: `${index * 70}ms` }}
      viewTransition
    >
      <div className="game-tile__art">
        <GameArt game={game} size={120} />
      </div>
      <div className="game-tile__body">
        <h3 className="game-tile__title">{game.name}</h3>
        <p className="game-tile__tagline">{game.tagline}</p>
        <div className="game-tile__meta">
          <span>
            <Icon name="users" size={15} /> {game.minPlayers}–{game.maxPlayers}
          </span>
          <span>
            <Icon name="clock" size={15} /> {game.duration}
          </span>
        </div>
      </div>
      <span className="game-tile__play" aria-hidden="true">
        <Icon name="play" size={20} />
      </span>
    </Link>
  );
}

/** Row card for the catalogue ("Entdecken"). */
export function GameRow({
  game,
  inLibrary,
  onToggle,
  index = 0,
}: {
  game: GameDefinition;
  inLibrary: boolean;
  onToggle: (button: HTMLElement) => void;
  index?: number;
}) {
  const soon = game.status === 'soon';
  const body = (
    <>
      <div className="game-row__art">
        <GameArt game={game} size={64} />
      </div>
      <div className="game-row__body">
        <h3 className="game-row__title">
          {game.name}
          {soon && <span className="badge">Demnächst</span>}
        </h3>
        <p className="game-row__tagline">{game.tagline}</p>
        <div className="game-row__tags">
          <span className="tag">
            <Icon name="users" size={13} /> {game.minPlayers}–{game.maxPlayers}
          </span>
          {game.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <article
      className={`game-row ${soon ? 'is-soon' : ''}`}
      style={{ ...gradient(game), animationDelay: `${index * 60}ms` }}
    >
      {soon ? (
        <div className="game-row__link">{body}</div>
      ) : (
        <Link to={`/spiel/${game.id}`} className="game-row__link" viewTransition>
          {body}
        </Link>
      )}
      {!soon && (
        <button
          type="button"
          className={`game-row__toggle ${inLibrary ? 'is-added' : ''}`}
          onClick={(event) => onToggle(event.currentTarget)}
          aria-pressed={inLibrary}
          aria-label={inLibrary ? `${game.name} aus meinen Spielen entfernen` : `${game.name} zu meinen Spielen hinzufügen`}
        >
          <Icon name={inLibrary ? 'check' : 'plus'} size={20} strokeWidth={2.6} />
        </button>
      )}
    </article>
  );
}
