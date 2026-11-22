import { useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { bubbleColors, bubblePoints, pick, starsFor, type BubbleColor } from '../logic.ts';
import type { SoloPlayProps } from '../types.ts';
import '../solo.css';

interface Bubble {
  id: number;
  x: number;
  y: number;
  speed: number;
  size: number;
  color: BubbleColor;
  /** 8–12 years: a colour word on the bubble that may not match its colour. */
  word: string | null;
  popped: 'right' | 'wrong' | null;
}

/** Farben-Fänger: tap only the bubbles of the colour asked for – the colour changes now and then. */
export default function FarbenGame({ level, onFinish, onQuit }: SoloPlayProps) {
  const colors = useMemo(() => bubbleColors(level), [level]);
  const total = level === 1 ? 40 : 45;
  const [target, setTarget] = useState<BubbleColor>(() => pick(colors));
  // 8–12: the name of the target is written in another colour – the word counts.
  const [ink, setInk] = useState<BubbleColor>(() => pick(colors));
  const [left, setLeft] = useState(total);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState(true);
  const [, setFrame] = useState(0);
  const bubbles = useRef<Bubble[]>([]);
  const nextId = useRef(1);
  const live = useRef({ target, score, streak, hits, misses });
  live.current = { target, score, streak, hits, misses };
  const ended = useRef(false);

  // Bubbles rise; new ones come from below – at least every third one in the colour asked for.
  useEffect(() => {
    sound.unlock();
    let frame = 0;
    let last = performance.now();
    let spawnIn = 0;
    const every = level === 1 ? 0.62 : 0.45;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      spawnIn -= dt;
      if (spawnIn <= 0 && !ended.current) {
        spawnIn = every;
        const wanted = Math.random() < 0.38;
        const color = wanted ? live.current.target : pick(colors);
        const word = level === 2 && Math.random() < 0.7 ? pick(colors.filter((c) => c.id !== color.id)).name : null;
        bubbles.current.push({
          id: nextId.current++,
          x: 0.08 + Math.random() * 0.84,
          y: 1.12,
          speed: (level === 1 ? 0.17 : 0.24) + Math.random() * 0.08,
          size: level === 1 ? 74 + Math.random() * 16 : 62 + Math.random() * 14,
          color,
          word,
          popped: null,
        });
      }
      for (const b of bubbles.current) if (!b.popped) b.y -= b.speed * dt;
      bubbles.current = bubbles.current.filter((b) => b.y > -0.2);
      setFrame((f) => (f + 1) % 1_000_000);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [colors, level]);

  // The clock; the colour changes every 9 seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLeft((s) => {
        const n = s - 1;
        if (n > 0 && n % 9 === 0) {
          setTarget((old) => pick(colors.filter((c) => c.id !== old.id)));
          setInk(pick(colors));
          setFlash(true);
          sound.swirl();
        }
        if (n <= 3 && n > 0) sound.tick();
        return Math.max(0, n);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [colors]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 1100);
    return () => window.clearTimeout(t);
  }, [flash, target]);

  useEffect(() => {
    if (left > 0 || ended.current) return;
    ended.current = true;
    const { score: s, hits: h, misses: m } = live.current;
    sound.gong();
    window.setTimeout(
      () => onFinish({ score: s, stars: starsFor(s / (level === 1 ? 320 : 520)), summary: `${h} richtige Blasen erwischt${m > 0 ? `, ${m} falsche` : ''}` }),
      600,
    );
  }, [left, level, onFinish]);

  const tap = (bubble: Bubble) => {
    if (bubble.popped || ended.current) return;
    const { target: wanted, score: s, streak: st, hits: h, misses: m } = live.current;
    if (bubble.color.id === wanted.id) {
      bubble.popped = 'right';
      setScore(s + bubblePoints(st));
      setStreak(st + 1);
      setHits(h + 1);
      sound.pop();
      haptic(6);
    } else {
      bubble.popped = 'wrong';
      setScore(Math.max(0, s - 5));
      setStreak(0);
      setMisses(m + 1);
      sound.wrong();
      haptic([25, 30, 25]);
    }
    window.setTimeout(() => {
      bubbles.current = bubbles.current.filter((b) => b.id !== bubble.id);
    }, 260);
  };

  return (
    <GameShell label={`${left} s`} onExit={onQuit} accent="#2ec5ff">
      <div className="solo-hud">
        <span>
          Punkte <strong>{score}</strong>
        </span>
        {streak >= 3 && <span className="solo-streak">🔥 {streak}</span>}
      </div>
      <div className={`farben-target ${flash ? 'is-new' : ''}`} aria-live="polite">
        Fange{' '}
        {level === 1 ? (
          <span className="farben-target__swatch" style={{ background: target.color }}>
            {target.name}
          </span>
        ) : (
          <strong className="farben-target__word" style={{ color: ink.id === target.id ? '#1d1b26' : ink.color }}>
            {target.name.toUpperCase()}
          </strong>
        )}
      </div>
      <div className="farben-field">
        {bubbles.current.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`farben-bubble ${b.popped ? `is-${b.popped}` : ''}`}
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: b.size,
              height: b.size,
              background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.85) 0 12%, transparent 13%), ${b.color.color}`,
            }}
            aria-label={b.word ? `${b.color.adjective} Blase mit dem Wort ${b.word}` : `${b.color.adjective} Blase`}
            onPointerDown={() => tap(b)}
          >
            {b.word && <span className="farben-bubble__word">{b.word}</span>}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
