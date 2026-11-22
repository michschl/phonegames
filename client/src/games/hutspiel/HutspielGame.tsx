import { useMemo, useState, type FormEvent } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { pickRandom } from '../../lib/util.ts';
import { Actions, GameShell, Headline, PromptCard, Stage } from '../shared/GameShell.tsx';
import { PassPrompt, PassTurns } from '../shared/PassTurns.tsx';
import { makeTeams, ScoreList, TeamCards, teamScores, type Team } from '../shared/players.tsx';
import { CountdownOverlay, TimerRing, useCountdown, useStartCountdown, useSuspense, useTurnTally } from '../shared/Timer.tsx';
import { DRAWING_TERMS } from '../zeichnen/terms.ts';
import { collectTerms, HUT_ROUNDS, newPool, skipCard, type HutSettings, type HutTerm } from './logic.ts';
import { useReportScores } from '../shared/results.ts';

type Phase = 'teams' | 'collect' | 'roundIntro' | 'pass' | 'ready' | 'turn' | 'summary' | 'end';
const ACCENT = '#ff7ae0';

/** Suggestions for players who cannot think of anything. */
const SUGGESTIONS = DRAWING_TERMS.filter((t) => t.difficulty < 3).map((t) => t.text);

function TermForm({ count, onSubmit }: { count: number; onSubmit: (terms: string[]) => void }) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: count }, () => ''));
  const filled = values.filter((v) => v.trim()).length;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (filled < count) return;
    sound.pop();
    onSubmit(values);
  };
  return (
    <Stage>
      <p className="gs-eyebrow">Geheim eintippen</p>
      <Headline small>Deine {count} Begriffe</Headline>
      <p className="gs-text">Personen, Dinge, Orte, Filme – alles, was die Runde kennt. 🎲 schlägt etwas vor.</p>
      <form className="term-form" onSubmit={submit}>
        {values.map((value, i) => (
          <div key={i} className="term-form__row">
            <input
              value={value}
              maxLength={40}
              placeholder={`Begriff ${i + 1}`}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint={i === count - 1 ? 'done' : 'next'}
              onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label="Zufälligen Begriff vorschlagen"
              onClick={() => {
                sound.click(1.2);
                haptic(6);
                setValues((v) => v.map((x, j) => (j === i ? pickRandom(SUGGESTIONS) : x)));
              }}
            >
              🎲
            </button>
          </div>
        ))}
        <Button type="submit" size="lg" block disabled={filled < count}>
          Fertig – weitergeben
        </Button>
      </form>
    </Stage>
  );
}

