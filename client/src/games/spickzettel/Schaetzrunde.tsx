import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LearnCard, LearnStack, Player } from '../../../../shared/types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import {
  cardNumber,
  estimateCards,
  formatCardNumber,
  scoreEstimates,
  type CardNumber,
  type EstimateResult,
  type EstimateVerdict,
} from '../../lib/learn.ts';
import { initials, shuffle } from '../../lib/util.ts';
import { useData } from '../../store/data.ts';
import { CountUp, EstimateForm } from '../shared/estimate.tsx';
import { Actions, GameShell, Headline, PromptCard, Stage } from '../shared/GameShell.tsx';
import { PassTurns } from '../shared/PassTurns.tsx';
import { playerScores, ScoreList } from '../shared/players.tsx';
import type { SpickzettelSettings } from './index.tsx';

type Phase = 'question' | 'guess' | 'reveal' | 'end';

const VERDICT: Record<EstimateVerdict, string> = {
  exact: '🎯 Volltreffer',
  close: 'Ganz nah',
  near: 'Nah dran',
  off: 'Daneben',
};

const ROW_GAP = 11; // percent of the line two markers need side by side
const MAX_ROWS = 3;

/** The guesses on a number line, the right answer marked – who was closest is visible at a glance. */
function NumberLine({
  answer,
  results,
  players,
  format,
}: {
  answer: CardNumber;
  results: EstimateResult[];
  players: Player[];
  format: (value: number) => string;
}) {
  const values = [answer.value, ...results.map((r) => r.guess)];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  const pos = (value: number) => ((value - (min - pad)) / (max - min + 2 * pad)) * 100;

  const lastInRow: number[] = [];
  const markers = [...results]
    .sort((a, b) => a.guess - b.guess)
    .map((result) => {
      const player = players.find((p) => p.id === result.playerId)!;
      const left = pos(result.guess);
      let row = lastInRow.findIndex((last) => left - last >= ROW_GAP);
      if (row === -1) row = lastInRow.length < MAX_ROWS ? lastInRow.length : MAX_ROWS - 1;
      lastInRow[row] = left;
      return { player, left, row, result };
    });
  const answerLeft = pos(answer.value);
  const shift = answerLeft < 15 ? '-15%' : answerLeft > 85 ? '-85%' : '-50%';
  const label = [
    `Richtig: ${format(answer.value)}`,
    ...markers.map((m) => `${m.player.name}: ${format(m.result.guess)}`),
  ].join(', ');

  return (
    <div className="number-line" style={{ '--rows': Math.max(1, lastInRow.length) } as CSSProperties} role="img" aria-label={label}>
      <span className="number-line__track" />
      <span className="number-line__answer" style={{ left: `${answerLeft}%`, '--shift': shift } as CSSProperties}>
        <span>{format(answer.value)}</span>
      </span>
      {markers.map(({ player, left, row }, i) => (
        <span
          key={player.id}
          className="number-line__marker"
          style={{ left: `${left}%`, '--row': row, '--c': player.color, animationDelay: `${i * 70}ms` } as CSSProperties}
        >
          {initials(player.name)}
        </span>
      ))}
    </div>
  );
}

/**
 * Schätzrunde: for cards with a number or year, everyone estimates secretly. The answer
 * counts up; exact 3 points, close 2, near 1, and the closest guess gets a bonus point.
 * Guesses far off send the card back to box 1 of that person's Kartenkasten.
 */
