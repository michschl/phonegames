import type { LearnCard } from '../../../../shared/types.ts';
import { Button, EmptyState } from '../../components/ui.tsx';
import { orientCard } from '../../lib/learn.ts';
import { useStack } from '../../store/data.ts';
import { useLearnDirection } from '../../store/learners.ts';
import { drawFresh } from '../shared/deck.ts';
import { GameShell, Stage } from '../shared/GameShell.tsx';
import { TeamTurnGame } from '../shared/TeamTurnGame.tsx';
import type { GameProps } from '../types.ts';
import type { SpickzettelSettings } from './index.tsx';
import { Duell } from './Duell.tsx';
import { Kartenkasten } from './Kartenkasten.tsx';
import { Lueckentext } from './Lueckentext.tsx';
import { Schaetzrunde } from './Schaetzrunde.tsx';
import { CardPrompt, cardLine } from './cloze.tsx';
import './spickzettel.css';

export default function SpickzettelGame({ players, settings, onExit }: GameProps<SpickzettelSettings>) {
  const stack = useStack(settings.stackId);
  const direction = useLearnDirection(settings.stackId);

  if (!stack || stack.cards.length === 0) {
    return (
      <GameShell onExit={onExit} confirmExit={false}>
        <Stage>
          <EmptyState emoji="🗂️" title="Stapel nicht gefunden" text="Vielleicht wurde er gelöscht. Wähle einen anderen Stapel." />
          <Button size="lg" block onClick={onExit}>
            Zurück
          </Button>
        </Stage>
      </GameShell>
    );
  }

  if (settings.mode === 'kasten') {
    return <Kartenkasten stack={stack} players={players} settings={settings} onExit={onExit} />;
  }
  if (settings.mode === 'duell') {
    return <Duell stack={stack} players={players} settings={settings} onExit={onExit} />;
  }
  if (settings.mode === 'schaetzen') {
    return <Schaetzrunde stack={stack} players={players} settings={settings} onExit={onExit} />;
  }
  if (settings.mode === 'luecke') {
    return <Lueckentext stack={stack} players={players} settings={settings} onExit={onExit} />;
  }

  return (
    <TeamTurnGame<LearnCard>
      players={players}
      onExit={onExit}
      accent="#4d7cff"
      verb="fragt ab"
      turnSeconds={settings.seconds}
      targetScore={settings.target}
      draw={(used) => orientCard(drawFresh(`spickzettel-${stack.id}`, stack.cards, (c) => c.id, { exclude: used }), stack, direction)}
      cardLabel={cardLine}
      correctLabel="Gewusst"
      skipLabel="Nicht gewusst"
      renderCard={(c) => (
        <div className="learn-card is-revealed learn-card--quiz">
          <span className="learn-card__kind">Vorlesen</span>
          <p className="learn-card__prompt">
            <CardPrompt card={c} />
          </p>
          <div className="learn-card__answer">
            <span>Antwort – nicht verraten!</span>
            <p>{c.answer}</p>
            {c.accepted.length > 0 && <small>auch richtig: {c.accepted.join(' · ')}</small>}
          </div>
        </div>
      )}
      rulesHint={
        <>
          Lies die Frage laut vor – die Antwort siehst nur du. Dein Team antwortet. Richtig: <strong>Gewusst</strong> (+1).
          Niemand weiss es: <strong>Nicht gewusst</strong>, nächste Karte.
        </>
      }
    />
  );
}
