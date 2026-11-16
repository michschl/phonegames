import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { Player } from '../../../../shared/types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { Actions, GameShell, Headline, Stage } from './GameShell.tsx';
import { PassPrompt } from './PassTurns.tsx';
import { makeTeams, ScoreList, TeamCards, teamScores, type Team } from './players.tsx';
import { CountdownOverlay, TimerRing, useCountdown, useStartCountdown, useSuspense, useTurnTally } from './Timer.tsx';

export interface TurnCard {
  id: string;
}

type Result = 'correct' | 'skipped' | 'foul';

interface LogEntry<C> {
  card: C;
  result: Result;
}

export interface TeamTurnGameProps<C extends TurnCard> {
  players: Player[];
  onExit: () => void;
  accent: string;
  /** e.g. "stellt dar", "erklärt", "summt" */
  verb: string;
  turnSeconds: number;
  targetScore: number;
  /** Draw the next card. `used` contains the ids already played in this game. */
  draw: (used: Set<string>) => C;
  renderCard: (card: C) => ReactNode;
  cardLabel: (card: C) => string;
  /** Short reminder shown before each turn. */
  rulesHint: ReactNode;
  /** Enables the red "Verboten!" button (−1 point). */
  foulLabel?: string;
  /** Button labels, default «Erraten» / «Überspringen». */
  correctLabel?: string;
  skipLabel?: string;
}

type Phase = 'teams' | 'pass' | 'ready' | 'turn' | 'summary' | 'winner';

/**
 * Generic engine for team games where one person performs and the own team
 * guesses against the clock (Pantomime, Verbotene Wörter, Summ-Raten).
 */
