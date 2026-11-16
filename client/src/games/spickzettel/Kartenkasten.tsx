import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LearnCard, LearnStack, Player } from '../../../../shared/types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { BOXES, boxCounts, canPlayChoice, choicesFor, dueCards } from '../../lib/learn.ts';
import { normalize, shuffle } from '../../lib/util.ts';
import { useData, useProgress } from '../../store/data.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PlayerPicker } from '../shared/players.tsx';
import type { SpickzettelSettings } from './index.tsx';

type Phase = 'who' | 'overview' | 'card' | 'done';

const KIND_LABEL: Record<LearnCard['kind'], string> = {
  translation: 'Übersetze',
  definition: 'Was bedeutet …?',
  qa: 'Frage',
  number: 'Wie viel? Wann?',
};

/** «Leas», «Jonas’» – Swiss German possessive for the headline. */
function possessive(name: string): string {
  return /[sxzß]$/i.test(name) ? `${name}’` : `${name}s`;
}

export function BoxRow({ counts, highlight }: { counts: number[]; highlight?: number }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="box-row" aria-label="Karten pro Fach">
      {counts.map((count, box) => (
        <div
          key={box}
          className={`box-col ${box === highlight ? 'is-highlight' : ''}`}
          style={{ '--fill': `${Math.round((count / max) * 100)}%` } as CSSProperties}
        >
          <span className="box-col__bar" aria-hidden="true" />
          <strong>{count}</strong>
          <small>{box === 0 ? 'neu' : box === BOXES ? 'Fach 5 ⭐' : `Fach ${box}`}</small>
        </div>
      ))}
    </div>
  );
}

/**
 * Kartenkasten (Leitner system): one person answers the cards that are due.
 * Known cards move one box up and come back later, missed ones go back to box 1
 * and are asked once more at the end of the round.
 */
