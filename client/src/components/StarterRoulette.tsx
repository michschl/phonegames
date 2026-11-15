import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '../../../shared/types.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { initials, randomInt } from '../lib/util.ts';

/**
 * Slot-machine style picker that spins through the players and lands on
 * `targetIndex`. Tap to skip. Reusable for every game that needs a
 * random starting player.
 */
export function StarterRoulette({
  players,
  targetIndex,
  onDone,
}: {
  players: Player[];
  targetIndex: number;
  onDone: () => void;
}) {
  const n = players.length;
  const [step, setStep] = useState(0);
  const [index, setIndex] = useState(() => randomInt(n));
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    window.clearTimeout(timer.current);
    setIndex(targetIndex);
    setDone(true);
    sound.reveal();
    haptic([25, 40, 25]);
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) confetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count: 90 });
    onDoneRef.current();
  };

  useEffect(() => {
    finished.current = false;
    const start = randomInt(n);
    const loops = Math.max(1, Math.round(18 / n));
    const total = loops * n + ((targetIndex - start + n) % n);
    let current = 0;

    const advance = () => {
      current += 1;
      setStep(current);
      setIndex((start + current) % n);
      sound.blip(current);
      haptic(4);
      if (current >= total) {
        finish();
        return;
      }
      const progress = current / total;
      timer.current = window.setTimeout(advance, 45 + 400 * progress ** 3);
    };

    setIndex(start);
    timer.current = window.setTimeout(advance, 250);
    return () => window.clearTimeout(timer.current);
  }, [targetIndex, n]);

  const player = players[index] ?? players[0]!;

  return (
    <button
      type="button"
      className={`roulette ${done ? 'is-done' : ''}`}
      onClick={finish}
      aria-live="polite"
      aria-label={done ? `${player.name} beginnt` : 'Startspieler wird ausgelost – tippen zum Überspringen'}
      style={{ '--c': player.color } as CSSProperties}
    >
      <div className="roulette__window" ref={cardRef}>
        <div className="roulette__card" key={done ? 'done' : step}>
          <span className="roulette__avatar">{initials(player.name)}</span>
          <span className="roulette__name">{player.name}</span>
        </div>
      </div>
      {!done && <span className="roulette__skip">Tippen zum Überspringen</span>}
    </button>
  );
}
