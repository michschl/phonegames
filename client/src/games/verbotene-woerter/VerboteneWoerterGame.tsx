import type { GameProps } from '../types.ts';
import { drawFresh } from '../shared/deck.ts';
import { TeamTurnGame } from '../shared/TeamTurnGame.tsx';
import type { TurnSettings } from '../shared/turnSettings.tsx';
import { CARDS, type ForbiddenCard } from './cards.ts';
import './verbotene-woerter.css';

export default function VerboteneWoerterGame({ players, settings, onExit }: GameProps<TurnSettings>) {
  return (
    <TeamTurnGame<ForbiddenCard>
      players={players}
      onExit={onExit}
      accent="#ff4d6d"
      verb="erklärt"
      turnSeconds={settings.seconds}
      targetScore={settings.target}
      draw={(used) => drawFresh('verbotene-woerter', CARDS, (c) => c.id, { exclude: used })}
      cardLabel={(c) => c.word}
      foulLabel="Verbotenes Wort! (−1)"
      renderCard={(c) => (
        <div className="vw-card">
          <span className="vw-card__category">{c.category}</span>
          <span className="vw-card__word">{c.word}</span>
          <ul className="vw-card__forbidden" aria-label="Verbotene Wörter">
            {c.forbidden.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      rulesHint={
        <>
          Erkläre den Begriff, ohne ihn und die <strong>fünf roten Wörter</strong> zu sagen. Das andere Team passt auf und
          drückt bei einem Fehler «Verbotenes Wort».
        </>
      }
    />
  );
}
