import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';

interface CountdownOptions {
  /** Called once when the time is up. */
  onEnd?: () => void;
  /** Beep for each of the last N seconds. 0 disables it. */
  beepFrom?: number;
  /**
   * Soft clock tick for the seconds before the beeps: `true` ticks every second
   * while running, a number only in the last N seconds (e.g. 10).
   */
  ticking?: boolean | number;
  /** Called whenever a new whole second starts while running (for milestones like "1 minute left"). */
  onSecond?: (secondsLeft: number) => void;
}

/**
 * Countdown measured with performance.now() (robust against throttled
 * timers). Returns the remaining seconds and controls.
 */
export function useCountdown(seconds: number, { onEnd, beepFrom = 5, ticking = false, onSecond }: CountdownOptions = {}) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const left = useRef(seconds);
  const lastWhole = useRef(Math.ceil(seconds));
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onSecondRef = useRef(onSecond);
  onSecondRef.current = onSecond;
  const tickFrom = ticking === true ? Infinity : ticking === false ? 0 : ticking;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const rest = Math.max(0, (endAt.current - performance.now()) / 1000);
      left.current = rest;
      setRemaining(rest);
      const whole = Math.ceil(rest);
      if (whole !== lastWhole.current) {
        lastWhole.current = whole;
        if (whole > 0 && whole <= beepFrom) {
          sound.beep(false);
          haptic(8);
        } else if (whole > 0 && whole <= tickFrom) {
          sound.tick();
        }
        if (whole > 0) onSecondRef.current?.(whole);
      }
      if (rest <= 0) {
        window.clearInterval(id);
        setRunning(false);
        sound.buzzer();
        haptic([200, 60, 200]);
        onEndRef.current?.();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, beepFrom, tickFrom]);

  const start = useCallback(() => {
    endAt.current = performance.now() + left.current * 1000;
    lastWhole.current = Math.ceil(left.current);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    left.current = Math.max(0, (endAt.current - performance.now()) / 1000);
    setRemaining(left.current);
    setRunning(false);
  }, []);

  const reset = useCallback(
    (next = seconds) => {
      left.current = next;
      lastWhole.current = Math.ceil(next);
      setRemaining(next);
      setRunning(false);
    },
    [seconds],
  );

  return { remaining, running, start, pause, reset, total: seconds };
}

/** Circular countdown display. */
export function TimerRing({ remaining, total, size = 96 }: { remaining: number; total: number; size?: number }) {
  const stroke = Math.max(6, size * 0.08);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = total > 0 ? remaining / total : 0;
  const urgent = remaining <= 5 && remaining > 0;
  const display = remaining >= 60 ? `${Math.floor(remaining / 60)}:${String(Math.ceil(remaining % 60) % 60).padStart(2, '0')}` : Math.ceil(remaining);
  return (
    <div className={`timer-ring ${urgent ? 'is-urgent' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(remaining)} Sekunden`}>
      <svg width={size} height={size}>
        <circle className="timer-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="timer-ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className="timer-ring__value" style={{ fontSize: size * 0.34 }}>
        {display}
      </span>
    </div>
  );
}

/** "3 – 2 – 1 – Los!" before a turn starts. */
export function useStartCountdown(onGo: () => void) {
  const [count, setCount] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const onGoRef = useRef(onGo);
  onGoRef.current = onGo;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const begin = useCallback(() => {
    sound.unlock();
    setCount(3);
    sound.beep(false);
    [2, 1].forEach((n, i) =>
      timers.current.push(
        window.setTimeout(() => {
          setCount(n);
          sound.beep(false);
          haptic(10);
        }, (i + 1) * 800),
      ),
    );
    timers.current.push(
      window.setTimeout(() => {
        setCount(null);
        sound.beep(true);
        haptic(30);
        onGoRef.current();
      }, 2400),
    );
  }, []);

  return { count, begin };
}

export function CountdownOverlay({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <div className="countdown-overlay" aria-live="assertive">
      <span key={count}>{count}</span>
    </div>
  );
}

/* ------------------------------------------------------ suspense & loops */

/**
 * Heartbeat loop while `bpm` is a number – `null` (or unmounting) stops it.
 * Changing the number only changes the tempo, the loop keeps running.
 */
export function useHeartbeat(bpm: number | null) {
  const loop = useRef<ReturnType<typeof sound.heartbeat> | null>(null);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const active = bpm !== null;

  useEffect(() => {
    if (!active) return;
    const beat = sound.heartbeat(bpmRef.current ?? 70);
    loop.current = beat;
    return () => {
      beat.stop();
      loop.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (bpm !== null) loop.current?.setBpm(bpm);
  }, [bpm]);
}

type SuspenseStyle = 'drumroll' | 'tension';

/**
 * Build-up before a reveal: a drumroll (ends with a crash) or a rising tension
 * sweep, then `onDone` plays the payoff. `pending` is true meanwhile, so the
 * triggering buttons can be disabled. Cancelled on unmount.
 */
export function useSuspense() {
  const [pending, setPending] = useState(false);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => cancel.current?.(), []);

  const run = useCallback((onDone: () => void, { style = 'drumroll', ms = 1800 }: { style?: SuspenseStyle; ms?: number } = {}) => {
    if (cancel.current) return;
    setPending(true);
    haptic(10);
    const stopRoll = style === 'drumroll' ? sound.drumroll() : null;
    const stopTension = style === 'tension' ? sound.tension(ms / 1000) : null;
    const id = window.setTimeout(() => {
      cancel.current = null;
      stopRoll?.();
      haptic([40, 30, 80]);
      setPending(false);
      onDone();
    }, ms);
    cancel.current = () => {
      window.clearTimeout(id);
      stopRoll?.(false);
      stopTension?.();
      cancel.current = null;
    };
  }, []);

  return { pending, run };
}

/**
 * Score jingle for a turn summary, played once the time-up buzzer has faded:
 * one climbing pluck per point (capped) and a coin – or the sad trombone for an
 * empty (or negative) turn. Plays once per activation; corrections in the list
 * afterwards don't replay it.
 */
export function useTurnTally(active: boolean, points: number, delay = 900) {
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    if (!active) return;
    const timers: number[] = [];
    const at = (ms: number, play: () => void) => timers.push(window.setTimeout(play, ms));
    const n = pointsRef.current;
    if (n <= 0) {
      at(delay, () => sound.fail());
    } else {
      const steps = Math.min(n, 10);
      const gap = Math.min(110, 900 / steps);
      for (let i = 0; i < steps; i++) at(delay + i * gap, () => sound.pluck(i));
      at(delay + steps * gap + 60, () => sound.coin());
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, delay]);
}
