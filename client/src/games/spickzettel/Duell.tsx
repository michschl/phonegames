import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { LearnCard, LearnStack, Player } from '../../../../shared/types.ts';
import { Avatar, Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { choicesFor } from '../../lib/learn.ts';
import { normalize, shuffle } from '../../lib/util.ts';
import { useData } from '../../store/data.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PlayerPicker } from '../shared/players.tsx';
import { CountdownOverlay, useStartCountdown } from '../shared/Timer.tsx';
import type { SpickzettelSettings } from './index.tsx';

type Phase = 'pick' | 'ready' | 'play' | 'done';
type Side = 0 | 1;

/** How long a wrong tap blocks that side. */
const LOCK_MS = 1500;
/** Time to see the solution before the next question. */
const REVEAL_MS = 1400;

interface Round {
  card: LearnCard;
  /** The same four answers, shuffled separately for each side. */
  options: [string[], string[]];
}

const isRight = (card: LearnCard, option: string) => [card.answer, ...card.accepted].some((a) => normalize(a) === normalize(option));

/**
 * Duell: the phone lies between two people, each has their half of the screen
 * (the top half is upside down). Same question, four answers – whoever taps the
 * right one first scores. A wrong tap blocks that side for a moment and puts the
 * card back into that person's Kartenkasten.
 */
export function Duell({
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
  const [pair, setPair] = useState<Player[]>(players.length === 2 ? players : []);
  const [phase, setPhase] = useState<Phase>(players.length === 2 ? 'ready' : 'pick');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [winner, setWinner] = useState<Side | null | 'none'>(null);
  const [wrong, setWrong] = useState<[string | null, string | null]>([null, null]);
  const [locked, setLocked] = useState<[boolean, boolean]>([false, false]);
  const [missed, setMissed] = useState<LearnCard[]>([]);
  const recordAnswer = useData((s) => s.recordAnswer);
  const timers = useRef<number[]>([]);
  const resolved = useRef(false);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const total = Math.min(settings.duelQuestions, stack.cards.length);
  const round = rounds[index];

  const prepare = () => {
    const cards = shuffle(stack.cards).slice(0, total);
    setRounds(
      cards.map((card) => {
        const options = choicesFor(card, stack);
        return { card, options: [options, shuffle(options)] };
      }),
    );
    setIndex(0);
    setScores([0, 0]);
    setMissed([]);
    resetRound();
  };

  const resetRound = () => {
    resolved.current = false;
    setWinner(null);
    setWrong([null, null]);
    setLocked([false, false]);
  };

  const start = useStartCountdown(() => {
    sound.swirl();
    setPhase('play');
  });

  const next = () => {
    if (index + 1 >= rounds.length) {
      setPhase('done');
      return;
    }
    sound.flip();
    setIndex((i) => i + 1);
    resetRound();
  };

  const tap = (side: Side, option: string) => {
    if (!round || resolved.current || locked[side] || wrong[side]) return;
    const player = pair[side]!;
    if (isRight(round.card, option)) {
      resolved.current = true;
      setWinner(side);
      setScores((s) => (side === 0 ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]));
      sound.correct();
      haptic(25);
      later(next, REVEAL_MS);
      return;
    }
    // Wrong: the card goes back to box 1 of this person's Kartenkasten.
    recordAnswer(stack.id, player.name, round.card.id, false);
    setMissed((list) => (list.some((c) => c.id === round.card.id) ? list : [...list, round.card]));
    sound.wrong();
    haptic([30, 40, 30]);
    const nextWrong: [string | null, string | null] = side === 0 ? [option, wrong[1]] : [wrong[0], option];
    setWrong(nextWrong);
    setLocked((l) => (side === 0 ? [true, l[1]] : [l[0], true]));
    if (nextWrong[0] && nextWrong[1]) {
      // Both wrong: show the solution.
      resolved.current = true;
      setWinner('none');
      later(next, REVEAL_MS + 400);
    } else {
      later(() => setLocked((l) => (side === 0 ? [false, l[1]] : [l[0], false])), LOCK_MS);
    }
  };

  useEffect(() => {
    if (phase !== 'done') return;
    if (scores[0] !== scores[1]) {
      sound.fanfare();
      confetti({ count: 180 });
    } else {
      sound.ding();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const half = (side: Side) => {
    const player = pair[side]!;
    const options = round!.options[side];
    return (
      <section
        className={`duel__side duel__side--${side === 0 ? 'top' : 'bottom'} ${locked[side] && winner === null ? 'is-locked' : ''}`}
        style={{ '--c': player.color } as CSSProperties}
        aria-label={`Seite von ${player.name}`}
      >
        <div className="duel__who">
          <Avatar name={player.name} color={player.color} size={30} />
          <strong>{player.name}</strong>
          <span className="duel__score">{scores[side]}</span>
        </div>
        <p className="duel__prompt">{round!.card.prompt}</p>
        <div className="duel__options">
          {options.map((option) => {
            const right = isRight(round!.card, option);
            const state =
              winner !== null ? (right ? 'is-right' : wrong[side] === option ? 'is-wrong' : 'is-dim') : wrong[side] === option ? 'is-wrong' : '';
            return (
              <button
                key={option}
                type="button"
                className={`duel__option ${state}`}
                disabled={winner !== null || locked[side]}
                // Pointer down, not click: two people may tap at the same moment.
                onPointerDown={(e: ReactPointerEvent) => {
                  e.preventDefault();
                  tap(side, option);
                }}
                onClick={(e) => e.detail === 0 && tap(side, option)}
              >
                {option}
              </button>
            );
          })}
        </div>
        {winner === side && <p className="duel__flash">+1</p>}
        {locked[side] && winner === null && <p className="duel__lock">Kurz gesperrt …</p>}
      </section>
    );
  };

  const resultText =
    scores[0] === scores[1] ? 'Unentschieden!' : `${pair[scores[0] > scores[1] ? 0 : 1]!.name} gewinnt!`;

  return (
    <GameShell
      label={phase === 'play' ? `Duell · Frage ${index + 1} von ${rounds.length}` : 'Duell'}
      onExit={onExit}
      accent="#7c5cff"
      confirmExit={phase === 'play'}
      className={phase === 'play' ? 'gs--duel' : ''}
    >
      {phase === 'pick' && (
        <Stage>
          <p className="gs-eyebrow">{stack.title}</p>
          <Headline small>Wer spielt gegeneinander?</Headline>
          <p className="gs-text">Wählt zwei Personen.</p>
          <PlayerPicker
            players={players}
            selected={pair.map((p) => p.id)}
            onSelect={(player) =>
              setPair((current) =>
                current.some((p) => p.id === player.id)
                  ? current.filter((p) => p.id !== player.id)
                  : current.length < 2
                    ? [...current, player]
                    : [current[1]!, player],
              )
            }
          />
          <Actions>
            <Button size="lg" block disabled={pair.length !== 2} onClick={() => setPhase('ready')}>
              {pair.length === 2 ? `${pair[0]!.name} gegen ${pair[1]!.name}` : `Noch ${2 - pair.length} wählen`}
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'ready' && pair.length === 2 && (
        <Stage>
          <p className="gs-eyebrow">{stack.title}</p>
          <Headline small>
            {pair[0]!.name} gegen {pair[1]!.name}
          </Headline>
          <p className="gs-text">
            Legt das Handy zwischen euch – jede Seite gehört einer Person. Wer zuerst die richtige Antwort tippt, holt den
            Punkt. Falsch getippt: kurz gesperrt. {total} Fragen.
          </p>
          <Actions>
            <Button
              size="lg"
              block
              icon="play"
              onClick={() => {
                prepare();
                start.begin();
              }}
              disabled={start.count !== null}
            >
              Duell starten
            </Button>
            {players.length > 2 && (
              <Button variant="ghost" block icon="users" onClick={() => setPhase('pick')}>
                Andere Personen
              </Button>
            )}
          </Actions>
          <CountdownOverlay count={start.count} />
        </Stage>
      )}

      {phase === 'play' && round && (
        <div className="duel">
          {half(0)}
          <div className="duel__middle" aria-hidden="true">
            <span>{scores[0]}</span>
            <span className="duel__progress">
              {index + 1}/{rounds.length}
            </span>
            <span>{scores[1]}</span>
          </div>
          {half(1)}
          {winner === 'none' && <p className="duel__none">Niemand – die richtige Antwort ist grün.</p>}
        </div>
      )}

      {phase === 'done' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {scores[0] === scores[1] ? '🤝' : '🏆'}
            </span>
            <span className="result-banner__title">{resultText}</span>
          </div>
          <p className="gs-text">
            {pair[0]!.name} <strong>{scores[0]}</strong> : <strong>{scores[1]}</strong> {pair[1]!.name}
          </p>
          {missed.length > 0 && (
            <>
              <p className="gs-text">Diese Karten sind zurück im Kartenkasten (Fach 1) – zum Üben:</p>
              <ul className="turn-list">
                {missed.map((card) => (
                  <li key={card.id} className="is-skipped">
                    <span>↺</span>
                    <span>
                      {card.prompt} – {card.answer}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Actions>
            <Button
              size="lg"
              block
              icon="refresh"
              onClick={() => setPhase('ready')}
            >
              Revanche
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

