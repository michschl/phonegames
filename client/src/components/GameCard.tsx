import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import type { GameDefinition } from '../games/types.ts';
import { Icon } from './Icon.tsx';
import { breakableName } from '../lib/util.ts';

export function GameArt({ game, size }: { game: GameDefinition; size: number }) {
  if (game.Art) return <game.Art size={size} />;
  return (
    <span className="game-art__emoji" style={{ fontSize: size * 0.62 }} aria-hidden="true">
      {game.emoji}
    </span>
  );
}

export const gameColors = (game: GameDefinition) => ({ '--g1': game.colors[0], '--g2': game.colors[1] }) as CSSProperties;

function players(game: GameDefinition) {
  return game.noGroup ? 'alle' : `${game.minPlayers}–${game.maxPlayers}`;
}

/** Compact tile for "Meine Spiele" (two per row). */
export function GameTile({ game, index = 0 }: { game: GameDefinition; index?: number }) {
  return (
    <Link
      to={`/spiel/${game.id}`}
      className="game-tile"
      style={{ ...gameColors(game), animationDelay: `${index * 60}ms` }}
      viewTransition
    >
      <div className="game-tile__art">
        <GameArt game={game} size={84} />
      </div>
      <div className="game-tile__body">
        <h3 className="game-tile__title">{breakableName(game.name)}</h3>
        <p className="game-tile__meta">
          <Icon name="users" size={14} strokeWidth={2.6} /> {players(game)}
        </p>
      </div>
    </Link>
  );
}

/** Big colourful card: "Weiterspielen" and "Spiel des Tages". */
export function GameHero({
  game,
  eyebrow,
  text,
  to,
}: {
  game: GameDefinition;
  eyebrow: string;
  text: ReactNode;
  to?: string;
}) {
  return (
    <Link to={to ?? `/spiel/${game.id}`} className="hero-card" style={gameColors(game)} viewTransition>
      <span className="hero-card__art">
        <GameArt game={game} size={72} />
      </span>
      <span className="hero-card__body">
        <span className="hero-card__eyebrow">{eyebrow}</span>
        <span className="hero-card__title">{breakableName(game.name)}</span>
        <span className="hero-card__text">{text}</span>
      </span>
      <span className="hero-card__play" aria-hidden="true">
        <Icon name="play" size={22} />
      </span>
    </Link>
  );
}

/** Small card for horizontal "discover more" rails. */
export function GameMini({
  game,
  onAdd,
  index = 0,
}: {
  game: GameDefinition;
  onAdd: (button: HTMLElement) => void;
  index?: number;
}) {
  return (
    <div className="mini-card" style={{ ...gameColors(game), animationDelay: `${index * 60}ms` }}>
      <Link to={`/spiel/${game.id}`} className="mini-card__link" viewTransition>
        <span className="mini-card__art">
          <GameArt game={game} size={52} />
        </span>
        <span className="mini-card__name">{breakableName(game.name)}</span>
      </Link>
      <button
        type="button"
        className="mini-card__add"
        aria-label={`${game.name} zu meinen Spielen hinzufügen`}
        onClick={(event) => onAdd(event.currentTarget)}
      >
        <Icon name="plus" size={18} strokeWidth={3} />
      </button>
    </div>
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
        <GameArt game={game} size={56} />
      </div>
      <div className="game-row__body">
        <h3 className="game-row__title">
          {breakableName(game.name)}
          {soon && <span className="badge">Demnächst</span>}
        </h3>
        <p className="game-row__tagline">{game.tagline}</p>
        <div className="game-row__tags">
          <span className="tag">
            <Icon name="users" size={13} strokeWidth={2.6} /> {players(game)}
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
    <article className={`game-row ${soon ? 'is-soon' : ''}`} style={{ ...gameColors(game), animationDelay: `${Math.min(index, 8) * 50}ms` }}>
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
          <Icon name={inLibrary ? 'check' : 'plus'} size={20} strokeWidth={3} />
        </button>
      )}
    </article>
  );
}
