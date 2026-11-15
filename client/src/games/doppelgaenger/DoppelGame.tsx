import { useState, type CSSProperties } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PassTurns, SecretReveal } from '../shared/PassTurns.tsx';
import { PlayerPicker, playerScores, ScoreList } from '../shared/players.tsx';
import { PAIRS } from './pairs.ts';
import { setupRound, wordFor, type DoppelRound, type DoppelSettings } from './logic.ts';

type Phase = 'reveal' | 'describe' | 'vote' | 'result';
const ACCENT = '#2de2e6';

export default function DoppelGame({ players, settings, onExit }: GameProps<DoppelSettings>) {
  const makeRound = (): DoppelRound => setupRound(players, drawFresh('doppelgaenger', PAIRS, (p) => p.id), settings);
  const [round, setRound] = useState(makeRound);
  const [roundNo, setRoundNo] = useState(1);
  const [phase, setPhase] = useState<Phase>('reveal');
  const [suspect, setSuspect] = useState<string | null>(null);
  const [caught, setCaught] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '';
  const imposters = players.filter((p) => round.imposterIds.includes(p.id));
  const imposterNames = imposters.map((p) => p.name).join(' & ');
  const ranking = <ScoreList entries={playerScores(players, scores)} />;

  const accuse = () => {
    if (!suspect) return;
    const hit = round.imposterIds.includes(suspect);
    setCaught(hit);
    setScores((s) =>
      Object.fromEntries(
        players.map((p) => {
          const isImposter = round.imposterIds.includes(p.id);
          const gain = hit ? (isImposter ? 0 : 1) : isImposter ? 2 : 0;
          return [p.id, (s[p.id] ?? 0) + gain];
        }),
      ),
    );
    setPhase('result');
    if (hit) {
      sound.reveal();
      confetti({ count: 150 });
    } else {
      sound.buzzer(0.5);
      haptic([100, 50, 100]);
    }
  };

  const next = () => {
    setRound(makeRound());
    setRoundNo((n) => n + 1);
    setSuspect(null);
    setPhase('reveal');
  };

  return (
    <GameShell label={`Runde ${roundNo}`} onExit={onExit} accent={ACCENT} scoreboard={ranking} exitContent={roundNo > 1 ? ranking : undefined}>
      {phase === 'reveal' && (
        <PassTurns
          key={roundNo}
          players={players}
          hint="Schau dir geheim dein Wort an."
          onComplete={() => {
            sound.reveal();
            setPhase('describe');
          }}
          render={(player, done) => {
            const word = wordFor(round, player.id);
            return (
              <SecretReveal onDone={done}>
                {word ? (
                  <>
                    <span className="secret-label">Dein Wort</span>
                    <span className="secret-value">{word}</span>
                    <span className="secret-sub">Vielleicht hat jemand ein anderes Wort … 👀</span>
                  </>
                ) : (
                  <>
                    <span className="gs-big-emoji" aria-hidden="true">
                      🤐
                    </span>
                    <span className="secret-value">Du hast kein Wort!</span>
                    <span className="secret-sub">Hör gut zu und bluffe dich durch.</span>
                  </>
                )}
              </SecretReveal>
            );
          }}
        />
      )}

      {phase === 'describe' && (
        <Stage>
          <span className="gs-big-emoji" aria-hidden="true">
            🗣️
          </span>
          <Headline small>{nameOf(round.firstSpeaker)} beginnt</Headline>
          <p className="gs-text">
            Reihum sagt jede Person <strong>ein Wort</strong>, das zu ihrem Begriff passt – nicht zu deutlich, sonst
            merkt der Doppelgänger, worum es geht. Nach ein, zwei Runden wird abgestimmt.
          </p>
          <Actions>
            <Button size="lg" block onClick={() => setPhase('vote')}>
              Abstimmen
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'vote' && (
        <Stage>
          <p className="gs-eyebrow">Abstimmung</p>
          <Headline small>Wer ist der Doppelgänger?</Headline>
          <PlayerPicker players={players} selected={suspect} onSelect={(p) => setSuspect(p.id)} />
          <Actions>
            <Button size="lg" block disabled={!suspect} onClick={accuse}>
              {suspect ? `${nameOf(suspect)} entlarven` : 'Person wählen'}
            </Button>
            <Button variant="ghost" block onClick={() => setPhase('describe')}>
              Noch eine Runde Wörter
            </Button>
          </Actions>
        </Stage>
      )}

      {phase === 'result' && (
        <Stage>
          <div className="result-banner">
            <span className="gs-big-emoji" aria-hidden="true">
              {caught ? '🎯' : '🪞'}
            </span>
            <span className="result-banner__title">{caught ? 'Erwischt!' : 'Doppelgänger gewinnt!'}</span>
          </div>
          <p className="gs-text">
            {caught
              ? `${nameOf(suspect)} war tatsächlich der Doppelgänger.`
              : `${nameOf(suspect)} war unschuldig – der Doppelgänger war ${imposterNames}.`}
          </p>
          <div className="teams">
            <div className="team-card" style={{ '--c': ACCENT } as CSSProperties}>
              <p className="team-card__name">Alle anderen</p>
              <p className="secret-value" style={{ fontSize: 22 }}>
                {round.word}
              </p>
            </div>
            <div className="team-card" style={{ '--c': '#ff3d8b' } as CSSProperties}>
              <p className="team-card__name">Doppelgänger</p>
              <p className="secret-value" style={{ fontSize: 22 }}>
                {round.otherWord ?? 'kein Wort'}
              </p>
            </div>
          </div>
          {ranking}
          <Actions>
            <Button size="lg" block icon="refresh" onClick={next}>
              Nächste Runde
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
