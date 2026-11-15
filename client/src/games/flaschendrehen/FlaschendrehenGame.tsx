import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameProps } from '../types.ts';
import { Button, Sheet } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { pickRandom } from '../../lib/util.ts';
import { GameShell, PromptCard } from '../shared/GameShell.tsx';
import { CARDS } from '../wahrheit-oder-pflicht/cards.ts';
import './flaschendrehen.css';

/** Angular friction: exponential slow-down plus a constant brake (deg/s²). */
const DECAY = 0.55;
const BRAKE = 70;
const CLICK_EVERY = 30;

function spinVelocity(): number {
  return (900 + Math.random() * 900) * (Math.random() < 0.5 ? -1 : 1);
}

export default function FlaschendrehenGame({ onExit }: GameProps<Record<string, never>>) {
  const [spinning, setSpinning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [card, setCard] = useState<{ kind: 'wahrheit' | 'pflicht'; text: string } | null>(null);
  const bottle = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const angle = useRef(Math.random() * 360);
  const velocity = useRef(0);
  const raf = useRef(0);
  const drag = useRef<{ last: number; time: number; v: number; click: number } | null>(null);

  const render = () => {
    if (bottle.current) bottle.current.style.transform = `rotate(${angle.current}deg)`;
  };

  useEffect(() => {
    render();
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const spin = (initial: number) => {
    cancelAnimationFrame(raf.current);
    sound.unlock();
    velocity.current = initial;
    setSpinning(true);
    setStopped(false);
    setCard(null);
    sound.swirl();
    haptic(20);
    let last = performance.now();
    let lastClick = Math.floor(angle.current / CLICK_EVERY);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const v = velocity.current;
      const sign = Math.sign(v);
      let next = v * Math.exp(-DECAY * dt) - sign * BRAKE * dt;
      if (Math.sign(next) !== sign) next = 0;
      velocity.current = next;
      angle.current += next * dt;
      render();
      const click = Math.floor(angle.current / CLICK_EVERY);
      if (click !== lastClick) {
        lastClick = click;
        sound.click(0.6 + Math.min(1, Math.abs(next) / 1200));
        if (Math.abs(next) < 250) haptic(4);
      }
      if (Math.abs(next) < 4) {
        setSpinning(false);
        setStopped(true);
        // The bottle has landed on someone.
        sound.ding();
        sound.sparkle();
        haptic([30, 40, 80]);
        return;
      }
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  };

  /** Angle of the pointer around the centre of the play area. */
  const pointerAngle = (event: ReactPointerEvent) => {
    const rect = area.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
  };

  const down = (event: ReactPointerEvent) => {
    if (spinning) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { last: pointerAngle(event), time: performance.now(), v: 0, click: Math.floor(angle.current / CLICK_EVERY) };
  };

  const move = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    const now = performance.now();
    const a = pointerAngle(event);
    let delta = a - drag.current.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    angle.current += delta;
    render();
    // Turning the bottle by hand ratchets just like a real spin.
    const click = Math.floor(angle.current / CLICK_EVERY);
    if (click !== drag.current.click) sound.click(0.6);
    const dt = Math.max(1, now - drag.current.time) / 1000;
    drag.current = { last: a, time: now, v: drag.current.v * 0.5 + (delta / dt) * 0.5, click };
  };

  const up = () => {
    if (!drag.current) return;
    const v = drag.current.v;
    drag.current = null;
    // A flick spins the bottle; a slow drag just positions it.
    if (Math.abs(v) > 200) spin(Math.sign(v) * Math.min(2200, Math.abs(v) * 1.6 + 400));
  };

  const draw = (kind: 'wahrheit' | 'pflicht') => {
    const pool = CARDS.filter((c) => c.type === kind && c.pack !== 'party');
    const text = pickRandom(pool).text.replaceAll('{person}', 'der Person links von dir');
    // First card is turned over, swapping to the other kind is a card change.
    if (card) sound.whoosh();
    else sound.flip();
    setCard({ kind, text });
  };

  return (
    <GameShell label="Flaschendrehen" onExit={onExit} confirmExit={false} accent="#3ddc97">
      <div ref={area} className="bottle-area" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="bottle-table" />
        <div ref={bottle} className={`bottle ${spinning ? 'is-spinning' : ''} ${stopped ? 'is-stopped' : ''}`}>
          <svg viewBox="0 0 80 240" aria-hidden="true">
            <defs>
              <linearGradient id="glass" x1="0" x2="1">
                <stop offset="0" stopColor="#0f6b3f" />
                <stop offset="0.35" stopColor="#3ddc97" />
                <stop offset="0.55" stopColor="#1fa86a" />
                <stop offset="1" stopColor="#0b4a2c" />
              </linearGradient>
            </defs>
            <rect x="31" y="2" width="18" height="14" rx="3" fill="#ffd23f" stroke="#1b1033" strokeWidth="3" />
            <path d="M33 16h14v46c0 10 23 22 23 46v116c0 8-6 14-14 14H24c-8 0-14-6-14-14V108c0-24 23-36 23-46z" fill="url(#glass)" stroke="#1b1033" strokeWidth="4" strokeLinejoin="round" />
            <rect x="14" y="128" width="52" height="56" rx="6" fill="#ff4fa3" stroke="#1b1033" strokeWidth="3" />
            <text x="40" y="162" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" fontFamily="sans-serif">
              ★
            </text>
            <path d="M24 112c-4 8-4 90 0 110" stroke="#fff" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        {!spinning && !stopped && <p className="bottle-hint">Legt das Handy in die Mitte und wischt kräftig im Kreis</p>}
      </div>

      <div className="bottle-actions">
        {stopped && (
          <Button variant="secondary" block onClick={() => draw(Math.random() < 0.5 ? 'wahrheit' : 'pflicht')}>
            🎲 Wahrheit oder Pflicht?
          </Button>
        )}
        <Button size="lg" block disabled={spinning} onClick={() => spin(spinVelocity())}>
          {stopped ? 'Nochmals drehen' : 'Drehen!'}
        </Button>
      </div>

      <Sheet open={card !== null} onClose={() => setCard(null)} title={card?.kind === 'pflicht' ? '🔥 Pflicht' : '🗣️ Wahrheit'}>
        {card && (
          <PromptCard cardKey={card.text} tone={card.kind === 'pflicht' ? '#ff8a3d' : '#2de2e6'}>
            {card.text}
          </PromptCard>
        )}
        <div className="sheet__actions">
          <Button block onClick={() => card && draw(card.kind === 'pflicht' ? 'wahrheit' : 'pflicht')} variant="secondary">
            Lieber {card?.kind === 'pflicht' ? 'Wahrheit' : 'Pflicht'}
          </Button>
          <Button
            block
            onClick={() => {
              sound.correct();
              setCard(null);
            }}
          >
            Erledigt
          </Button>
        </div>
      </Sheet>
    </GameShell>
  );
}
