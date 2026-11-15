import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameProps } from '../types.ts';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { shuffle } from '../../lib/util.ts';
import { GameShell } from '../shared/GameShell.tsx';
import './zufallsfinger.css';

export interface FingerSettings {
  mode: 'eins' | 'teams' | 'reihenfolge';
}

interface Finger {
  id: number;
  x: number;
  y: number;
  color: string;
}

type Phase = 'waiting' | 'arming' | 'choosing' | 'result';

const COLORS = ['#ff3d8b', '#2de2e6', '#ffd23f', '#3ddc97', '#8b5cf6', '#ff8a3d', '#5b8cff', '#ff5e5e', '#c6f135', '#ff7ae0'];
const TEAM_COLORS = ['#ff3d8b', '#2de2e6'];
const ARM_MS = 1400;
const SUSPENSE_MS = 1900;

export default function ZufallsfingerGame({ settings, onExit }: GameProps<FingerSettings>) {
  const [fingers, setFingers] = useState<Finger[]>([]);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [result, setResult] = useState<{ winner?: number; teams?: Record<number, number>; order?: Record<number, number> }>({});
  const area = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const stopRoll = useRef<(() => void) | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const fingersRef = useRef(fingers);
  fingersRef.current = fingers;

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(
    () => () => {
      clearTimers();
      stopRoll.current?.();
    },
    [],
  );

  const decide = (current: Finger[]) => {
    stopRoll.current?.();
    stopRoll.current = null;
    const ids = shuffle(current.map((f) => f.id));
    if (settings.mode === 'teams') {
      setResult({ teams: Object.fromEntries(ids.map((id, i) => [id, i % 2])) });
    } else if (settings.mode === 'reihenfolge') {
      setResult({ order: Object.fromEntries(ids.map((id, i) => [id, i + 1])) });
    } else {
      setResult({ winner: ids[0] });
    }
    setPhase('result');
    sound.reveal();
    haptic([60, 40, 160]);
  };

  // (Re)start the countdown whenever the set of fingers changes.
  useEffect(() => {
    if (phaseRef.current === 'result') return;
    clearTimers();
    stopRoll.current?.();
    stopRoll.current = null;
    if (fingers.length < 2) {
      setPhase('waiting');
      return;
    }
    setPhase('arming');
    const snapshot = fingers;
    timers.current.push(
      window.setTimeout(() => {
        setPhase('choosing');
        stopRoll.current = sound.drumroll();
        haptic(20);
        timers.current.push(window.setTimeout(() => decide(snapshot), SUSPENSE_MS));
      }, ARM_MS),
    );
    // Positions changing must not restart the countdown – only the ids matter.
  }, [fingers.map((f) => f.id).join(',')]);

  const position = (event: ReactPointerEvent) => {
    const rect = area.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const down = (event: ReactPointerEvent) => {
    event.preventDefault();
    sound.unlock();
    if (phaseRef.current === 'result') return;
    const { x, y } = position(event);
    setFingers((list) => {
      if (list.length >= COLORS.length) return list;
      const used = list.map((f) => f.color);
      const color = COLORS.find((c) => !used.includes(c)) ?? COLORS[0]!;
      return [...list, { id: event.pointerId, x, y, color }];
    });
    sound.pop();
    haptic(10);
  };

  const move = (event: ReactPointerEvent) => {
    const { x, y } = position(event);
    setFingers((list) => list.map((f) => (f.id === event.pointerId ? { ...f, x, y } : f)));
  };

  const up = (event: ReactPointerEvent) => {
    const rest = fingersRef.current.filter((f) => f.id !== event.pointerId);
    setFingers(rest);
    if (phaseRef.current === 'result' && rest.length === 0) {
      timers.current.push(
        window.setTimeout(() => {
          setResult({});
          setPhase('waiting');
        }, 1200),
      );
    }
  };

  const winnerColor = result.winner !== undefined ? fingers.find((f) => f.id === result.winner)?.color : undefined;

  const hint =
    phase === 'waiting'
      ? fingers.length === 0
        ? 'Alle legen einen Finger aufs Display'
        : 'Noch mehr Finger …'
      : phase === 'arming'
        ? 'Stillhalten …'
        : phase === 'choosing'
          ? 'Gleich ist es so weit …'
          : settings.mode === 'teams'
            ? 'Die Teams stehen!'
            : settings.mode === 'reihenfolge'
              ? 'Das ist die Reihenfolge!'
              : 'Du bist es!';

  return (
    <GameShell label="Zufallsfinger" onExit={onExit} confirmExit={false} accent={winnerColor ?? '#8b5cf6'}>
      <div
        ref={area}
        className={`finger-area phase-${phase}`}
        style={winnerColor ? ({ '--win': winnerColor } as CSSProperties) : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <p className="finger-hint" key={hint}>
          {hint}
        </p>
        {fingers.map((f) => {
          const team = result.teams?.[f.id];
          const order = result.order?.[f.id];
          const isWinner = result.winner === f.id;
          const lost = result.winner !== undefined && !isWinner;
          const color = team !== undefined ? TEAM_COLORS[team]! : f.color;
          return (
            <span
              key={f.id}
              className={`finger ${isWinner ? 'is-winner' : ''} ${lost ? 'is-out' : ''}`}
              style={{ left: f.x, top: f.y, '--c': color } as CSSProperties}
            >
              {order !== undefined && <span className="finger__label">{order}</span>}
              {team !== undefined && <span className="finger__label">{team === 0 ? 'A' : 'B'}</span>}
            </span>
          );
        })}
      </div>
    </GameShell>
  );
}
