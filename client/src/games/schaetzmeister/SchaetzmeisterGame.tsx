import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GameProps } from '../types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, PromptCard, Stage } from '../shared/GameShell.tsx';
import { CountUp, EstimateForm } from '../shared/estimate.tsx';
import { PassTurns } from '../shared/PassTurns.tsx';
import { playerScores, ScoreList } from '../shared/players.tsx';
import { CATEGORY_OPTIONS, formatValue, scoreGuesses, type SchaetzSettings } from './logic.ts';
import { QUESTIONS, type EstimateQuestion } from './questions.ts';
import { useReportScores } from '../shared/results.ts';

type Phase = 'question' | 'guess' | 'reveal' | 'end';

export default function SchaetzmeisterGame({ players, settings, onExit }: GameProps<SchaetzSettings>) {
  const pool = useMemo(() => {
    const filtered = QUESTIONS.filter((q) => settings.categories.includes(q.category));
    return filtered.length > 0 ? filtered : QUESTIONS;
  }, [settings.categories]);
  const used = useRef(new Set<string>());
  const draw = () => {
    const q = drawFresh('schaetzmeister', pool, (x) => x.id, { exclude: used.current });
    used.current.add(q.id);
    return q;
  };

  const [round, setRound] = useState(1);
  const [question, setQuestion] = useState<EstimateQuestion>(draw);
  const [phase, setPhase] = useState<Phase>('question');
  const [guesses, setGuesses] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState(false);
  const payoffTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(payoffTimer.current), []);
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  useReportScores(scores);

  const results = useMemo(() => scoreGuesses(question.answer, guesses), [question, guesses]);
  const category = CATEGORY_OPTIONS.find((c) => c.id === question.category);
  const lowest = Math.min(question.answer, ...Object.values(guesses));
  const countFrom = question.unit === 'Jahr' ? Math.min(lowest, question.answer - 200) : Math.min(0, lowest);

  const applyScores = () => {
    setCounted(true);
    setScores((s) => {
      const next = { ...s };
      for (const r of results) next[r.playerId] = (next[r.playerId] ?? 0) + r.points;
      return next;
    });
    if (results.some((r) => r.exact)) {
      sound.reveal();
      sound.sparkle();
      confetti({ count: 160 });
    } else {
      // The number has landed – then the closest guess cashes in.
      sound.ding();
      if (results.some((r) => r.points > 0)) payoffTimer.current = window.setTimeout(() => sound.coin(), 380);
    }
    haptic(30);
  };

  const next = () => {
    window.clearTimeout(payoffTimer.current);
    if (round >= settings.rounds) {
      setPhase('end');
      sound.fanfare();
      confetti({ count: 200 });
      return;
    }
    sound.whoosh();
    setRound((r) => r + 1);
    setQuestion(draw());
    setGuesses({});
    setCounted(false);
    setPhase('question');
  };

  const nameOf = (id: string) => players.find((p) => p.id === id);

  return (
    <GameShell
      label={phase === 'end' ? 'Schlussrangliste' : `Frage ${round} / ${settings.rounds}`}
      onExit={onExit}
      accent="#ffd23f"
      scoreboard={ranking}
      exitContent={round > 1 ? ranking : undefined}
    >
      {phase === 'question' && (
        <Stage>
          <PromptCard cardKey={question.id} eyebrow={`${category?.emoji ?? '🎯'} ${category?.label ?? ''}`} tone="#ffd23f">
            {question.text}
          </PromptCard>
          <p className="gs-text">Lest die Frage gemeinsam. Dann tippen alle nacheinander geheim ihre Schätzung ein.</p>
          <Actions>
            <Button size="lg" block onClick={() => setPhase('guess')}>
              Schätzen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'guess' && (
        <PassTurns
          key={question.id}
          players={players}
          hint="Tippe geheim deine Schätzung ein."
          onComplete={() => setPhase('reveal')}
          render={(player, done) => (
            <EstimateForm
              prompt={question.text}
              unit={question.unit === 'Jahr' ? '' : question.unit}
              onSubmit={(value) => {
                setGuesses((g) => ({ ...g, [player.id]: value }));
                done();
              }}
            />
          )}
        />
      )}

      {phase === 'reveal' && (
        <Stage>
          <p className="gs-eyebrow">Die richtige Antwort</p>
          <p className="gs-text">{question.text}</p>
          <CountUp from={countFrom} to={question.answer} format={(n) => formatValue(n, question.unit)} onDone={applyScores} />
          {counted && question.note && <p className="gs-text">{question.note}</p>}
          {counted && (
            <ol className="guess-list">
              {results.map((r, i) => {
                const player = nameOf(r.playerId)!;
                return (
                  <li key={r.playerId} style={{ '--c': player.color, animationDelay: `${i * 70}ms` } as CSSProperties}>
                    <Avatar name={player.name} color={player.color} size={30} />
                    <span className="guess-list__name">{player.name}</span>
                    <span className="guess-list__guess">{formatValue(r.guess, question.unit)}</span>
                    <span className={`guess-list__points ${r.exact ? 'is-exact' : ''}`}>
                      {r.exact ? '🎯 ' : ''}+{r.points}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {counted && (
            <Actions>
              <Button size="lg" block onClick={next}>
                {round >= settings.rounds ? 'Zur Schlussrangliste' : 'Nächste Frage'}
              </Button>
            </Actions>
          )}
        </Stage>
      )}

      {phase === 'end' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              🏆
            </span>
            <Headline small>Das beste Schätzauge des Abends</Headline>
          </div>
          {ranking}
          <Actions>
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
