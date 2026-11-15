import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '../../../../shared/types.ts';
import type { GameProps } from '../types.ts';
import { StarterRoulette } from '../../components/StarterRoulette.tsx';
import { Icon } from '../../components/Icon.tsx';
import { Avatar, Button, IconButton, Sheet } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic, useWakeLock } from '../../lib/device.ts';
import { pickRandom } from '../../lib/util.ts';
import { useSettings } from '../../store/settings.ts';
import { BombGraphic } from './BombGraphic.tsx';
import { BombTimer } from './BombTimer.ts';
import { Explosion } from './Explosion.tsx';
import { pickStarter, rollFuse, type BombeSettings } from './logic.ts';
import { nextQuestion, type Question } from './questions.ts';
import { playExplosion, startFuse } from './sounds.ts';
import './bombe.css';

type Phase = 'pick' | 'ready' | 'ticking' | 'boom';

const LOSER_LINES = [
  '{name} hat’s erwischt! 💥',
  'Rauchende Haare bei {name}!',
  'Pech gehabt, {name}!',
  '{name} fliegt in die Luft!',
  'Bumm! {name} war zu langsam.',
  'Das war wohl nix, {name}.',
];

const SCORE_KEY = 'plausch-bombe-scores';

function loadScores(players: Player[]): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { ids: string; scores: Record<string, number> };
    return parsed.ids === players.map((p) => p.id).join() ? parsed.scores : {};
  } catch {
    return {};
  }
}

