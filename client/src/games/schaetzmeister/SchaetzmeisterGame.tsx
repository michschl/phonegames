import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { GameProps } from '../types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, PromptCard, Stage } from '../shared/GameShell.tsx';
import { PassTurns } from '../shared/PassTurns.tsx';
import { playerScores, ScoreList } from '../shared/players.tsx';
import { CATEGORY_OPTIONS, formatValue, parseEstimate, scoreGuesses, type SchaetzSettings } from './logic.ts';
import { QUESTIONS, type EstimateQuestion } from './questions.ts';
import './schaetzmeister.css';

type Phase = 'question' | 'guess' | 'reveal' | 'end';

function EstimateForm({ question, onSubmit }: { question: EstimateQuestion; onSubmit: (value: number) => void }) {
  const [text, setText] = useState('');
  const value = parseEstimate(text);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value === null) return;
    sound.pop();
    onSubmit(value);
  };
  return (
    <Stage>
      <PromptCard eyebrow="Geheim schätzen" tone="#ffd23f">
        {question.text}
      </PromptCard>
      <form className="estimate-form" onSubmit={submit}>
        <div className="estimate-form__field">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Deine Schätzung"
            aria-label="Deine Schätzung"
            autoFocus
            enterKeyHint="done"
          />
          {question.unit && question.unit !== 'Jahr' && <span>{question.unit}</span>}
        </div>
        <Button type="submit" size="lg" block disabled={value === null}>
          Schätzung abgeben
        </Button>
      </form>
    </Stage>
  );
}

/** Animated count-up to the correct answer. */
function CountUp({ from, to, unit, onDone }: { from: number; to: number; unit: string; onDone: () => void }) {
  const [value, setValue] = useState(from);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const start = performance.now();
    const duration = 1800;
    let raf = 0;
    let lastTick = 0;
    let step = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (to - from) * eased);
      // Ticks climb in pitch and slow down together with the number.
      if (now - lastTick > 55 + 160 * t && t < 1) {
        lastTick = now;
        sound.countTick(step++);
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  const decimals = Number.isInteger(to) ? 0 : 1;
  const shown = Number(value.toFixed(decimals));
  return <span className="countup">{formatValue(shown, unit)}</span>;
}

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
              question={question}
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
          <CountUp from={countFrom} to={question.answer} unit={question.unit} onDone={applyScores} />
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
