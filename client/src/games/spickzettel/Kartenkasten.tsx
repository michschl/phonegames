import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LearnCard, LearnStack, Player } from '../../../../shared/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { Button } from '../../components/ui.tsx';
import { CoinGain } from '../../components/Coins.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { Link } from 'react-router';
import {
  answerLanguage,
  boxCounts,
  canPlayChoice,
  checkTypedAnswer,
  choicesFor,
  dueCards,
  dueDayLabel,
  kastenStatus,
  languageName,
  nextRepetition,
  orientCards,
  type AskedCard,
  type TypedVerdict,
} from '../../lib/learn.ts';
import { sameName } from '../../lib/learners.ts';
import { normalize, shuffle } from '../../lib/util.ts';
import { useData, useRewards, useGroups, useProgress } from '../../store/data.ts';
import { useLearnDirection, useLearners, useStreak } from '../../store/learners.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PlayerPicker } from '../shared/players.tsx';
import type { SpickzettelSettings } from './index.tsx';
import { BoxRow } from './BoxRow.tsx';
import { CardPrompt } from './cloze.tsx';
import { useKastenTiles } from './status.ts';

type Phase = 'who' | 'overview' | 'card' | 'done';

const KIND_LABEL: Record<LearnCard['kind'], string> = {
  translation: 'Übersetze',
  definition: 'Was bedeutet …?',
  qa: 'Frage',
  number: 'Wie viel? Wann?',
  cloze: 'Fülle die Lücke',
};

/** «Übersetze auf Deutsch» – which language to answer in, when the stack knows its languages. */
function kindLabel(card: AskedCard, stack: LearnStack): string {
  if (card.kind !== 'translation' || stack.languages.length !== 2) return KIND_LABEL[card.kind];
  return `Übersetze auf ${languageName(answerLanguage(stack, card))}`;
}

