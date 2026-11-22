import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { slideSeconds, sortRound, starsFor } from '../logic.ts';
import type { SoloPlayProps } from '../types.ts';
import '../solo.css';

const LIVES = 3;

/** Sortier-Rutsche: things slide down – into the left or the right box before they reach the bottom. */
export default function SortierGame({ level, onFinish, onQuit }: SoloPlayProps) {
  const [round] = useState(() => sortRound(level));
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [sorted, setSorted] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [flying, setFlying] = useState<'left' | 'right' | 'miss' | null>(null);
  const [wrongSide, setWrongSide] = useState<'left' | 'right' | null>(null);
  const item = round.queue[index];
  const itemRef = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const state = useRef({ index, lives, sorted, score, streak, flying });
  state.current = { index, lives, sorted, score, streak, flying };
  const swipe = useRef<number | null>(null);

  const finish = useCallback(
    (sortedNow: number, scoreNow: number) => {
      onFinish({ score: scoreNow, stars: starsFor(sortedNow / round.queue.length), summary: `${sortedNow} von ${round.queue.length} richtig sortiert` });
    },
    [onFinish, round.queue.length],
  );

  /** Next thing – or the end, after the last one or the last life. */
  const next = useCallback(
    (livesNow: number, sortedNow: number, scoreNow: number) => {
      window.setTimeout(() => {
        setFlying(null);
        setWrongSide(null);
        progress.current = 0;
        if (livesNow <= 0 || state.current.index + 1 >= round.queue.length) {
          finish(sortedNow, scoreNow);
          return;
        }
        setIndex((i) => i + 1);
      }, 420);
    },
    [finish, round.queue.length],
  );

  const answer = useCallback(
    (side: 'left' | 'right') => {
      const s = state.current;
      const current = round.queue[s.index];
      if (!current || s.flying) return;
      sound.unlock();
      const correct = (side === 'right') === current.right;
      setFlying(side);
      if (correct) {
        const points = 10 + Math.min(10, s.streak * 2);
        sound.pop();
        haptic(8);
        setSorted(s.sorted + 1);
        setScore(s.score + points);
        setStreak(s.streak + 1);
        next(s.lives, s.sorted + 1, s.score + points);
      } else {
        sound.wrong();
        haptic([30, 40, 30]);
        setWrongSide(side);
        setLives(s.lives - 1);
        setStreak(0);
        next(s.lives - 1, s.sorted, s.score);
      }
    },
    [next, round.queue],
  );

  // The slide: down by itself; at the bottom it counts as a mistake.
  useEffect(() => {
    if (!item) return;
    let frame = 0;
    let last = performance.now();
    const duration = slideSeconds(level, state.current.sorted);
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!state.current.flying) {
        progress.current = Math.min(1, progress.current + dt / duration);
        if (itemRef.current) itemRef.current.style.setProperty('--p', String(progress.current));
        if (progress.current >= 1) {
          const s = state.current;
          setFlying('miss');
          sound.buzzer(0.3);
          haptic([40, 30, 40]);
          setLives(s.lives - 1);
          setStreak(0);
          next(s.lives - 1, s.sorted, s.score);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [index, item, level, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') answer('left');
      if (event.key === 'ArrowRight') answer('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer]);

  return (
    <GameShell label="Sortier-Rutsche" onExit={onQuit} accent="#2bb673">
      <div className="solo-hud">
        <span aria-label={`${lives} Leben`}>{'❤️'.repeat(Math.max(0, lives))}{'🤍'.repeat(LIVES - Math.max(0, lives))}</span>
        <span>
          Punkte <strong>{score}</strong>
        </span>
        {streak >= 3 && <span className="solo-streak">🔥 {streak}</span>}
      </div>
      <div
        className="sortier"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) answer(dx < 0 ? 'left' : 'right');
        }}
      >
        <div className="sortier__chute" aria-hidden="true" />
        {item && (
          <div
            key={index}
            ref={itemRef}
            className={`sortier__item ${flying ? `is-${flying}` : ''} ${item.text.length > 3 ? 'is-word' : ''}`}
            role="status"
            aria-label={`Einordnen: ${item.text}`}
          >
            {item.text}
          </div>
        )}
        <div className="sortier__bins">
          <button type="button" className={`sortier__bin is-left ${wrongSide === 'left' ? 'is-wrong' : ''}`} onClick={() => answer('left')}>
            {round.set.left}
          </button>
          <button type="button" className={`sortier__bin is-right ${wrongSide === 'right' ? 'is-wrong' : ''}`} onClick={() => answer('right')}>
            {round.set.right}
          </button>
        </div>
      </div>
    </GameShell>
  );
}
