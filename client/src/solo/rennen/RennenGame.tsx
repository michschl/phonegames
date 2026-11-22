import { useEffect, useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { pick, starsFor } from '../logic.ts';
import { getCar } from '../registry.ts';
import type { SoloPlayProps } from '../types.ts';
import '../solo.css';

/*
 * Phoni-Rennen: a road from above. Tap left or right of the car to change lanes, avoid cones, oil and
 * other cars, collect stars. The road gets faster; three (or four) crashes end the race.
 */

type Kind = 'cone' | 'oil' | 'car' | 'star';

interface Thing {
  lane: number;
  /** Position in pixels from the top of the road. */
  y: number;
  /** Stars pulled sideways by the magnet. */
  x?: number;
  kind: Kind;
  color: string;
  hit?: boolean;
}

const TRAFFIC = ['#3a86ff', '#2bb673', '#ffd23f', '#ff8a3d', '#8b5cf6', '#e6e6ee'];

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A car from above; `down` = driving towards the player (windscreen at the bottom). */
function drawCar(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, color: string, down = false, mine = false) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#1d1b26';
  const wheelW = w * 0.18;
  const wheelH = h * 0.2;
  for (const wy of [y + h * 0.14, y + h * 0.66]) {
    roundedRect(ctx, x - wheelW * 0.45, wy, wheelW, wheelH, 3);
    ctx.fill();
    roundedRect(ctx, x + w - wheelW * 0.55, wy, wheelW, wheelH, 3);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = '#1d1b26';
  ctx.lineWidth = Math.max(2, w * 0.06);
  roundedRect(ctx, x, y, w, h, w * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(180, 225, 255, 0.95)';
  const glassY = down ? y + h * 0.62 : y + h * 0.18;
  roundedRect(ctx, x + w * 0.16, glassY, w * 0.68, h * 0.2, w * 0.12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  roundedRect(ctx, x + w * 0.2, y + h * 0.42, w * 0.6, h * 0.16, w * 0.08);
  ctx.fill();
  if (mine) {
    // Racing stripes and a spoiler – the player's car stands out from the traffic.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - w * 0.17, y + h * 0.4, w * 0.1, h * 0.55);
    ctx.fillRect(cx + w * 0.07, y + h * 0.4, w * 0.1, h * 0.55);
    ctx.fillStyle = '#1d1b26';
    roundedRect(ctx, x - w * 0.08, y + h * 0.93, w * 1.16, h * 0.1, 3);
    ctx.fill();
  }
}

function drawCone(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.fillStyle = '#ff8a3d';
  ctx.strokeStyle = '#1d1b26';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.38, cy + size * 0.4);
  ctx.lineTo(cx - size * 0.38, cy + size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx - size * 0.2, cy - size * 0.02, size * 0.4, size * 0.12);
  ctx.fillStyle = '#1d1b26';
  roundedRect(ctx, cx - size * 0.48, cy + size * 0.36, size * 0.96, size * 0.14, 3);
  ctx.fill();
}

function drawOil(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.fillStyle = '#26232f';
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.5, size * 0.34, 0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + size * 0.25, cy + size * 0.12, size * 0.25, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 110, 255, 0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - size * 0.12, cy - size * 0.08, size * 0.16, size * 0.07, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

export default function RennenGame({ level, car: carId, onFinish, onQuit }: SoloPlayProps) {
  const car = getCar(carId);
  const lanes = level === 1 ? 3 : 4;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hearts, setHearts] = useState<number>(car.hearts);
  const [meters, setMeters] = useState(0);
  const [stars, setStars] = useState(0);
  const [running, setRunning] = useState(false);
  const game = useRef({
    lane: Math.floor(lanes / 2),
    /** Drawn lane position (moves towards `lane`). */
    pos: Math.floor(lanes / 2),
    things: [] as Thing[],
    scroll: 0,
    distance: 0,
    stars: 0,
    hearts: car.hearts as number,
    speed: 0,
    spawnIn: 0.6,
    invincible: 0,
    over: false,
    time: 0,
  });
  const countdown = useStartCountdown(() => setRunning(true));

  useEffect(() => {
    countdown.begin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const steer = (direction: -1 | 1) => {
    const g = game.current;
    if (g.over) return;
    const lane = Math.max(0, Math.min(lanes - 1, g.lane + direction));
    if (lane !== g.lane) {
      g.lane = lane;
      sound.click(direction > 0 ? 1.2 : 0.9);
      haptic(5);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') steer(-1);
      if (event.key === 'ArrowRight') steer(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    let last = performance.now();
    let shownMeters = -1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = game.current;
      const W = canvas.width;
      const H = canvas.height;
      const roadW = Math.min(W * 0.92, H * 0.75);
      const roadX = (W - roadW) / 2;
      const laneW = roadW / lanes;
      const carW = laneW * 0.52;
      const carH = carW * 1.65;
      const carY = H * 0.8;
      const laneX = (lane: number) => roadX + laneW * (lane + 0.5);

      if (running && !g.over) {
        g.time += dt;
        // Faster over time: from 45 % (60 % for 8–12) of the screen height per second, up to more than twice that.
        const base = H * (level === 1 ? 0.45 : 0.6);
        g.speed = base * Math.min(2.3, 1 + g.time / (level === 1 ? 55 : 40));
        g.scroll = (g.scroll + g.speed * dt) % (H * 0.12);
        g.distance += (g.speed * dt) / (H / 40);
        g.invincible = Math.max(0, g.invincible - dt);
        // Lane change: quick slide to the new lane.
        const shift = (dt * 1000) / car.shift;
        g.pos = g.pos < g.lane ? Math.min(g.lane, g.pos + shift) : Math.max(g.lane, g.pos - shift);

        g.spawnIn -= dt;
        if (g.spawnIn <= 0) {
          g.spawnIn = Math.max(level === 1 ? 0.55 : 0.4, (level === 1 ? 1.15 : 0.9) - g.time / 80);
          // One row: obstacles in some lanes – always one lane free – and sometimes a star.
          const free = Math.floor(Math.random() * lanes);
          const blocked = 1 + (Math.random() < (level === 1 ? 0.25 : 0.45) && lanes > 2 ? 1 : 0);
          const candidates = Array.from({ length: lanes }, (_, i) => i).filter((i) => i !== free);
          for (let n = 0; n < blocked && candidates.length > 0; n++) {
            const lane = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]!;
            const kind: Kind = pick(level === 1 ? (['cone', 'cone', 'oil', 'car'] as Kind[]) : (['cone', 'oil', 'car', 'car'] as Kind[]));
            g.things.push({ lane, y: -carH, kind, color: pick(TRAFFIC) });
          }
          if (Math.random() < 0.55) g.things.push({ lane: free, y: -carH * 2.2, kind: 'star', color: '#ffd23f' });
        }

        const playerX = roadX + laneW * (g.pos + 0.5);
        for (const thing of g.things) {
          // Oncoming cars are a bit faster than the road.
          thing.y += g.speed * dt * (thing.kind === 'car' ? 1.25 : 1);
          if (thing.kind === 'star' && car.magnet && !thing.hit && Math.abs(thing.lane - g.pos) <= 1.05 && thing.y > carY - H * 0.35) {
            const x = thing.x ?? laneX(thing.lane);
            thing.x = x + (playerX - x) * Math.min(1, dt * 6);
          }
          if (thing.hit) continue;
          const x = thing.x ?? laneX(thing.lane);
          const near = Math.abs(x - playerX) < laneW * 0.55 && Math.abs(thing.y - carY) < carH * (thing.kind === 'car' ? 0.9 : 0.65);
          if (!near) continue;
          if (thing.kind === 'star') {
            thing.hit = true;
            g.stars += 1;
            setStars(g.stars);
            sound.coin();
            haptic(6);
          } else if (g.invincible <= 0) {
            thing.hit = true;
            g.hearts -= 1;
            g.invincible = 1.3;
            setHearts(g.hearts);
            sound.buzzer(0.35);
            haptic([50, 40, 50]);
            if (g.hearts <= 0) {
              g.over = true;
              const meters = Math.round(g.distance);
              const score = Math.round((meters + g.stars * 25) * car.bonus);
              sound.gong();
              window.setTimeout(
                () =>
                  onFinish({
                    score,
                    stars: starsFor(score / (level === 1 ? 900 : 1400)),
                    summary: `${meters} m gefahren, ${g.stars} ${g.stars === 1 ? 'Stern' : 'Sterne'} gesammelt`,
                  }),
                900,
              );
            }
          }
        }
        g.things = g.things.filter((t) => t.y < H + carH * 2 && !(t.kind === 'star' && t.hit));
        const m = Math.floor(g.distance);
        if (m !== shownMeters && m % 5 === 0) {
          shownMeters = m;
          setMeters(m);
        }
      }

      // Grass, road, lane marks.
      ctx.fillStyle = '#7fcf5a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      const stripe = H * 0.12;
      for (let y = -stripe + (g.scroll % stripe); y < H; y += stripe) ctx.fillRect(0, y, roadX, stripe / 2);
      for (let y = -stripe + (g.scroll % stripe); y < H; y += stripe) ctx.fillRect(roadX + roadW, y, W - roadX - roadW, stripe / 2);
      ctx.fillStyle = '#4a4757';
      ctx.fillRect(roadX, 0, roadW, H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(roadX + 3, 0, 4, H);
      ctx.fillRect(roadX + roadW - 7, 0, 4, H);
      const dash = H * 0.06;
      for (let lane = 1; lane < lanes; lane++) {
        const x = roadX + laneW * lane - 2;
        for (let y = -dash * 2 + (g.scroll % (dash * 2)); y < H; y += dash * 2) ctx.fillRect(x, y, 4, dash);
      }

      for (const thing of g.things) {
        const x = thing.x ?? laneX(thing.lane);
        if (thing.kind === 'cone') drawCone(ctx, x, thing.y, carW * 0.9);
        else if (thing.kind === 'oil') drawOil(ctx, x, thing.y, carW * 1.1);
        else if (thing.kind === 'car') drawCar(ctx, x, thing.y, carW, carH, thing.color, true);
        else {
          ctx.font = `${Math.round(carW * 0.8)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', x, thing.y);
        }
      }

      // The player's car blinks for a moment after a crash.
      if (!(g.invincible > 0 && Math.floor(g.invincible * 10) % 2 === 0)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(roadX + laneW * (g.pos + 0.5), carY + carH * 0.08, carW * 0.65, carH * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        drawCar(ctx, roadX + laneW * (g.pos + 0.5), carY, carW * 1.08, carH * 1.08, car.color, false, true);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [running, lanes, level, car, onFinish]);

  return (
    <GameShell label="Phoni-Rennen" onExit={onQuit} accent="#ff4f6d">
      <div className="solo-hud">
        <span aria-label={`${hearts} Herzen`}>{'❤️'.repeat(Math.max(0, hearts))}</span>
        <span>
          <strong>{meters}</strong> m
        </span>
        <span>
          ⭐ <strong>{stars}</strong>
        </span>
      </div>
      <div
        className="rennen"
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          steer(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
        }}
      >
        <canvas ref={canvasRef} className="rennen__road" role="img" aria-label="Strasse – links oder rechts tippen, um die Spur zu wechseln" />
        <div className="rennen__hints" aria-hidden="true">
          <span>◀</span>
          <span>▶</span>
        </div>
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