export function Schaetzrunde({
  stack,
  players,
  settings,
  onExit,
}: {
  stack: LearnStack;
  players: Player[];
  settings: SpickzettelSettings;
  onExit: () => void;
}) {
  const recordAnswer = useData((s) => s.recordAnswer);
  const draw = () => shuffle(estimateCards(stack)).slice(0, settings.estimateQuestions);
  const [deck, setDeck] = useState<LearnCard[]>(draw);
  const [index, setIndex] = useState(0);
  const solo = players.length === 1;
  const [phase, setPhase] = useState<Phase>(solo ? 'guess' : 'question');
  const [guesses, setGuesses] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState(false);
  const [missed, setMissed] = useState<{ card: LearnCard; names: string[] }[]>([]);
  const payoffTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(payoffTimer.current), []);

  const card = deck[index];
  const answer = card ? cardNumber(card.answer) : null;
  const format = (value: number) => (answer ? formatCardNumber({ ...answer, value }) : String(value));
  const results = useMemo(() => (answer ? scoreEstimates(answer, guesses) : []), [card?.id, guesses]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  if (!card || !answer) {
    return null;
  }

  const lowest = Math.min(answer.value, ...Object.values(guesses));
  const countFrom = answer.year ? Math.min(lowest, answer.value - 100) : Math.min(0, lowest);

  const applyScores = () => {
    setCounted(true);
    setScores((s) => {
      const next = { ...s };
      for (const r of results) next[r.playerId] = (next[r.playerId] ?? 0) + r.points;
      return next;
    });
    // Far off: the card goes back to box 1 of that person's Kartenkasten.
    const off = results.filter((r) => r.verdict === 'off').map((r) => players.find((p) => p.id === r.playerId)!);
    for (const player of off) recordAnswer(stack.id, player.name, card.id, false);
    if (off.length > 0) setMissed((m) => [...m, { card, names: off.map((p) => p.name) }]);
    if (results.some((r) => r.verdict === 'exact')) {
      sound.reveal();
      sound.sparkle();
      confetti({ count: 140 });
    } else {
      sound.ding();
      if (results.some((r) => r.points > 0)) payoffTimer.current = window.setTimeout(() => sound.coin(), 380);
      else payoffTimer.current = window.setTimeout(() => sound.fail(), 380);
    }
    haptic(30);
  };

  const next = () => {
    window.clearTimeout(payoffTimer.current);
    setGuesses({});
    setCounted(false);
    if (index + 1 >= deck.length) {
      setPhase('end');
      sound.fanfare();
      confetti({ count: 180 });
      return;
    }
    sound.whoosh();
    setIndex(index + 1);
    setPhase(solo ? 'guess' : 'question');
  };

  const again = () => {
    setDeck(draw());
    setIndex(0);
    setScores({});
    setMissed([]);
    setGuesses({});
    setCounted(false);
    setPhase(solo ? 'guess' : 'question');
    sound.swirl();
  };

  const form = (onSubmit: (value: number) => void) => (
    <EstimateForm prompt={card.prompt} unit={answer.year ? '' : answer.unit} eyebrow={`🎯 Schätzfrage ${index + 1}`} onSubmit={onSubmit} />
  );

  return (
    <GameShell
      label={phase === 'end' ? (solo ? 'Ergebnis' : 'Schlussrangliste') : `Frage ${index + 1} / ${deck.length}`}
      onExit={onExit}
      accent="#4d7cff"
      scoreboard={solo ? undefined : ranking}
      exitContent={!solo && index > 0 ? ranking : undefined}
      confirmExit={phase !== 'end'}
    >
      {phase === 'question' && (
        <Stage>
          <PromptCard cardKey={card.id} eyebrow={`🎯 ${stack.title}`} tone="#ffd23f">
            {card.prompt}
          </PromptCard>
          <p className="gs-text">Lest die Frage gemeinsam. Dann tippen alle nacheinander geheim ihre Schätzung ein.</p>
          <Actions>
            <Button size="lg" block onClick={() => setPhase('guess')}>
              Schätzen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'guess' &&
        (solo ? (
          <div key={card.id} className="gs__body">
            {form((value) => {
              setGuesses({ [players[0]!.id]: value });
              setPhase('reveal');
            })}
          </div>
        ) : (
          <PassTurns
            key={card.id}
            players={players}
            hint="Tippe geheim deine Schätzung ein."
            onComplete={() => setPhase('reveal')}
            render={(player, done) =>
              form((value) => {
                setGuesses((g) => ({ ...g, [player.id]: value }));
                done();
              })
            }
          />
        ))}

      {phase === 'reveal' && (
        <Stage>
          <p className="gs-eyebrow">Die richtige Antwort</p>
          <p className="gs-text">{card.prompt}</p>
          <CountUp from={countFrom} to={answer.value} format={format} onDone={applyScores} />
          {counted && <NumberLine answer={answer} results={results} players={players} format={format} />}
          {counted && (
            <ol className="guess-list">
              {results.map((r, i) => {
                const player = players.find((p) => p.id === r.playerId)!;
                return (
                  <li key={r.playerId} style={{ '--c': player.color, animationDelay: `${i * 70}ms` } as CSSProperties}>
                    <Avatar name={player.name} color={player.color} size={30} />
                    <span className="guess-list__name">
                      {player.name}
                      <small className={`guess-verdict is-${r.verdict}`}>
                        {VERDICT[r.verdict]}
                        {r.closest && ' · am nächsten'}
                      </small>
                    </span>
                    <span className="guess-list__guess">{format(r.guess)}</span>
                    <span className={`guess-list__points ${r.verdict === 'exact' ? 'is-exact' : ''}`}>+{r.points}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {counted && (
            <Actions>
              <Button size="lg" block onClick={next}>
                {index + 1 >= deck.length ? (solo ? 'Zum Ergebnis' : 'Zur Schlussrangliste') : 'Nächste Frage'}
              </Button>
            </Actions>
          )}
        </Stage>
      )}

      {phase === 'end' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {solo ? '🎯' : '🏆'}
            </span>
            {solo ? (
              <span className="result-banner__title">
                {total} von {deck.length * 3} Punkten
              </span>
            ) : (
              <Headline small>Das beste Schätzauge</Headline>
            )}
          </div>
          {!solo && ranking}
          {missed.length > 0 && (
            <>
              <p className="gs-text">Weit daneben – diese Karten sind jetzt im Kartenkasten fällig:</p>
              <ul className="turn-list">
                {missed.map(({ card: m, names }) => (
                  <li key={m.id} className="is-skipped">
                    <span>↺</span>
                    <span>
                      {m.prompt} – <strong>{m.answer}</strong>
                      {!solo && ` (${names.join(', ')})`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Actions>
            <Button size="lg" block icon="refresh" onClick={again}>
              Nochmal
            </Button>
            <Button variant="ghost" block onClick={onExit}>
              Beenden
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
