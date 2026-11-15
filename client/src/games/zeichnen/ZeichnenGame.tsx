import { useMemo, useRef, useState } from 'react';
import type { GameProps } from '../types.ts';
import { Button, Sheet } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { confetti } from '../../lib/confetti.ts';
import { haptic } from '../../lib/device.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PassPrompt, SecretReveal } from '../shared/PassTurns.tsx';
import { PlayerPicker, playerScores, ScoreList } from '../shared/players.tsx';
import { TimerRing, useCountdown } from '../shared/Timer.tsx';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas.tsx';
import { DRAWING_TERMS, type Term } from './terms.ts';
import './zeichnen.css';

export interface ZeichnenSettings {
  seconds: number;
  difficulties: string[];
}

type Phase = 'pass' | 'peek' | 'draw' | 'who' | 'reveal';

export default function ZeichnenGame({ players, settings, onExit }: GameProps<ZeichnenSettings>) {
  const pool = useMemo(() => {
    const filtered = DRAWING_TERMS.filter((t) => settings.difficulties.includes(String(t.difficulty)));
    return filtered.length > 0 ? filtered : DRAWING_TERMS;
  }, [settings.difficulties]);
  const used = useRef(new Set<string>());
  const pick = () => {
    const term = drawFresh('zeichnen', pool, (t) => t.id, { exclude: used.current });
    used.current.add(term.id);
    return term;
  };

  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>('pass');
  const [term, setTerm] = useState<Term>(pick);
  const [guesser, setGuesser] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [picture, setPicture] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const canvas = useRef<DrawingCanvasHandle>(null);

  const drawer = players[turn % players.length]!;
  const ranking = <ScoreList entries={playerScores(players, scores)} />;
  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '';

  const finish = (winner: string | null) => {
    timer.pause();
    setPicture(canvas.current?.toDataUrl() ?? null);
    setGuesser(winner);
    if (winner) {
      setScores((s) => ({ ...s, [winner]: (s[winner] ?? 0) + 1, [drawer.id]: (s[drawer.id] ?? 0) + 1 }));
      sound.reveal();
      confetti({ count: 120 });
    }
    setPhase('reveal');
  };

  const timer = useCountdown(settings.seconds, { onEnd: () => finish(null) });

  const next = () => {
    setTurn((t) => t + 1);
    setTerm(pick());
    setGuesser(null);
    setPicture(null);
    timer.reset();
    setPhase('pass');
  };

  return (
    <GameShell
      label={`Runde ${Math.floor(turn / players.length) + 1}`}
      onExit={onExit}
      accent="#3a86ff"
      scoreboard={ranking}
      exitContent={turn > 0 ? ranking : undefined}
    >
      {phase === 'pass' && (
        <PassPrompt
          key={turn}
          player={drawer}
          hint="Du zeichnest – gleich siehst du geheim deinen Begriff."
          onReady={() => setPhase('peek')}
        />
      )}

      {phase === 'peek' && (
        <SecretReveal
          doneLabel="Ich hab’s – zeichnen!"
          onDone={() => {
            sound.whoosh();
            setPhase('draw');
            timer.start();
          }}
        >
          <span className="secret-label">Zeichne</span>
          <span className="secret-value">{term.text}</span>
          <span className="secret-sub">Keine Buchstaben, keine Zahlen!</span>
        </SecretReveal>
      )}

      {(phase === 'draw' || phase === 'who') && (
        <div className="zeichnen">
          <div className="zeichnen__head">
            <TimerRing remaining={timer.remaining} total={settings.seconds} size={58} />
            <button
              type="button"
              className="zeichnen__peek"
              onPointerDown={() => setPeeking(true)}
              onPointerUp={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
            >
              {peeking ? term.text : '👁 Begriff (halten)'}
            </button>
            <Button
              size="sm"
              onClick={() => {
                haptic(15);
                timer.pause();
                setPhase('who');
              }}
            >
              Erraten!
            </Button>
          </div>
          <DrawingCanvas ref={canvas} />
        </div>
      )}

      <Sheet
        open={phase === 'who'}
        onClose={() => {
          setPhase('draw');
          timer.start();
        }}
        title="Wer hat’s erraten?"
      >
        <PlayerPicker players={players.filter((p) => p.id !== drawer.id)} onSelect={(p) => finish(p.id)} />
        <div className="sheet__actions">
          <Button
            variant="ghost"
            block
            onClick={() => {
              setPhase('draw');
              timer.start();
            }}
          >
            Zurück zum Zeichnen
          </Button>
        </div>
      </Sheet>

      {phase === 'reveal' && (
        <Stage>
          <p className="gs-eyebrow">{guesser ? `${nameOf(guesser)} hat’s erraten!` : 'Zeit ist um!'}</p>
          <Headline small>{term.text}</Headline>
          {picture && <img className="zeichnen__picture" src={picture} alt={`Zeichnung: ${term.text}`} />}
          {guesser && (
            <p className="gs-text">
              +1 Punkt für <strong>{nameOf(guesser)}</strong> und <strong>{drawer.name}</strong>
            </p>
          )}
          <Actions>
            <Button size="lg" block onClick={next}>
              Nächste Person zeichnet
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
