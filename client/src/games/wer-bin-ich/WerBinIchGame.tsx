import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GameProps } from '../types.ts';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { requestTiltPermission, useTilt } from '../../lib/motion.ts';
import { drawFresh } from '../shared/deck.ts';
import { Actions, GameShell, Headline, Stage } from '../shared/GameShell.tsx';
import { PassPrompt } from '../shared/PassTurns.tsx';
import { playerScores, ScoreList } from '../shared/players.tsx';
import { CountdownOverlay, useCountdown, useStartCountdown } from '../shared/Timer.tsx';
import { DECKS } from './decks.ts';
import './wer-bin-ich.css';

export interface WerBinIchSettings {
  decks: string[];
  seconds: number;
  control: 'tilt' | 'tap';
}

export const DEFAULT_SETTINGS: WerBinIchSettings = {
  decks: ['tiere', 'essen', 'berufe', 'figuren', 'schweiz'],
  seconds: 60,
  control: 'tilt',
};

interface Card {
  id: string;
  word: string;
  deck: string;
}

type Phase = 'pass' | 'ready' | 'play' | 'summary';

export default function WerBinIchGame({ players, settings, onExit }: GameProps<WerBinIchSettings>) {
  const pool = useMemo<Card[]>(
    () =>
      DECKS.filter((d) => settings.decks.includes(d.id)).flatMap((d) =>
        d.words.map((word) => ({ id: `${d.id}:${word}`, word, deck: `${d.emoji} ${d.name}` })),
      ),
    [settings.decks],
  );
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>('pass');
  const [card, setCard] = useState<Card | null>(null);
  const [log, setLog] = useState<{ card: Card; correct: boolean }[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<{ kind: 'correct' | 'wrong'; key: number } | null>(null);
  const [tilt, setTilt] = useState(settings.control === 'tilt');
  const used = useRef(new Set<string>());

  const player = players[turn % players.length]!;
  const ranking = <ScoreList entries={playerScores(players, scores)} />;

  const draw = () => {
    const next = drawFresh('wer-bin-ich', pool.length ? pool : [{ id: 'x', word: '?', deck: '' }], (c) => c.id, {
      exclude: used.current,
    });
    used.current.add(next.id);
    setCard(next);
  };

  const timer = useCountdown(settings.seconds, {
    onEnd: () => {
      setPhase('summary');
    },
  });

  const start = useStartCountdown(() => {
    draw();
    setLog([]);
    setPhase('play');
    timer.start();
  });

  const answer = (correct: boolean) => {
    if (!card || phase !== 'play') return;
    setLog((entries) => [...entries, { card, correct }]);
    setFlash({ kind: correct ? 'correct' : 'wrong', key: Date.now() });
    if (correct) {
      sound.correct();
      haptic(30);
    } else {
      sound.wrong();
      haptic([15, 30, 15]);
    }
    draw();
  };

  useTilt(phase === 'play' && tilt, (direction) => answer(direction === 'down'));

  const begin = async () => {
    sound.unlock();
    if (settings.control === 'tilt') setTilt(await requestTiltPermission());
    start.begin();
  };

  const nextPlayer = () => {
    const points = log.filter((e) => e.correct).length;
    setScores((s) => ({ ...s, [player.id]: (s[player.id] ?? 0) + points }));
    setTurn((t) => t + 1);
    setCard(null);
    timer.reset();
    setPhase('pass');
  };

  const correctCount = log.filter((e) => e.correct).length;
  const fontSize = card && card.word.length > 16 ? 'clamp(30px, 10vw, 64px)' : 'clamp(40px, 14vw, 96px)';

  return (
    <GameShell
      label={phase === 'play' ? `${Math.ceil(timer.remaining)} s` : `Runde ${Math.floor(turn / players.length) + 1}`}
      onExit={onExit}
      accent="#3ddc97"
      scoreboard={ranking}
      exitContent={turn > 0 ? ranking : undefined}
      className={phase === 'play' ? 'wbi-playing' : ''}
    >
      {phase === 'pass' && (
        <PassPrompt
          key={turn}
          player={player}
          hint="Du errätst – die anderen erklären. Schau nicht aufs Display!"
          readyLabel={`${player.name} ist bereit`}
          onReady={() => setPhase('ready')}
        />
      )}

      {phase === 'ready' && (
        <Stage>
          <span className="gs-big-emoji" aria-hidden="true">
            🤳
          </span>
          <Headline small>Handy hochkant an die Stirn!</Headline>
          {settings.control === 'tilt' ? (
            <p className="gs-text">
              Erraten? <strong>Nach vorne kippen</strong> (Display zum Boden). Passen? <strong>Nach hinten kippen</strong>.
              Oder tippen: rechts = erraten, links = passen.
            </p>
          ) : (
            <p className="gs-text">
              Die anderen tippen: <strong>rechts = erraten</strong>, <strong>links = passen</strong>.
            </p>
          )}
          <Actions>
            <Button size="lg" block icon="play" onClick={() => void begin()} disabled={start.count !== null}>
              Los ({settings.seconds} s)
            </Button>
          </Actions>
          <CountdownOverlay count={start.count} />
        </Stage>
      )}

      {phase === 'play' && card && (
        <div className="wbi-play" style={{ '--wbi-size': fontSize } as CSSProperties}>
          {flash && <div key={flash.key} className={`flash is-${flash.kind}`} />}
          <div className="wbi-progress" style={{ width: `${(timer.remaining / timer.total) * 100}%` }} />
          <button type="button" className="wbi-zone wbi-zone--pass" aria-label="Passen" onClick={() => answer(false)} />
          <button type="button" className="wbi-zone wbi-zone--correct" aria-label="Erraten" onClick={() => answer(true)} />
          <div className="wbi-card" key={card.id}>
            <span className="wbi-deck">{card.deck}</span>
            <span className="wbi-word">{card.word}</span>
          </div>
          <span className="wbi-count">✓ {correctCount}</span>
        </div>
      )}

      {phase === 'summary' && (
        <Stage>
          <p className="gs-eyebrow">Zeit ist um!</p>
          <Headline small>
            {player.name}: {correctCount} {correctCount === 1 ? 'Begriff' : 'Begriffe'} erraten
          </Headline>
          <ul className="turn-list">
            {log.map((e, i) => (
              <li key={`${e.card.id}-${i}`} className={e.correct ? 'is-correct' : 'is-skipped'}>
                <span>{e.correct ? '✓' : '↷'}</span>
                <span>{e.card.word}</span>
              </li>
            ))}
          </ul>
          <Actions>
            <Button size="lg" block onClick={nextPlayer}>
              Nächste Person
            </Button>
          </Actions>
        </Stage>
      )}
    </GameShell>
  );
}
