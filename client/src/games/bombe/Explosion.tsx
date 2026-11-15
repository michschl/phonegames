import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/util.ts';

type Kind = 'fire' | 'spark' | 'smoke' | 'debris' | 'ember';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  vr: number;
  seed: number;
}

const FIRE_STOPS: [number, number, number][] = [
  [255, 255, 240],
  [255, 236, 140],
  [255, 190, 60],
  [255, 120, 40],
  [230, 50, 50],
  [90, 30, 40],
];

function fireColor(t: number): [number, number, number] {
  const scaled = Math.min(0.999, Math.max(0, t)) * (FIRE_STOPS.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  const a = FIRE_STOPS[i]!;
  const b = FIRE_STOPS[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Full-screen particle explosion on a canvas: fireball, shockwave, flying
 * sparks with trails, tumbling debris, rising smoke and glowing embers.
 */
export function Explosion({ originY = 0.5 }: { originY?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = prefersReducedMotion();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height * originY;
    const scale = Math.max(0.7, Math.min(width, height) / 420);
    const particles: Particle[] = [];

    const spawn = (kind: Kind, count: number, speed: [number, number], life: [number, number], size: [number, number]) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = (speed[0] + Math.random() * (speed[1] - speed[0])) * scale;
        const l = life[0] + Math.random() * (life[1] - life[0]);
        particles.push({
          kind,
          x: cx + (Math.random() - 0.5) * 20,
          y: cy + (Math.random() - 0.5) * 20,
          px: cx,
          py: cy,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - (kind === 'smoke' ? 40 : 0),
          life: l,
          maxLife: l,
          size: (size[0] + Math.random() * (size[1] - size[0])) * scale,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 12,
          seed: Math.random() * 10,
        });
      }
    };

    const k = reduced ? 0.35 : 1;
    spawn('smoke', Math.round(30 * k), [40, 280], [2.6, 4.6], [55, 120]);
    spawn('fire', Math.round(120 * k), [150, 820], [0.6, 1.6], [18, 56]);
    spawn('spark', Math.round(90 * k), [500, 1500], [0.7, 1.7], [1.5, 3.2]);
    spawn('debris', Math.round(34 * k), [300, 900], [1.6, 2.8], [5, 14]);
    spawn('ember', Math.round(50 * k), [60, 340], [2.5, 5], [1.5, 3.5]);

    const start = performance.now();
    let last = start;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      const time = (now - start) / 1000;
      last = now;
      ctx.clearRect(0, 0, width, height);

      // Fireball core.
      if (time < 0.7) {
        const grow = Math.min(1, time / 0.18);
        const fade = time < 0.25 ? 1 : 1 - (time - 0.25) / 0.45;
        const radius = (0.15 + 0.55 * grow) * Math.max(width, height) * 0.6;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(255,255,240,${fade})`);
        g.addColorStop(0.25, `rgba(255,220,120,${0.9 * fade})`);
        g.addColorStop(0.55, `rgba(255,120,50,${0.6 * fade})`);
        g.addColorStop(1, 'rgba(255,61,139,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      // Shockwave rings.
      for (const [delay, strength] of [
        [0, 1],
        [0.12, 0.6],
      ] as const) {
        const t = time - delay;
        if (t > 0 && t < 0.75) {
          const p = t / 0.75;
          const radius = (1 - (1 - p) ** 3) * Math.hypot(width, height) * 0.75;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,240,200,${(1 - p) * 0.8 * strength})`;
          ctx.lineWidth = (1 - p) * 34 * scale * strength + 1;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        alive++;
        const age = 1 - p.life / p.maxLife;
        p.px = p.x;
        p.py = p.y;

        switch (p.kind) {
          case 'fire':
            p.vx *= 1 - 3.2 * dt;
            p.vy = p.vy * (1 - 3.2 * dt) - 60 * dt;
            break;
          case 'spark':
            p.vx *= 1 - 0.9 * dt;
            p.vy = p.vy * (1 - 0.9 * dt) + 700 * dt;
            break;
          case 'debris':
            p.vx *= 1 - 0.6 * dt;
            p.vy += 1100 * dt;
            p.rot += p.vr * dt;
            break;
          case 'smoke':
            p.vx *= 1 - 1.4 * dt;
            p.vy = p.vy * (1 - 1.4 * dt) - 22 * dt;
            break;
          case 'ember':
            p.vx = p.vx * (1 - 1.8 * dt) + Math.sin(time * 3 + p.seed) * 30 * dt;
            p.vy = p.vy * (1 - 1.8 * dt) - 45 * dt;
            break;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.kind === 'smoke') {
          ctx.globalCompositeOperation = 'source-over';
          const r = p.size * (1 + age * 2.2);
          const alpha = Math.min(1, age * 4) * (1 - age) * 0.45;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, `rgba(70,58,82,${alpha})`);
          g.addColorStop(1, 'rgba(40,32,50,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'fire') {
          ctx.globalCompositeOperation = 'lighter';
          const [r, g, b] = fireColor(age);
          const radius = p.size * (0.6 + age * 0.9);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${(1 - age) * 0.9})`);
          grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          const [r, g, b] = fireColor(age * 0.7);
          ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${1 - age})`;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else if (p.kind === 'debris') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, p.life * 2);
          ctx.fillStyle = age < 0.15 ? '#ffb070' : '#2a2236';
          ctx.beginPath();
          ctx.moveTo(-p.size, -p.size * 0.4);
          ctx.lineTo(p.size * 0.8, -p.size * 0.7);
          ctx.lineTo(p.size * 0.5, p.size * 0.6);
          ctx.lineTo(-p.size * 0.6, p.size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          const flicker = 0.6 + 0.4 * Math.sin(time * 18 + p.seed * 5);
          ctx.fillStyle = `rgba(255,${150 + flicker * 80},60,${(1 - age) * flicker})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (alive > 0 || time < 0.8) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [originY]);

  return <canvas ref={canvasRef} className="explosion-canvas" aria-hidden="true" />;
}
