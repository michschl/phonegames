import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { MEMO_SIZE, memoDeck, memoScore, memoStars } from '../logic.ts';
import type { SoloPlayProps } from '../types.ts';
import '../solo.css';

/** Memo-Blitz: all cards open for a moment, then find the pairs with as few moves as possible. */
export default function MemoGame({ level, onFinish, onQuit }: SoloPlayProps) {
  const size = MEMO_SIZE[level];
  const [deck] = useState(() => memoDeck(level));
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [preview, setPreview] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    sound.unlock();
    sound.reveal();
    const timer = window.setTimeout(() => {
      setPreview(false);
      sound.whoosh();
      started.current = Date.now();
    }, size.previewMs);
    return () => window.clearTimeout(timer);
  }, [size.previewMs]);

  useEffect(() => {
    if (preview) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [preview]);

  const flip = (index: number) => {
    if (preview || busy.current || open.includes(index) || found.includes(deck[index]!)) return;
    sound.flip();
    haptic(6);
    const next = [...open, index];
    setOpen(next);
    if (next.length < 2) return;
    const made = moves + 1;
    setMoves(made);
    const [a, b] = next as [number, number];
    if (deck[a] === deck[b]) {
      const all = [...found, deck[a]!];
      setFound(all);
      setOpen([]);
      window.setTimeout(() => sound.correct(), 120);
      if (all.length === size.pairs) {
        const time = (Date.now() - started.current) / 1000;
        busy.current = true;
        window.setTimeout(
          () =>
            onFinish({
              score: memoScore(size.pairs, made, time),
              stars: memoStars(size.pairs, made),
              summary: `Alle ${size.pairs} Paare in ${made} Zügen und ${Math.round(time)} Sekunden`,
            }),
          900,
        );
      }
    } else {
      busy.current = true;
      window.setTimeout(() => {
        setOpen([]);
        busy.current = false;
      }, 850);
    }
  };

  return (
    <GameShell label="Memo-Blitz" onExit={onQuit} accent="#8b5cf6">
      <div className="solo-hud">
        <span>
          Paare <strong>{found.length}</strong>/{size.pairs}
        </span>
        <span>
          Züge <strong>{moves}</strong>
        </span>
        <span>
          <strong>{preview ? 'Merken!' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong>
        </span>
      </div>
      <div className="memo-grid" style={{ '--cols': size.columns } as CSSProperties}>
        {deck.map((symbol, i) => {
          const shown = preview || open.includes(i) || found.includes(symbol);
          return (
            <button
              key={i}
              type="button"
              className={`memo-card ${shown ? 'is-open' : ''} ${found.includes(symbol) ? 'is-found' : ''}`}
              aria-label={shown ? `Karte ${i + 1}: ${symbol}` : `Karte ${i + 1}, verdeckt`}
              onClick={() => flip(i)}
            >
              <span className="memo-card__inner">
                <span className="memo-card__back" aria-hidden="true">
                  ?
                </span>
                <span className="memo-card__front" aria-hidden="true">
                  {symbol}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </GameShell>
  );
}