export function Kartenkasten({
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
  const [learner, setLearner] = useState<Player | null>(players.length === 1 ? players[0]! : null);
  const [phase, setPhase] = useState<Phase>(learner ? 'overview' : 'who');
  const progress = useProgress(stack.id, learner?.name);
  const recordAnswer = useData((s) => s.recordAnswer);

  const [queue, setQueue] = useState<LearnCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<{ cardId: string; correct: boolean }[]>([]);
  const [practice, setPractice] = useState(false);
  const asked = useRef(new Set<string>());
  const advance = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(advance.current), []);

  const counts = boxCounts(stack, progress);
  const due = dueCards(stack, progress, settings.sessionSize);
  const dueTotal = dueCards(stack, progress, stack.cards.length).length;
  const card = queue[index];
  const choice = settings.check === 'choice' && canPlayChoice(stack);
  const options = useMemo(() => (card && choice ? choicesFor(card, stack) : []), [card?.id, index, choice]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (practiceRound: boolean) => {
    const cards = practiceRound
      ? // Practice: the weakest cards first, shuffled – does not change the boxes.
        shuffle(stack.cards)
          .sort((a, b) => (progress?.cards[a.id]?.box ?? 0) - (progress?.cards[b.id]?.box ?? 0))
          .slice(0, settings.sessionSize)
      : due;
    if (cards.length === 0) return;
    sound.swirl();
    asked.current = new Set();
    setPractice(practiceRound);
    setQueue(cards);
    setIndex(0);
    setResults([]);
    setRevealed(false);
    setPicked(null);
    setPhase('card');
  };

  const next = (nextQueue: LearnCard[]) => {
    window.clearTimeout(advance.current);
    setRevealed(false);
    setPicked(null);
    if (index + 1 < nextQueue.length) {
      setIndex(index + 1);
      sound.flip();
      return;
    }
    setPhase('done');
  };

  /** Records the answer; a missed card is asked once more at the end of the round. */
  const answer = (correct: boolean): LearnCard[] => {
    if (!card || !learner) return queue;
    if (!practice) recordAnswer(stack.id, learner.name, card.id, correct);
    setResults((r) => [...r, { cardId: card.id, correct }]);
    if (correct) {
      sound.correct();
      haptic(15);
    } else {
      sound.wrong();
      haptic([30, 40, 30]);
    }
    let nextQueue = queue;
    if (!correct && !asked.current.has(card.id)) {
      asked.current.add(card.id);
      nextQueue = [...queue, card];
      setQueue(nextQueue);
    }
    return nextQueue;
  };

  const pick = (option: string) => {
    if (!card || picked) return;
    setPicked(option);
    const isRight = [card.answer, ...card.accepted].some((a) => normalize(a) === normalize(option));
    const nextQueue = answer(isRight);
    // Right answers move on by themselves; for wrong ones there is time to read the solution.
    if (isRight) advance.current = window.setTimeout(() => next(nextQueue), 900);
  };

  const finishedRight = results.filter((r) => r.correct).length;
  useEffect(() => {
    if (phase !== 'done' || results.length === 0) return;
    const share = finishedRight / results.length;
    if (share >= 0.8) {
      sound.fanfare();
      confetti({ count: 160 });
    } else {
      sound.ding();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const label =
    phase === 'card' ? `Karte ${index + 1} von ${queue.length}${practice ? ' · Üben' : ''}` : phase === 'who' ? 'Kartenkasten' : stack.title;

  return (
    <GameShell label={label} onExit={onExit} accent="#4d7cff" confirmExit={phase === 'card'}>
      {phase === 'who' && (
        <Stage>
          <p className="gs-eyebrow">{stack.title}</p>
          <Headline small>Wer lernt?</Headline>
          <p className="gs-text">Jede Person hat ihren eigenen Kartenkasten.</p>
          <PlayerPicker
            players={players}
            selected={learner?.id ?? null}
            onSelect={(player) => {
              setLearner(player);
              setPhase('overview');
            }}
          />
        </Stage>
      )}

      {phase === 'overview' && learner && (
        <Stage>
          <p className="gs-eyebrow">{stack.title}</p>
          <Headline small>{possessive(learner.name)} Kartenkasten</Headline>
          <BoxRow counts={counts} />
          {due.length > 0 ? (
            <p className="gs-text">
              Heute fällig: <strong>{dueTotal}</strong> {dueTotal === 1 ? 'Karte' : 'Karten'}
              {dueTotal > due.length && ` – ${due.length} pro Runde`}
            </p>
          ) : (
            <p className="gs-text">Alles gelernt für heute 🎉 Die nächsten Karten sind morgen oder später wieder dran.</p>
          )}
          <Actions>
            {due.length > 0 ? (
              <Button size="lg" block icon="play" onClick={() => begin(false)}>
                {due.length} {due.length === 1 ? 'Karte' : 'Karten'} lernen
              </Button>
            ) : (
              <Button size="lg" block icon="refresh" onClick={() => begin(true)}>
                Trotzdem üben
              </Button>
            )}
            {players.length > 1 && (
              <Button
                variant="ghost"
                block
                icon="users"
                onClick={() => {
                  setLearner(null);
                  setPhase('who');
                }}
              >
                Andere Person
              </Button>
            )}
          </Actions>
        </Stage>
      )}

      {phase === 'card' && card && (
        <Stage className="learn-stage">
          <div className="learn-progress" aria-hidden="true">
            <span style={{ width: `${(index / queue.length) * 100}%` }} />
          </div>
          <div key={`${card.id}-${index}`} className={`learn-card ${revealed || picked ? 'is-revealed' : ''}`}>
            <span className="learn-card__kind">{KIND_LABEL[card.kind]}</span>
            <p className="learn-card__prompt">{card.prompt}</p>
            {!choice && revealed && (
              <div className="learn-card__answer">
                <span>Antwort</span>
                <p>{card.answer}</p>
                {card.accepted.length > 0 && <small>auch richtig: {card.accepted.join(' · ')}</small>}
              </div>
            )}
          </div>

          {choice ? (
            <>
              <div className="choice-grid" role="group" aria-label="Antworten">
                {options.map((option) => {
                  const right = [card.answer, ...card.accepted].some((a) => normalize(a) === normalize(option));
                  const state = picked ? (right ? 'is-right' : option === picked ? 'is-wrong' : 'is-dim') : '';
                  return (
                    <button key={option} type="button" className={`choice-btn ${state}`} disabled={!!picked} onClick={() => pick(option)}>
                      {option}
                    </button>
                  );
                })}
              </div>
              {picked && (
                <Actions>
                  <Button size="lg" block onClick={() => next(queue)}>
                    Weiter
                  </Button>
                </Actions>
              )}
            </>
          ) : revealed ? (
            <div className="big-buttons">
              <button type="button" className="big-btn big-btn--skip" onClick={() => next(answer(false))}>
                <span aria-hidden="true">✗</span>
                <span>Nicht gewusst</span>
              </button>
              <button type="button" className="big-btn big-btn--correct" onClick={() => next(answer(true))}>
                <span aria-hidden="true">✓</span>
                <span>Gewusst</span>
              </button>
            </div>
          ) : (
            <Actions>
              <Button
                size="lg"
                block
                icon="eye"
                onClick={() => {
                  sound.flip();
                  setRevealed(true);
                }}
              >
                Antwort zeigen
              </Button>
            </Actions>
          )}
        </Stage>
      )}

      {phase === 'done' && learner && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {finishedRight / Math.max(1, results.length) >= 0.8 ? '🎉' : '💪'}
            </span>
            <span className="result-banner__title">
              {finishedRight} von {results.length} gewusst
            </span>
          </div>
          {practice ? (
            <p className="gs-text">Übungsrunde – dein Kartenkasten bleibt, wie er ist.</p>
          ) : (
            <>
              <BoxRow counts={counts} />
              <p className="gs-text">
                {finishedRight === results.length
                  ? 'Perfekt! Alle Karten sind ein Fach weiter.'
                  : 'Die vergessenen Karten sind zurück in Fach 1 und kommen bald wieder.'}
              </p>
            </>
          )}
          <Actions>
            <Button size="lg" block onClick={() => setPhase('overview')}>
              Weiter
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