export default function BombeGame({ players, settings, onExit }: GameProps<BombeSettings>) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [round, setRound] = useState(1);
  const [starter, setStarter] = useState(() => pickStarter(players.length, null));
  const [question, setQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>(() => loadScores(players));
  const [loser, setLoser] = useState<string | null>(null);
  const [loserLine, setLoserLine] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const soundOn = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);

  const timerRef = useRef<BombTimer | null>(null);
  const stopFuseRef = useRef<(() => void) | null>(null);
  const bombRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const timeouts = useRef<number[]>([]);

  useWakeLock(true);

  useEffect(() => {
    sound.setMuted(!soundOn);
  }, [soundOn]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SCORE_KEY, JSON.stringify({ ids: players.map((p) => p.id).join(), scores }));
    } catch {
      /* ignore */
    }
  }, [scores, players]);

  const stopBomb = useCallback(() => {
    timerRef.current?.stop();
    timerRef.current = null;
    stopFuseRef.current?.();
    stopFuseRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopBomb();
      timeouts.current.forEach((id) => window.clearTimeout(id));
    },
    [stopBomb],
  );

  const later = (fn: () => void, ms: number) => {
    timeouts.current.push(window.setTimeout(fn, ms));
  };

  /** Visual + haptic feedback in sync with every tick. */
  const onTick = useCallback((heat: number, accent: boolean) => {
    const tilt = (accent ? -1 : 1) * (2 + heat * 7);
    bombRef.current?.animate(
      [
        { transform: 'scale(1) rotate(0deg)' },
        { transform: `scale(${1.05 + heat * 0.08}) rotate(${tilt}deg)` },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 110 + (1 - heat) * 90, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
    stageRef.current?.style.setProperty('--heat', heat.toFixed(2));
    flashRef.current?.animate([{ opacity: 0.18 + heat * 0.55 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    if (heat > 0.45) haptic(Math.round(8 + heat * 14));
  }, []);

  const explode = useCallback(() => {
    stopBomb();
    playExplosion();
    haptic([500, 60, 250, 60, 120]);
    setPhase('boom');
    setShaking(true);
    later(() => setShaking(false), 750);
    later(() => setShowResult(true), 1500);
  }, [stopBomb]);

  const start = () => {
    sound.unlock();
    haptic(30);
    setQuestion(nextQuestion(settings.categories));
    setPhase('ticking');
    stageRef.current?.style.setProperty('--heat', '0');
    stopFuseRef.current = startFuse();
    const timer = new BombTimer({
      duration: rollFuse(settings.duration),
      accelerate: settings.accelerate,
      onTick,
      onExplode: explode,
    });
    timerRef.current = timer;
    timer.start();
  };

  const nextRound = () => {
    sound.unlock();
    setRound((r) => r + 1);
    setLoser(null);
    setShowResult(false);
    setQuestion(null);
    setStarter((previous) => pickStarter(players.length, previous));
    setPhase('pick');
  };

  const chooseLoser = (playerId: string) => {
    haptic(15);
    setScores((current) => {
      const next = { ...current };
      if (loser) next[loser] = Math.max(0, (next[loser] ?? 0) - 1);
      if (loser !== playerId) next[playerId] = (next[playerId] ?? 0) + 1;
      return next;
    });
    if (loser === playerId) {
      setLoser(null);
    } else {
      setLoser(playerId);
      const name = players.find((p) => p.id === playerId)?.name ?? '';
      setLoserLine(pickRandom(LOSER_LINES).replace('{name}', name));
      sound.pop();
    }
  };

  const ranking = useMemo(
    () => [...players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0) || a.name.localeCompare(b.name)),
    [players, scores],
  );
  const totalLosses = Object.values(scores).reduce((sum, n) => sum + n, 0);

  const starterPlayer = players[starter] ?? players[0]!;

  return (
    <div
      ref={stageRef}
      className={`bombe phase-${phase} ${shaking ? 'is-shaking' : ''}`}
      style={{ '--starter': starterPlayer.color } as CSSProperties}
    >
      <div className="bombe__heat" ref={flashRef} aria-hidden="true" />

      <header className="bombe__bar">
        <IconButton icon="x" label="Spiel beenden" onClick={() => setExitOpen(true)} />
        <span className="bombe__round">Runde {round}</span>
        <div className="bombe__bar-actions">
          <IconButton
            icon={soundOn ? 'volume' : 'mute'}
            label={soundOn ? 'Ton aus' : 'Ton an'}
            onClick={() => setSound(!soundOn)}
          />
          <IconButton icon="trophy" label="Bomben-Bilanz" onClick={() => setScoresOpen(true)} />
        </div>
      </header>

      {(phase === 'pick' || phase === 'ready') && (
        <section className="bombe__pick">
          <p className="bombe__eyebrow">{phase === 'ready' ? 'Du bist dran!' : 'Wer beginnt?'}</p>
          <StarterRoulette
            key={round}
            players={players}
            targetIndex={starter}
            onDone={() => setPhase('ready')}
          />
          <div className={`bombe__ready ${phase === 'ready' ? 'is-visible' : ''}`}>
            <p className="bombe__hint">
              <strong>{starterPlayer.name}</strong>, nimm das Handy in die Hand und drücke Start.
            </p>
            <button type="button" className="start-btn" onClick={start} disabled={phase !== 'ready'}>
              <span className="start-btn__ring" />
              <span className="start-btn__ring start-btn__ring--2" />
              <span className="start-btn__label">Start</span>
            </button>
          </div>
        </section>
      )}

      {phase === 'ticking' && question && (
        <section className="bombe__play">
          <span className="bombe__category">
            {question.category.emoji} {question.category.label}
          </span>
          <h1 className="bombe__question">{question.text}</h1>
          <div className="bombe__bomb" ref={bombRef}>
            <div className="bombe__bomb-sway">
              <BombGraphic size={Math.min(250, window.innerWidth * 0.62)} />
            </div>
          </div>
          <p className="bombe__pass">
            Antwort rufen <span className="bombe__arrow">→</span> Handy weitergeben!
          </p>
        </section>
      )}

      {phase === 'boom' && (
        <section className="bombe__boom">
          <Explosion originY={0.56} />
          <div className="boom-flash" aria-hidden="true" />
          <div className="boom-title" aria-live="assertive">
            <span className="boom-title__burst" aria-hidden="true" />
            <span className="boom-title__text">BUMM!</span>
          </div>

          {showResult && (
            <div className="bombe__result">
              <h2 className="bombe__result-title">Wer hatte die Bombe?</h2>
              <p className="bombe__result-text">{loser ? loserLine : 'Tippe auf die Person, die das Handy gehalten hat.'}</p>
              <div className="loser-grid">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`loser-chip ${loser === player.id ? 'is-selected' : ''}`}
                    style={{ '--c': player.color } as CSSProperties}
                    onClick={() => chooseLoser(player.id)}
                    aria-pressed={loser === player.id}
                  >
                    <Avatar name={player.name} color={player.color} size={34} />
                    <span className="loser-chip__name">{player.name}</span>
                    {(scores[player.id] ?? 0) > 0 && <span className="loser-chip__count">💣 {scores[player.id]}</span>}
                  </button>
                ))}
              </div>
              <Button size="lg" block onClick={nextRound} icon="refresh">
                Nächste Runde
              </Button>
            </div>
          )}
        </section>
      )}

      <Sheet open={scoresOpen} onClose={() => setScoresOpen(false)} title="Bomben-Bilanz">
        <Ranking ranking={ranking} scores={scores} total={totalLosses} />
        <div className="sheet__actions">
          <Button variant="secondary" block onClick={() => setScoresOpen(false)}>
            Weiterspielen
          </Button>
        </div>
      </Sheet>

      <Sheet open={exitOpen} onClose={() => setExitOpen(false)} title="Spiel beenden?">
        {totalLosses > 0 ? (
          <Ranking ranking={ranking} scores={scores} total={totalLosses} />
        ) : (
          <p className="sheet__text">Die Bilanz dieser Runde geht verloren.</p>
        )}
        <div className="sheet__actions">
          <Button
            variant="danger"
            block
            size="lg"
            onClick={() => {
              stopBomb();
              sessionStorage.removeItem(SCORE_KEY);
              onExit();
            }}
          >
            Beenden
          </Button>
          <Button variant="ghost" block onClick={() => setExitOpen(false)}>
            Weiterspielen
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Ranking({ ranking, scores, total }: { ranking: Player[]; scores: Record<string, number>; total: number }) {
  if (total === 0) {
    return <p className="sheet__text">Noch ist niemand explodiert. Das ändert sich bestimmt bald … 💣</p>;
  }
  const worst = ranking[0]!;
  return (
    <div className="ranking">
      <p className="ranking__headline">
        <span aria-hidden="true">🙈</span> Pechvogel: <strong>{worst.name}</strong>
      </p>
      <ol className="ranking__list">
        {ranking.map((player, i) => (
          <li key={player.id} className="ranking__item" style={{ '--c': player.color } as CSSProperties}>
            <span className="ranking__pos">{i + 1}.</span>
            <Avatar name={player.name} color={player.color} size={30} />
            <span className="ranking__name">{player.name}</span>
            <span className="ranking__bombs" aria-label={`${scores[player.id] ?? 0} Mal explodiert`}>
              {'💣'.repeat(Math.min(scores[player.id] ?? 0, 6))}
              {(scores[player.id] ?? 0) > 6 && ` ×${scores[player.id]}`}
              {(scores[player.id] ?? 0) === 0 && <Icon name="check" size={18} />}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
