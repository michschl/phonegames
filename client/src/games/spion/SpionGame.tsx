import { useState } from 'react';
import type { GameProps } from '../types.ts';
import { Button, Sheet } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PassTurns, SecretReveal } from '../shared/PassTurns.tsx';
import { PlayerPicker, playerScores, ScoreList } from '../shared/players.tsx';
import { TimerRing, useCountdown, useHeartbeat, useSuspense } from '../shared/Timer.tsx';
import { LOCATIONS } from './locations.ts';
import { scoreRound, setupRound, type SpionOutcome, type SpionRound, type SpionSettings } from './logic.ts';
import { useReportScores } from '../shared/results.ts';

type Phase = 'reveal' | 'play' | 'vote' | 'guess' | 'result';

const ACCENT = '#5b8cff';

function newRound(players: GameProps<SpionSettings>['players'], spies: number): SpionRound {
  const location = drawFresh('spion', LOCATIONS, (l) => l.id);
  return setupRound(players, location, spies, Math.random, LOCATIONS);
}

export default function SpionGame({ players, settings, onExit }: GameProps<SpionSettings>) {
  const [round, setRound] = useState(() => newRound(players, settings.spies));
  const [roundNo, setRoundNo] = useState(1);
  const [phase, setPhase] = useState<Phase>('reveal');
  const [suspect, setSuspect] = useState<string | null>(null);
  /** 'caught' = last chance after the vote, 'voluntary' = the spy reveals and guesses. */
  const [guessMode, setGuessMode] = useState<'caught' | 'voluntary' | null>(null);
  const [guess, setGuess] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SpionOutcome | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [listOpen, setListOpen] = useState(false);
  const timer = useCountdown(settings.minutes * 60, {
    // Time up sends the questioning to the vote – but never interrupts a vote or the spy's guess.
    onEnd: () => setPhase((current) => (current === 'play' ? 'vote' : current)),
    beepFrom: 10,
    // Clock ticks from 20 s, beeps for the last 10, and a bell when one minute is left.
    ticking: 20,
    onSecond: (left) => {
      if (left === 60) sound.ding();
    },
  });
  const suspense = useSuspense();
  // Heartbeat while voting (faster once someone is suspected) and while the spy has to name the location.
  useHeartbeat(suspense.pending ? null : phase === 'vote' ? (suspect ? 92 : 66) : phase === 'guess' ? 104 : null);

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '';
  const spies = players.filter((p) => round.spyIds.includes(p.id));
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  useReportScores(scores);

  const finish = (result: SpionOutcome) => {
    timer.pause();
    setOutcome(result);
    const points = scoreRound(players, round.spyIds, result);
    setScores((s) => Object.fromEntries(players.map((p) => [p.id, (s[p.id] ?? 0) + (points[p.id] ?? 0)])));
    setPhase('result');
    const spiesWin = result === 'spy-escaped' || result === 'spy-guessed';
    if (spiesWin) {
      // Sad trombone for everybody who was fooled.
      sound.fail();
      haptic([100, 50, 100]);
    } else {
      sound.fanfare();
      confetti({ count: 150 });
    }
  };

  const accuse = () => {
    if (!suspect || suspense.pending) return;
    const caught = round.spyIds.includes(suspect);
    // Rising tension before the verdict.
    suspense.run(
      () => {
        if (caught) {
          // Caught – the spy gets one last chance to name the location.
          sound.sting();
          if (timer.running) timer.pause();
          setGuessMode('caught');
          setGuess(null);
          setPhase('guess');
        } else {
          finish('spy-escaped');
        }
      },
      { style: 'tension', ms: 1600 },
    );
  };

  const submitGuess = () => {
    if (!guess || suspense.pending) return;
    const correct = guess === round.location.id;
    // Drumroll before the location is resolved.
    suspense.run(() => {
      if (correct) finish('spy-guessed');
      else finish(guessMode === 'caught' ? 'spy-caught' : 'spy-wrong-guess');
    });
  };

  const next = () => {
    sound.swirl();
    setRound(newRound(players, settings.spies));
    setRoundNo((n) => n + 1);
    setSuspect(null);
    setGuessMode(null);
    setGuess(null);
    setOutcome(null);
    timer.reset();
    setPhase('reveal');
  };

  const locationGrid = (selectable: boolean) => (
    <div className="loc-grid">
      {round.options.map((loc) => (
        <button
          key={loc.id}
          type="button"
          className={`loc-tile ${guess === loc.id ? 'is-selected' : ''}`}
          onClick={
            selectable
              ? () => {
                  if (suspense.pending) return;
                  sound.tap();
                  setGuess(loc.id);
                }
              : undefined
          }
          disabled={!selectable}
        >
          <span aria-hidden="true">{loc.emoji}</span>
          <span>{loc.name}</span>
        </button>
      ))}
    </div>
  );

  const spyNames = spies.map((s) => s.name).join(' & ');
  const spyWord = spies.length > 1 ? 'Die Spione waren' : 'Der Spion war';
  const resultText = {
    'spy-caught': { title: 'Spion geschnappt! 🎉', text: `${nameOf(suspect)} wurde entlarvt und kannte den Ort nicht.` },
    'spy-wrong-guess': { title: 'Daneben getippt! 🎉', text: `Der Spion hat sich verraten und falsch geraten. ${spyWord} ${spyNames}.` },
    'spy-guessed': { title: 'Der Spion gewinnt! 🕵️', text: `Der Ort wurde erraten. ${spyWord} ${spyNames}.` },
    'spy-escaped': { title: 'Der Spion gewinnt! 🕵️', text: `Falscher Verdacht – ${spyWord} ${spyNames}.` },
  }[outcome ?? 'spy-caught'];

  return (
    <GameShell
      label={`Runde ${roundNo}`}
      onExit={onExit}
      accent={ACCENT}
      scoreboard={ranking}
      exitContent={roundNo > 1 || phase === 'result' ? ranking : undefined}
    >
      {phase === 'reveal' && (
        <PassTurns
          key={roundNo}
          players={players}
          hint="Schau dir geheim deinen Ort und deine Rolle an."
          onComplete={() => {
            setPhase('play');
            sound.reveal();
            timer.start();
          }}
          render={(player, done) => (
            <SecretReveal onDone={done}>
              {round.spyIds.includes(player.id) ? (
                <>
                  <span className="gs-big-emoji" aria-hidden="true">
                    🕵️
                  </span>
                  <span className="secret-value">Du bist der Spion!</span>
                  <span className="secret-sub">Finde heraus, wo ihr seid – ohne aufzufliegen.</span>
                </>
              ) : (
                <>
                  <span className="gs-big-emoji" aria-hidden="true">
                    {round.location.emoji}
                  </span>
                  <span className="secret-label">Ort</span>
                  <span className="secret-value">{round.location.name}</span>
                  <span className="secret-sub">
                    Deine Rolle: <strong>{round.roles[player.id]}</strong>
                  </span>
                </>
              )}
            </SecretReveal>
          )}
        />
      )}

      {phase === 'play' && (
        <Stage>
          <TimerRing remaining={timer.remaining} total={timer.total} size={150} />
          <Headline small>{nameOf(round.firstAsker)} stellt die erste Frage</Headline>
          <p className="gs-text">
            Fragt euch reihum aus: Wer antwortet, stellt die nächste Frage. Der Spion versucht, den Ort zu erraten – alle
            anderen, den Spion zu entlarven.
          </p>
          <Actions>
            <Button
              size="lg"
              block
              onClick={() => {
                sound.tap();
                setPhase('vote');
              }}
            >
              Abstimmen
            </Button>
            <div className="gs-actions gs-actions--row">
              <Button
                variant="secondary"
                onClick={() => {
                  sound.tap();
                  setListOpen(true);
                }}
              >
                Alle Orte
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  // The spy unmasks themselves.
                  sound.sting();
                  if (timer.running) timer.pause();
                  setGuessMode('voluntary');
                  setGuess(null);
                  setPhase('guess');
                }}
              >
                Spion tippt
              </Button>
            </div>
          </Actions>
        </Stage>
      )}

      {phase === 'vote' && (
        <Stage>
          <p className="gs-eyebrow">Abstimmung</p>
          <Headline small>Wer ist der Spion?</Headline>
          <p className="gs-text">Einigt euch auf eine Person – oder zählt die Finger auf «3».</p>
          <PlayerPicker
            players={players}
            selected={suspect}
            onSelect={(p) => setSuspect(p.id)}
            disabled={() => suspense.pending}
          />
          <Actions>
            <Button size="lg" block disabled={!suspect || suspense.pending} onClick={accuse}>
              {suspect ? `${nameOf(suspect)} anklagen` : 'Person wählen'}
            </Button>
            {timer.remaining > 0 && (
              <Button
                variant="ghost"
                block
                disabled={suspense.pending}
                onClick={() => {
                  sound.tap();
                  setPhase('play');
                }}
              >
                Zurück – weiter fragen
              </Button>
            )}
          </Actions>
        </Stage>
      )}

      {phase === 'guess' && (
        <Stage className="gs-stage--top">
          <p className="gs-eyebrow">{guessMode === 'caught' ? 'Erwischt! Letzte Chance' : 'Der Spion packt aus'}</p>
          <Headline small>{guessMode === 'caught' ? `${nameOf(suspect)}, wo seid ihr?` : 'Spion, wo seid ihr?'}</Headline>
          {locationGrid(true)}
          <Actions>
            <Button size="lg" block disabled={!guess || suspense.pending} onClick={submitGuess}>
              Ort auflösen
            </Button>
            {guessMode === 'voluntary' && (
              <Button
                variant="ghost"
                block
                disabled={suspense.pending}
                onClick={() => {
                  sound.unpluck();
                  if (timer.remaining > 0) timer.start();
                  setPhase('play');
                }}
              >
                Doch nicht
              </Button>
            )}
          </Actions>
        </Stage>
      )}

      {phase === 'result' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {round.location.emoji}
            </span>
            <span className="result-banner__title">{resultText.title}</span>
          </div>
          <p className="gs-text">
            {resultText.text} Der Ort war <strong>{round.location.name}</strong>.
          </p>
          {ranking}
          <Actions>
            <Button size="lg" block icon="refresh" onClick={next}>
              Nächste Runde
            </Button>
          </Actions>
        </Stage>
      )}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Mögliche Orte">
        {locationGrid(false)}
      </Sheet>
    </GameShell>
  );
}

