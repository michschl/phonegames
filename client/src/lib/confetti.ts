import { prefersReducedMotion } from './util.ts';

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  shape: 'rect' | 'circle';
}

const COLORS = ['#ff3d8b', '#ff8a3d', '#ffd23f', '#3ddc97', '#2de2e6', '#8b5cf6', '#ffffff'];

/**
 * Fire a confetti burst from a point on the screen (defaults to the centre).
 * Creates a temporary full-screen canvas that removes itself when done.
 */
export function confetti(options: { x?: number; y?: number; count?: number; spread?: number } = {}): void {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const originX = options.x ?? width / 2;
  const originY = options.y ?? height / 2;
  const count = options.count ?? 120;
  const spread = options.spread ?? Math.PI * 2;
  const pieces: Piece[] = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = 380 + Math.random() * 620;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 14,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      life: 2.2 + Math.random() * 1.4,
      shape: Math.random() < 0.25 ? 'circle' : 'rect',
    };
  });

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, width, height);
    let alive = 0;
    for (const p of pieces) {
      p.life -= dt;
      if (p.life <= 0) continue;
      alive++;
      p.vy += 900 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 0.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fake 3D flutter by scaling the height with the rotation.
        ctx.fillRect(-p.w / 2, (-p.h / 2) * Math.cos(p.rot * 2), p.w, p.h * Math.cos(p.rot * 2));
      }
      ctx.restore();
    }
    if (alive > 0) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
