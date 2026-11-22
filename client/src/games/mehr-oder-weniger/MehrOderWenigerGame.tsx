import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
import { useReportScores } from '../shared/results.ts';

/** Short suspense between locking in an answer and uncovering the numbers. */
const REVEAL_MS = 900;

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
  const [revealed, setRevealed] = useState(false);
  const revealTimer = useRef<number | undefined>(undefined);
  const bestStreak = useRef(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);

  const totalTurns = settings.rounds * players.length;
  const player = players[turn % players.length]!;
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  useReportScores(scores);
  const correct = revealed && choice === duel.winner;

  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  const choose = (side: 'left' | 'right') => {
    if (choice) return;
    setChoice(side);
    sound.tap();
    sound.tension(REVEAL_MS / 1000);
    haptic(10);
    revealTimer.current = window.setTimeout(() => reveal(side), REVEAL_MS);
  };

  const reveal = (side: 'left' | 'right') => {
    setRevealed(true);
    const right = side === duel.winner;
    if (right) {
      haptic(25);
      const streak = (streaks[player.id] ?? 0) + 1;
      setStreaks((s) => ({ ...s, [player.id]: streak }));
      setScores((s) => ({ ...s, [player.id]: (s[player.id] ?? 0) + 1 }));
      if (streak >= 3 && streak > bestStreak.current) {
        // New longest streak of the evening.
        sound.fanfare();
      } else {
        sound.correct();
        if (streak >= 3) sound.sparkle();
      }
      bestStreak.current = Math.max(bestStreak.current, streak);
      if (streak >= 3) confetti({ count: 80 });
    } else {
      // Losing a hot streak hurts more than a single miss.
      if ((streaks[player.id] ?? 0) >= 3) sound.fail();
      else sound.wrong();
      haptic([30, 40, 30]);
      setStreaks((s) => ({ ...s, [player.id]: 0 }));
    }
  };

  const next = () => {
    if (turn + 1 >= totalTurns) {
      setFinished(true);
      sound.fanfare();
      confetti({ count: 200 });
      return;
    }
    sound.whoosh();
    setTurn((t) => t + 1);
    setDuel(nextDuel());
    setChoice(null);
    setRevealed(false);
  };

  const card = (side: 'left' | 'right') => {
    const item = duel[side];
    const state = !revealed ? '' : side === duel.winner ? 'is-winner' : 'is-loser';
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
        {revealed && <span className="mow-card__value">{formatValue(item.value, duel.set.unit)}</span>}
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
        {revealed && (
          <p className={`mow-verdict ${correct ? 'is-correct' : 'is-wrong'}`}>{correct ? 'Richtig! +1' : 'Leider falsch'}</p>
        )}
        <Actions>
          {revealed ? (
            <Button size="lg" block onClick={next}>
              {turn + 1 >= totalTurns ? 'Zur Rangliste' : `Weiter zu ${players[(turn + 1) % players.length]!.name}`}
            </Button>
          ) : (
            <p className="gs-text">{choice ? 'Mal sehen …' : 'Tippe auf deine Antwort.'}</p>
          )}
        </Actions>
      </Stage>
    </GameShell>
  );
}