export function TeamTurnGame<C extends TurnCard>({
  players,
  onExit,
  accent,
  verb,
  turnSeconds,
  targetScore,
  draw,
  renderCard,
  cardLabel,
  rulesHint,
  foulLabel,
  correctLabel = 'Erraten',
  skipLabel = 'Überspringen',
}: TeamTurnGameProps<C>) {
  const [teams, setTeams] = useState<Team[]>(() => makeTeams(players));
  const [phase, setPhase] = useState<Phase>('teams');
  const [teamIndex, setTeamIndex] = useState(0);
  const [performerByTeam, setPerformerByTeam] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [round, setRound] = useState(1);
  const [card, setCard] = useState<C | null>(null);
  const [log, setLog] = useState<LogEntry<C>[]>([]);
  const [flash, setFlash] = useState<{ kind: 'correct' | 'wrong'; key: number } | null>(null);
  const used = useRef(new Set<string>());

  const team = teams[teamIndex]!;
  const performer = team.players[(performerByTeam[team.id] ?? 0) % team.players.length]!;

  // Soft ticks in the last 10 seconds, beeps in the last 5, buzzer at the end.
  const timer = useCountdown(turnSeconds, { onEnd: () => setPhase('summary'), ticking: 10 });
  const suspense = useSuspense();
  const start = useStartCountdown(() => {
    nextCard();
    setPhase('turn');
    timer.start();
  });

  const nextCard = () => {
    const next = draw(used.current);
    used.current.add(next.id);
    setCard(next);
  };

  const record = (result: Result) => {
    if (!card || phase !== 'turn') return;
    setLog((entries) => [...entries, { card, result }]);
    if (result === 'correct') {
      sound.correct();
      haptic(20);
    } else if (result === 'foul') {
      sound.buzzer(0.3);
      haptic([60, 40, 60]);
    } else {
      sound.wrong();
      haptic(10);
    }
    setFlash({ kind: result === 'correct' ? 'correct' : 'wrong', key: Date.now() });
    nextCard();
  };

  const turnPoints = (entries: LogEntry<C>[]) =>
    entries.reduce((sum, e) => sum + (e.result === 'correct' ? 1 : e.result === 'foul' ? -1 : 0), 0);

  // Score jingle on the summary screen (or the sad trombone for an empty turn).
  useTurnTally(phase === 'summary', turnPoints(log));

  const finishTurn = () => {
    if (suspense.pending) return;
    const newScores = { ...scores, [team.id]: (scores[team.id] ?? 0) + turnPoints(log) };
    const nextIndex = (teamIndex + 1) % teams.length;
    // Only decide the winner after a full round, so every team had the same number of turns.
    const best = Math.max(...teams.map((t) => newScores[t.id] ?? 0));
    const leaders = teams.filter((t) => (newScores[t.id] ?? 0) === best);
    const gameOver = nextIndex === 0 && best >= targetScore && leaders.length === 1;

    const apply = () => {
      setScores(newScores);
      setPerformerByTeam((p) => ({ ...p, [team.id]: (p[team.id] ?? 0) + 1 }));
      setLog([]);
      setCard(null);
      timer.reset();
      if (gameOver) {
        setPhase('winner');
        sound.fanfare();
        confetti({ count: 200 });
        return;
      }
      if (nextIndex === 0) {
        setRound((r) => r + 1);
        sound.ding(); // a new round begins
      } else {
        sound.tap();
      }
      setTeamIndex(nextIndex);
      setPhase('pass');
    };

    // Drumroll before the winner is announced.
    if (gameOver) suspense.run(apply);
    else apply();
  };

  const toggleEntry = (index: number) => {
    const entry = log[index];
    if (!entry || suspense.pending) return;
    const result: Result =
      entry.result === 'correct' ? 'skipped' : entry.result === 'skipped' ? (foulLabel ? 'foul' : 'correct') : 'correct';
    if (result === 'correct') sound.coin();
    else if (result === 'foul') sound.wrong();
    else sound.unpluck();
    setLog((entries) => entries.map((e, i) => (i === index ? { ...e, result } : e)));
  };

  const restart = () => {
    sound.swirl();
    setTeams(makeTeams(players));
    setScores({});
    setPerformerByTeam({});
    setTeamIndex(0);
    setRound(1);
    setPhase('teams');
  };

  const ranking = useMemo(() => <ScoreList entries={teamScores(teams, scores)} />, [teams, scores]);
  const winner = teams.reduce((a, b) => ((scores[a.id] ?? 0) >= (scores[b.id] ?? 0) ? a : b));

  return (
    <GameShell
      label={phase === 'teams' ? 'Teams' : `Runde ${round} · Ziel ${targetScore}`}
      onExit={onExit}
      accent={phase === 'teams' || phase === 'winner' ? accent : team.color}
      scoreboard={phase !== 'teams' ? ranking : undefined}
      exitContent={phase !== 'teams' ? ranking : undefined}
    >
      {phase === 'teams' && (
        <Stage>
          <p className="gs-eyebrow">Die Teams</p>
          <TeamCards teams={teams} />
          <Actions>
            <Button
              size="lg"
              block
              onClick={() => {
                sound.pop();
                setPhase('pass');
              }}
            >
              Los geht’s
            </Button>
            <Button
              variant="ghost"
              block
              icon="refresh"
              onClick={() => {
                sound.swirl();
                setTeams(makeTeams(players));
              }}
            >
              Neu mischen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'pass' && (
        <PassPrompt
          key={`${team.id}-${round}`}
          player={performer}
          hint={
            <>
              <strong>{team.name}</strong> ist dran. Nur {performer.name} schaut aufs Display.
            </>
          }
          onReady={() => setPhase('ready')}
        />
      )}

      {phase === 'ready' && (
        <Stage>
          <p className="gs-eyebrow">{team.name}</p>
          <Headline small>
            {performer.name} {verb}
          </Headline>
          <div className="gs-text">{rulesHint}</div>
          <p className="gs-text">
            Ihr habt <strong>{turnSeconds} Sekunden</strong>.
          </p>
          <Actions>
            <Button size="lg" block icon="play" onClick={start.begin} disabled={start.count !== null}>
              Start
            </Button>
          </Actions>
          <CountdownOverlay count={start.count} />
        </Stage>
      )}

      {phase === 'turn' && card && (
        <Stage>
          {flash && <div key={flash.key} className={`flash is-${flash.kind}`} />}
          <div className="turn-head">
            <div className="turn-head__who">
              <small>{team.name}</small>
              <strong>{performer.name}</strong>
            </div>
            <TimerRing remaining={timer.remaining} total={turnSeconds} size={84} />
            <div className="turn-head__points">
              <strong>{turnPoints(log)}</strong>
              <small>Punkte</small>
            </div>
          </div>
          <div key={card.id} style={{ width: '100%', display: 'grid', justifyItems: 'center' }}>
            {renderCard(card)}
          </div>
          <div className="big-buttons">
            <button type="button" className="big-btn big-btn--skip" onClick={() => record('skipped')}>
              <span aria-hidden="true">↷</span>
              <span>{skipLabel}</span>
            </button>
            <button type="button" className="big-btn big-btn--correct" onClick={() => record('correct')}>
              <span aria-hidden="true">✓</span>
              <span>{correctLabel}</span>
            </button>
            {foulLabel && (
              <button type="button" className="big-btn big-btn--foul" onClick={() => record('foul')}>
                <span aria-hidden="true">🚫</span>
                <span>{foulLabel}</span>
              </button>
            )}
          </div>
        </Stage>
      )}

      {phase === 'summary' && (
        <Stage>
          <p className="gs-eyebrow">Zeit ist um!</p>
          <Headline small>
            {team.name}: {turnPoints(log) >= 0 ? '+' : ''}
            {turnPoints(log)} {Math.abs(turnPoints(log)) === 1 ? 'Punkt' : 'Punkte'}
          </Headline>
          {log.length > 0 ? (
            <>
              <ul className="turn-list">
                {log.map((entry, i) => (
                  <li key={`${entry.card.id}-${i}`} className={`is-${entry.result}`} onClick={() => toggleEntry(i)}>
                    <span>{entry.result === 'correct' ? '✓' : entry.result === 'foul' ? '🚫' : '↷'}</span>
                    <span>{cardLabel(entry.card)}</span>
                  </li>
                ))}
              </ul>
              <p className="settings-panel__hint">Vertippt? Antippen zum Korrigieren.</p>
            </>
          ) : (
            <p className="gs-text">Keine einzige Karte? Nächstes Mal klappt’s!</p>
          )}
          <Actions>
            <Button size="lg" block onClick={finishTurn} disabled={suspense.pending}>
              Weiter
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'winner' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              🏆
            </span>
            <span className="result-banner__title">{winner.name} gewinnt!</span>
          </div>
          {ranking}
          <TeamCards teams={teams} />
          <Actions>
            <Button size="lg" block icon="refresh" onClick={restart}>
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
