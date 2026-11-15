import { useRef, useState, type CSSProperties } from 'react';
import type { GameProps } from '../types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { playerScores, ScoreList } from '../shared/players.tsx';
import { formatValue } from '../schaetzmeister/logic.ts';
import { FACT_SETS } from './facts.ts';
import { duelKey, pickDuel, type Duel, type MehrSettings } from './logic.ts';
import './mehr-oder-weniger.css';

export default function MehrOderWenigerGame({ players, settings, onExit }: GameProps<MehrSettings>) {
  const seen = useRef(new Set<string>());
  const nextDuel = () => {
    const duel = pickDuel(FACT_SETS, Math.random, seen.current);
    seen.current.add(duelKey(duel.set.id, duel.left.name, duel.right.name));
    return duel;
  };

  const [turn, setTurn] = useState(0);
  const [duel, setDuel] = useState<Duel>(nextDuel);
  const [choice, setChoice] = useState<'left' | 'right' | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);

  const totalTurns = settings.rounds * players.length;
  const player = players[turn % players.length]!;
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  const correct = choice !== null && choice === duel.winner;

  const choose = (side: 'left' | 'right') => {
    if (choice) return;
    setChoice(side);
    const right = side === duel.winner;
    if (right) {
      sound.correct();
      haptic(25);
      const streak = (streaks[player.id] ?? 0) + 1;
      setStreaks((s) => ({ ...s, [player.id]: streak }));
      setScores((s) => ({ ...s, [player.id]: (s[player.id] ?? 0) + 1 }));
      if (streak >= 3) confetti({ count: 80 });
    } else {
      sound.wrong();
      haptic([30, 40, 30]);
      setStreaks((s) => ({ ...s, [player.id]: 0 }));
    }
  };

  const next = () => {
    if (turn + 1 >= totalTurns) {
      setFinished(true);
      sound.reveal();
      confetti({ count: 200 });
      return;
    }
    setTurn((t) => t + 1);
    setDuel(nextDuel());
    setChoice(null);
  };

  const card = (side: 'left' | 'right') => {
    const item = duel[side];
    const state = choice === null ? '' : side === duel.winner ? 'is-winner' : 'is-loser';
    return (
      <button
        type="button"
        className={`mow-card ${state} ${choice === side ? 'is-chosen' : ''}`}
        onClick={() => choose(side)}
        disabled={choice !== null}
      >
        <span className="mow-card__emoji" aria-hidden="true">
          {item.emoji ?? '❓'}
        </span>
        <span className="mow-card__name">{item.name}</span>
        {choice !== null && <span className="mow-card__value">{formatValue(item.value, duel.set.unit)}</span>}
      </button>
    );
  };

  if (finished) {
    return (
      <GameShell label="Schlussrangliste" onExit={onExit} accent="#2de2e6" confirmExit={false}>
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              🏆
            </span>
            <Headline small>Gut geschätzt!</Headline>
          </div>
          {ranking}
          <Actions>
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      </GameShell>
    );
  }

  return (
    <GameShell
      label={`Runde ${Math.floor(turn / players.length) + 1} / ${settings.rounds}`}
      onExit={onExit}
      accent="#2de2e6"
      scoreboard={ranking}
      exitContent={turn > 0 ? ranking : undefined}
    >
      <Stage>
        <div className="mow-player" style={{ '--c': player.color } as CSSProperties}>
          <Avatar name={player.name} color={player.color} size={36} />
          <span>
            <strong>{player.name}</strong> ist dran
            {(streaks[player.id] ?? 0) >= 2 && ` · 🔥 ${streaks[player.id]}`}
          </span>
        </div>
        <Headline small>{duel.set.question.replace(/\s*\(.*\)$/, '')}</Headline>
        <div className="mow-duel" key={turn}>
          {card('left')}
          <span className="mow-vs">VS</span>
          {card('right')}
        </div>
        {choice && (
          <p className={`mow-verdict ${correct ? 'is-correct' : 'is-wrong'}`}>{correct ? 'Richtig! +1' : 'Leider falsch'}</p>
        )}
        <Actions>
          {choice ? (
            <Button size="lg" block onClick={next}>
              {turn + 1 >= totalTurns ? 'Zur Rangliste' : `Weiter zu ${players[(turn + 1) % players.length]!.name}`}
            </Button>
          ) : (
            <p className="gs-text">Tippe auf deine Antwort.</p>
          )}
        </Actions>
      </Stage>
    </GameShell>
  );
}
