import { useId } from 'react';
import './brand.css';

export type Mood = 'happy' | 'wink' | 'wow' | 'party' | 'sleepy' | 'oops';

const FACES: Record<Mood, { eyes: 'dots' | 'wink' | 'wide' | 'closed' | 'x'; mouth: string }> = {
  happy: { eyes: 'dots', mouth: 'M49 74 Q60 86 71 74' },
  wink: { eyes: 'wink', mouth: 'M49 74 Q60 86 71 74' },
  wow: { eyes: 'wide', mouth: 'M55 76 a5 6 0 1 0 10 0 a5 6 0 1 0 -10 0' },
  party: { eyes: 'closed', mouth: 'M47 72 Q60 90 73 72 Z' },
  sleepy: { eyes: 'closed', mouth: 'M53 78 Q60 81 67 78' },
  oops: { eyes: 'x', mouth: 'M50 80 Q60 72 70 80' },
};

/**
 * «Phoni» – the Phonegames mascot: a cheerful phone with a face.
 * Pure SVG, so it scales crisply and works offline.
 */
export function Mascot({ size = 120, mood = 'happy', className = '' }: { size?: number; mood?: Mood; className?: string }) {
  const id = useId().replace(/:/g, '');
  const face = FACES[mood];
  return (
    <svg
      className={`mascot mascot--${mood} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Phoni, das Phonegames-Maskottchen"
    >
      <defs>
        <clipPath id={`${id}-screen`}>
          <rect x="37" y="24" width="46" height="70" rx="9" />
        </clipPath>
      </defs>
      <g className="mascot__body">
        {/* hard sticker shadow */}
        <rect x="31" y="13" width="64" height="100" rx="17" fill="#1b1033" transform="translate(5 5)" />
        <rect x="28" y="10" width="64" height="100" rx="17" fill="#ff4fa3" stroke="#1b1033" strokeWidth="4.5" />
        <rect x="52" y="15" width="16" height="4" rx="2" fill="#1b1033" />
        <rect x="35" y="22" width="50" height="74" rx="10" fill="#ffd23f" stroke="#1b1033" strokeWidth="3.5" />
        <g clipPath={`url(#${id}-screen)`}>
          <circle cx="78" cy="30" r="16" fill="#fff" opacity="0.45" />
        </g>
        <circle cx="60" cy="103" r="3.5" fill="#1b1033" />
        <g className="mascot__face">
          {face.eyes === 'dots' && (
            <g className="mascot__eyes">
              <ellipse cx="50" cy="56" rx="4.2" ry="5.2" fill="#1b1033" />
              <ellipse cx="70" cy="56" rx="4.2" ry="5.2" fill="#1b1033" />
              <circle cx="51.5" cy="54" r="1.4" fill="#fff" />
              <circle cx="71.5" cy="54" r="1.4" fill="#fff" />
            </g>
          )}
          {face.eyes === 'wink' && (
            <g>
              <ellipse cx="50" cy="56" rx="4.2" ry="5.2" fill="#1b1033" />
              <path d="M65 57 Q70 52 75 57" stroke="#1b1033" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            </g>
          )}
          {face.eyes === 'wide' && (
            <g className="mascot__eyes">
              <circle cx="50" cy="55" r="6.5" fill="#fff" stroke="#1b1033" strokeWidth="3" />
              <circle cx="70" cy="55" r="6.5" fill="#fff" stroke="#1b1033" strokeWidth="3" />
              <circle cx="50" cy="56" r="2.8" fill="#1b1033" />
              <circle cx="70" cy="56" r="2.8" fill="#1b1033" />
            </g>
          )}
          {face.eyes === 'closed' && (
            <g>
              <path d="M45 57 Q50 51 55 57" stroke="#1b1033" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              <path d="M65 57 Q70 51 75 57" stroke="#1b1033" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            </g>
          )}
          {face.eyes === 'x' && (
            <g stroke="#1b1033" strokeWidth="3.5" strokeLinecap="round">
              <path d="M46 52l8 8M54 52l-8 8" />
              <path d="M66 52l8 8M74 52l-8 8" />
            </g>
          )}
          <circle cx="42" cy="68" r="4.5" fill="#ff4fa3" opacity="0.55" />
          <circle cx="78" cy="68" r="4.5" fill="#ff4fa3" opacity="0.55" />
          <path
            d={face.mouth}
            stroke="#1b1033"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={mood === 'party' ? '#ff4fa3' : mood === 'wow' ? '#1b1033' : 'none'}
          />
        </g>
        {mood === 'party' && (
          <g className="mascot__hat">
            <path d="M50 12 L60 -14 L70 12 Z" fill="#2ec5ff" stroke="#1b1033" strokeWidth="3.5" strokeLinejoin="round" />
            <circle cx="60" cy="-15" r="4" fill="#ffd23f" stroke="#1b1033" strokeWidth="2.5" />
            <path d="M54 4 L66 -2" stroke="#ffd23f" strokeWidth="3" />
          </g>
        )}
        {mood === 'sleepy' && (
          <text x="88" y="20" fontSize="16" fontWeight="900" fill="#7c5cff" fontFamily="sans-serif">
            z
          </text>
        )}
      </g>
      <g className="mascot__sparks" stroke="#1b1033" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M14 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#2ec5ff" />
        <path d="M104 74 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4z" fill="#ffd23f" />
        <circle cx="103" cy="30" r="4" fill="#9be15d" />
      </g>
    </svg>
  );
}

/** Logo: mascot + wordmark. */
export function Logo({ size = 40, stacked = false }: { size?: number; stacked?: boolean }) {
  return (
    <span className={`logo ${stacked ? 'logo--stacked' : ''}`} style={{ fontSize: size * 0.56 }}>
      <Mascot size={size} />
      <span className="logo__word" aria-label="Phonegames">
        <span className="logo__phone">phone</span>
        <span className="logo__games">games</span>
      </span>
    </span>
  );
}