export default function HutspielGame({ players, settings, onExit }: GameProps<HutSettings>) {
  const [teams, setTeams] = useState<Team[]>(() => makeTeams(players));
  const [phase, setPhase] = useState<Phase>('teams');
  const [entries, setEntries] = useState<string[]>([]);
  const [terms, setTerms] = useState<HutTerm[]>([]);
  const [round, setRound] = useState(0);
  const [pool, setPool] = useState<string[]>([]);
  const [teamIndex, setTeamIndex] = useState(0);
  const [performerByTeam, setPerformerByTeam] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  // Points per person: what the team got while this person explained.
  const [personal, setPersonal] = useState<Record<string, number>>({});
  const [log, setLog] = useState<{ text: string; correct: boolean }[]>([]);
  const [roundOver, setRoundOver] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'correct' | 'wrong'; key: number } | null>(null);

  const team = teams[teamIndex]!;
  const performer = team.players[(performerByTeam[team.id] ?? 0) % team.players.length]!;
  const current = terms.find((t) => t.id === pool[0]);
  const ranking = <ScoreList entries={teamScores(teams, scores)} />;
  const winners = useMemo(() => {
    if (phase !== 'end') return [];
    const best = Math.max(...teams.map((t) => scores[t.id] ?? 0));
    return teams.filter((t) => (scores[t.id] ?? 0) === best && best > 0).flatMap((t) => t.players.map((p) => p.id));
  }, [phase, teams, scores]);
  useReportScores(personal, winners);

  // Soft ticks in the last 10 seconds, beeps in the last 5, buzzer at the end.
  const timer = useCountdown(settings.seconds, { onEnd: () => setPhase('summary'), ticking: 10 });
  const suspense = useSuspense();
  const start = useStartCountdown(() => {
    setLog([]);
    setRoundOver(false);
    setPhase('turn');
    timer.start();
  });

  const correct = () => {
    if (!current) return;
    sound.correct();
    haptic(20);
    setFlash({ kind: 'correct', key: Date.now() });
    setLog((l) => [...l, { text: current.text, correct: true }]);
    const rest = pool.slice(1);
    setPool(rest);
    if (rest.length === 0) {
      timer.pause();
      setRoundOver(true);
      // Magic glitter: the hat is empty.
      sound.sparkle();
      setPhase('summary');
    }
  };

  const skip = () => {
    if (!current) return;
    sound.wrong();
    setFlash({ kind: 'wrong', key: Date.now() });
    setLog((l) => [...l, { text: current.text, correct: false }]);
    setPool((p) => skipCard(p));
  };

  const finishTurn = () => {
    if (suspense.pending) return;
    const points = log.filter((e) => e.correct).length;
    const newScores = { ...scores, [team.id]: (scores[team.id] ?? 0) + points };
    const gameOver = roundOver && round >= HUT_ROUNDS.length - 1;

    const apply = () => {
      setScores(newScores);
      setPersonal((p) => ({ ...p, [performer.id]: (p[performer.id] ?? 0) + points }));
      setPerformerByTeam((p) => ({ ...p, [team.id]: (p[team.id] ?? 0) + 1 }));
      setTeamIndex((i) => (i + 1) % teams.length);
      timer.reset();
      if (gameOver) {
        setPhase('end');
        confetti({ count: 200 });
        sound.fanfare();
        return;
      }
      if (roundOver) {
        setRound((r) => r + 1);
        setPool(newPool(terms));
        setPhase('roundIntro');
        sound.gong(); // the next round begins
        return;
      }
      sound.tap();
      setPhase('pass');
    };

    // Drumroll before the winner is announced.
    if (gameOver) suspense.run(apply);
    else apply();
  };

  const roundInfo = HUT_ROUNDS[round]!;
  const winner = teams.reduce((a, b) => ((scores[a.id] ?? 0) >= (scores[b.id] ?? 0) ? a : b));
  const turnPoints = log.filter((e) => e.correct).length;
  // Score jingle on the summary screen (or the sad trombone for zero).
  useTurnTally(phase === 'summary', turnPoints);

  return (
    <GameShell
      label={phase === 'teams' || phase === 'collect' ? 'Vorbereitung' : `Runde ${round + 1}: ${roundInfo.title}`}
      onExit={onExit}
      accent={phase === 'pass' || phase === 'ready' || phase === 'turn' ? team.color : ACCENT}
      scoreboard={phase !== 'teams' && phase !== 'collect' ? ranking : undefined}
      exitContent={terms.length ? ranking : undefined}
    >
      {phase === 'teams' && (
        <Stage>
          <p className="gs-eyebrow">Die Teams</p>
          <TeamCards teams={teams} />
          <p className="gs-text">
            Zuerst tippen alle geheim {settings.termsPerPlayer} Begriffe ein. Dann wird in drei Runden mit denselben
            Begriffen gespielt: erklären, ein Wort, Pantomime.
          </p>
          <Actions>
            <Button
              size="lg"
              block
              onClick={() => {
                sound.pop();
                setPhase('collect');
              }}
            >
              Begriffe sammeln
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

      {phase === 'collect' && (
        <PassTurns
          players={players}
          hint="Tippe geheim deine Begriffe ein."
          onComplete={() => {
            const collected = collectTerms(entries);
            setTerms(collected);
            setPool(newPool(collected));
            setPhase('roundIntro');
            // All terms are in the hat – round 1 begins.
            sound.gong();
          }}
          render={(_player, next) => (
            <TermForm
              count={settings.termsPerPlayer}
              onSubmit={(values) => {
                setEntries((e) => [...e, ...values]);
                next();
              }}
            />
          )}
        />
      )}

      {phase === 'roundIntro' && (
        <Stage>
          <span className="round-badge">{round + 1}</span>
          <span className="gs-big-emoji" aria-hidden="true">
            {roundInfo.emoji}
          </span>
          <Headline>{roundInfo.title}</Headline>
          <p className="gs-text">{roundInfo.rule}</p>
          <p className="pool-count">{terms.length} Begriffe im Hut</p>
          <Actions>
            <Button
              size="lg"
              block
              onClick={() => {
                sound.tap();
                setPhase('pass');
              }}
            >
              Los geht’s
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'pass' && (
        <PassPrompt
          key={`${round}-${teamIndex}-${performerByTeam[team.id] ?? 0}`}
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
          <p className="gs-eyebrow">
            {team.name} · Runde {round + 1}
          </p>
          <Headline small>
            {roundInfo.emoji} {roundInfo.title}
          </Headline>
          <p className="gs-text">{roundInfo.rule}</p>
          <p className="pool-count">Noch {pool.length} Begriffe im Hut</p>
          <Actions>
            <Button size="lg" block icon="play" onClick={start.begin} disabled={start.count !== null}>
              Start ({settings.seconds} s)
            </Button>
          </Actions>
          <CountdownOverlay count={start.count} />
        </Stage>
      )}

      {phase === 'turn' && current && (
        <Stage>
          {flash && <div key={flash.key} className={`flash is-${flash.kind}`} />}
          <div className="turn-head">
            <div className="turn-head__who">
              <small>{team.name}</small>
              <strong>{performer.name}</strong>
            </div>
            <TimerRing remaining={timer.remaining} total={settings.seconds} size={84} />
            <div className="turn-head__points">
              <strong>{turnPoints}</strong>
              <small>Punkte</small>
            </div>
          </div>
          <PromptCard cardKey={`${current.id}-${log.length}`} eyebrow={`${roundInfo.emoji} ${roundInfo.title}`} tone={team.color}>
            {current.text}
          </PromptCard>
          <p className="pool-count">Noch {pool.length} im Hut</p>
          <div className="big-buttons">
            <button type="button" className="big-btn big-btn--skip" onClick={skip}>
              <span aria-hidden="true">↷</span>
              <span>Überspringen</span>
            </button>
            <button type="button" className="big-btn big-btn--correct" onClick={correct}>
              <span aria-hidden="true">✓</span>
              <span>Erraten</span>
            </button>
          </div>
        </Stage>
      )}

      {phase === 'summary' && (
        <Stage>
          <p className="gs-eyebrow">{roundOver ? 'Der Hut ist leer!' : 'Zeit ist um!'}</p>
          <Headline small>
            {team.name}: +{turnPoints} {turnPoints === 1 ? 'Punkt' : 'Punkte'}
          </Headline>
          {log.length > 0 && (
            <ul className="turn-list">
              {log.map((e, i) => (
                <li key={i} className={e.correct ? 'is-correct' : 'is-skipped'}>
                  <span>{e.correct ? '✓' : '↷'}</span>
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
          )}
          {roundOver && round < HUT_ROUNDS.length - 1 && (
            <p className="gs-text">
              Weiter mit Runde {round + 2}: <strong>{HUT_ROUNDS[round + 1]!.title}</strong>
            </p>
          )}
          <Actions>
            <Button size="lg" block onClick={finishTurn} disabled={suspense.pending}>
              Weiter
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'end' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              🎩
            </span>
            <span className="result-banner__title">{winner.name} gewinnt!</span>
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
