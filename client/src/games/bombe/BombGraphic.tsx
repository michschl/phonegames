import { useId, type CSSProperties, type Ref } from 'react';
import './bomb-graphic.css';

const SPARKS = [
  [-18, -22],
  [16, -26],
  [24, -6],
  [-24, -4],
  [6, -30],
  [-10, -30],
  [20, 10],
  [-16, 12],
];

interface BombGraphicProps {
  size?: number;
  lit?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/** Cartoon bomb with a burning, sparkling fuse (pure SVG + CSS). */
export function BombGraphic({ size = 220, lit = true, className = '', ref }: BombGraphicProps) {
  const id = useId().replace(/:/g, '');
  return (
    <div
      ref={ref}
      className={`bomb ${lit ? 'bomb--lit' : ''} ${className}`}
      style={{ width: size, height: size * 1.1 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 220" className="bomb__svg">
        <defs>
          <radialGradient id={`${id}-body`} cx="36%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#77709a" />
            <stop offset="35%" stopColor="#2e2745" />
            <stop offset="100%" stopColor="#09070f" />
          </radialGradient>
          <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d7d3ea" />
            <stop offset="100%" stopColor="#4a4562" />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0" />
            <stop offset="100%" stopColor="#ff3d8b" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="208" rx="58" ry="8" fill="rgba(0,0,0,0.35)" />
        <circle cx="100" cy="132" r="74" fill={`url(#${id}-body)`} />
        <path
          d="M168 112 A74 74 0 0 1 116 204"
          stroke={`url(#${id}-rim)`}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="70" cy="98" rx="24" ry="13" fill="#fff" opacity="0.22" transform="rotate(-38 70 98)" />
        <circle cx="54" cy="126" r="5" fill="#fff" opacity="0.14" />
        <g transform="rotate(24 112 62)">
          <rect x="92" y="46" width="40" height="28" rx="6" fill={`url(#${id}-cap)`} />
          <rect x="94" y="48" width="36" height="7" rx="3" fill="#fff" opacity="0.3" />
        </g>
        <path
          d="M121 50 C127 30 148 36 155 20 S167 4 176 8"
          stroke="#e2bd85"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M121 50 C127 30 148 36 155 20 S167 4 176 8"
          stroke="#8a6234"
          strokeWidth="6"
          strokeDasharray="2 6"
          fill="none"
        />
      </svg>
      {lit && (
        <div className="bomb__spark">
          <div className="bomb__glow" />
          <div className="bomb__star" />
          {SPARKS.map(([dx, dy], i) => (
            <span
              key={i}
              className="bomb__particle"
              style={{ '--dx': `${dx}px`, '--dy': `${dy}px`, animationDelay: `${i * 0.07}s` } as CSSProperties}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Card illustration for the game catalogue. */
export function BombArt({ size = 120 }: { size?: number }) {
  return <BombGraphic size={size} lit />;
}
