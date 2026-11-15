import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';

interface CountdownOptions {
  /** Called once when the time is up. */
  onEnd?: () => void;
  /** Beep for each of the last N seconds. 0 disables it. */
  beepFrom?: number;
  /** Soft tick every second while running. */
  ticking?: boolean;
}

/**
 * Countdown measured with performance.now() (robust against throttled
 * timers). Returns the remaining seconds and controls.
 */
export function useCountdown(seconds: number, { onEnd, beepFrom = 5, ticking = false }: CountdownOptions = {}) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const endAt = useRef(0);
  const left = useRef(seconds);
  const lastWhole = useRef(Math.ceil(seconds));
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

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
        } else if (whole > 0 && ticking) {
          sound.tick();
        }
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
  }, [running, beepFrom, ticking]);

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