/** «Leas», «Jonas’» – Swiss German possessive for the headline. */
function possessive(name: string): string {
  return /[sxzß]$/i.test(name) ? `${name}’` : `${name}s`;
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
  autoStart = false,
}: {
  stack: LearnStack;
  players: Player[];
  settings: SpickzettelSettings;
  onExit: () => void;
  /** Straight to the first due card (one tap from «Heute fällig») instead of the overview – or practice if nothing is due. */
  autoStart?: boolean;
}) {
  const [learner, setLearner] = useState<Player | null>(players.length === 1 ? players[0]! : null);
  const [phase, setPhase] = useState<Phase>(learner ? 'overview' : 'who');
  const progress = useProgress(stack.id, learner?.name);
  const recordAnswer = useData((s) => s.recordAnswer);
  const rewards = useRewards();
  const tiles = useKastenTiles(stack.id);
  const streak = useStreak(learner?.name);
  const learners = useLearners(stack.id);
  const groups = useGroups();
  const direction = useLearnDirection(stack.id);

  const [queue, setQueue] = useState<AskedCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState<TypedVerdict | null>(null);
  const [results, setResults] = useState<{ cardId: string; correct: boolean }[]>([]);
  const [practice, setPractice] = useState(false);
  const asked = useRef(new Set<string>());
  const advance = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(advance.current), []);

  const counts = boxCounts(stack, progress);
  const due = dueCards(stack, progress, settings.sessionSize);
  const dueTotal = dueCards(stack, progress, stack.cards.length).length;
  const status = kastenStatus(stack, progress);
  const card = queue[index];
  const choice = settings.check === 'choice' && canPlayChoice(stack, direction);
  const typing = settings.check === 'type';
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
    // Vocabulary in the direction chosen on the stack page – a card asked again keeps its direction.
    setQueue(orientCards(cards, stack, direction));
    setIndex(0);
    setResults([]);
    setRevealed(false);
    setPicked(null);
    setTyped('');
    setChecked(null);
    setPhase('card');
  };

  const next = (nextQueue: AskedCard[]) => {
    window.clearTimeout(advance.current);
    setRevealed(false);
    setPicked(null);
    setTyped('');
    setChecked(null);
    if (index + 1 < nextQueue.length) {
      setIndex(index + 1);
      sound.flip();
      return;
    }
    setPhase('done');
  };

  const feedback = (correct: boolean) => {
    if (correct) {
      sound.correct();
      haptic(15);
    } else {
      sound.wrong();
      haptic([30, 40, 30]);
    }
  };

  /** Records the answer; a missed card is asked once more at the end of the round. */
  const answer = (correct: boolean, silent = false): AskedCard[] => {
    if (!card || !learner) return queue;
    if (!practice) recordAnswer(stack.id, learner.name, card.id, correct);
    setResults((r) => [...r, { cardId: card.id, correct }]);
    if (!silent) feedback(correct);
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

  /** Turning the card (answers in the head): by its button or a tap on the card itself. */
  const turnable = !choice && !typing && !revealed;
  const turn = () => {
    sound.flip();
    setRevealed(true);
  };

  /** Typed answer: checked kindly, the result shows before moving on. */
  const check = (giveUp = false) => {
    if (!card || checked) return;
    if (!giveUp && !typed.trim()) {
      haptic(20);
      return;
    }
    const verdict: TypedVerdict = giveUp ? { verdict: 'wrong' } : checkTypedAnswer(typed, card);
    setChecked(verdict);
    setRevealed(true);
    feedback(verdict.verdict !== 'wrong');
  };

  useLayoutEffect(() => {
    // Nothing due: a practice round that does not change the boxes («Trotzdem üben»).
    if (autoStart && learner) begin(due.length === 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Nothing due any more: when it goes on, and an idea for playing together. */
  const allDone = () => {
    const next = nextRepetition(stack, progress);
    const rival = learners.find((p) => !sameName(p.name, learner?.name));
    const sharedGroup = rival && groups.find((g) => [learner!.name, rival.name].every((n) => g.players.some((p) => sameName(p.name, n))));
    return (
      <>
        <p className="gs-text all-done">
          <strong>Alles erledigt für heute 🎉</strong>
          {next && (
            <>
              {' '}
              {next.count === 1 ? 'Die nächste Karte ist' : `Die nächsten ${next.count} Karten sind`} {dueDayLabel(next.at)} dran.
            </>
          )}
        </p>
        <Actions>
          <Button size="lg" block icon="check" onClick={onExit}>
            Fertig
          </Button>
          {canPlayChoice(stack) && (
            <Link
              to={`/lernen/${stack.id}/duell${sharedGroup ? `?gruppe=${sharedGroup.id}` : ''}`}
              className="btn btn--secondary btn--lg btn--block"
              // Back from the Duell leads to the stack page, not into this round again.
              replace
              viewTransition
            >
              <span aria-hidden="true">⚔️</span>
              <span>{rival ? `Duell gegen ${rival.name}` : 'Duell zu zweit'}</span>
            </Link>
          )}
          <Button variant="ghost" block onClick={() => setPhase('overview')}>
            Weiter üben
          </Button>
        </Actions>
      </>
    );
  };

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
            status={(player) => tiles?.(player)}
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
              {status.due > 0 && (
                <>
                  Heute fällig: <strong>{status.due}</strong> {status.due === 1 ? 'Karte' : 'Karten'}
                  {status.fresh > 0 && ', dazu '}
                </>
              )}
              {status.fresh > 0 && (
                <>
                  <strong>{status.fresh}</strong> {status.due > 0 ? 'neue' : status.fresh === 1 ? 'neue Karte' : 'neue Karten'}
                </>
              )}
              {dueTotal > due.length && ` – ${due.length} pro Runde`}
            </p>
          ) : (
            <p className="gs-text">
              {status.state === 'mastered' ? 'Alle Karten sind in Fach 5 ⭐' : 'Alles gelernt für heute 🎉'} Die nächsten Karten sind{' '}
              {status.nextDue ? dueDayLabel(status.nextDue) : 'bald'} wieder dran.
            </p>
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
          {/* The card turns with a tap as well; the button below does the same for keyboard and screen reader. */}
          <div
            key={`${card.id}-${index}`}
            className={`learn-card ${revealed || picked ? 'is-revealed' : ''} ${turnable ? 'is-tappable' : ''}`}
            onClick={turnable ? turn : undefined}
          >
            <span className="learn-card__kind">{kindLabel(card, stack)}</span>
            <p className="learn-card__prompt">
              <CardPrompt card={card} fill={revealed || !!picked} />
            </p>
            {turnable && (
              <span className="learn-card__turn" aria-hidden="true">
                <Icon name="refresh" size={14} strokeWidth={2.6} /> Tippen zum Umdrehen
              </span>
            )}
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
          ) : typing ? (
            checked ? (
              <>
                <p className={`typed-result is-${checked.verdict}`} role="status">
                  <strong>
                    {checked.verdict === 'right' ? 'Richtig!' : checked.verdict === 'almost' ? 'Fast richtig – zählt!' : typed.trim() ? 'Leider falsch.' : 'Schau dir die Antwort gut an.'}
                  </strong>
                  {checked.note && <span>{checked.note}</span>}
                  {checked.verdict !== 'right' && typed.trim() && <span>Deine Antwort: «{typed.trim()}»</span>}
                </p>
                <Actions>
                  <Button size="lg" block onClick={() => next(answer(checked.verdict !== 'wrong', true))}>
                    Weiter
                  </Button>
                  {checked.verdict === 'wrong' && typed.trim() && (
                    <Button variant="ghost" block icon="check" onClick={() => next(answer(true, true))}>
                      Ich hatte recht
                    </Button>
                  )}
                </Actions>
              </>
            ) : (
              <form
                className="typed-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  check();
                }}
              >
                <input
                  className="typed-input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  aria-label="Deine Antwort"
                  placeholder="Antwort eintippen"
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  lang={answerLanguage(stack, card)}
                  maxLength={300}
                />
                <Button type="submit" size="lg" block icon="check">
                  Prüfen
                </Button>
                <button type="button" className="typed-skip" onClick={() => check(true)}>
                  Weiss ich nicht
                </button>
              </form>
            )
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
              <Button size="lg" block icon="eye" onClick={turn}>
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
          {!practice && <CoinGain learner={learner.name} amount={finishedRight * rewards.perCard} reason={`Kartenkasten «${stack.title}»`} />}
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
              {streak.days >= 2 && (
                <p className="streak-note" role="status">
                  <span aria-hidden="true">🔥</span> {streak.days} Tage in Folge gelernt – weiter so!
                </p>
              )}
            </>
          )}
          {practice || due.length > 0 ? (
            <Actions>
              <Button size="lg" block onClick={() => setPhase('overview')}>
                Weiter
              </Button>
              <Button variant="ghost" block onClick={onExit}>
                Beenden
              </Button>
            </Actions>
          ) : (
            allDone()
          )}
        </Stage>
      )}
    </GameShell>
  );
}
