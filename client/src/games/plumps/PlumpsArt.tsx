/** The picture of the game on its cards: the box with its holes, a stick on its way in. */
export function PlumpsArt({ size = 64 }: { size?: number }) {
  const ink = { stroke: '#1b1033', strokeWidth: 3.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {/* the box: front, then the lid */}
      <path d="M12 52h76v26a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="#f0a94e" {...ink} />
      <rect x="10" y="30" width="80" height="34" rx="10" fill="#ffd98a" {...ink} />
      {/* holes */}
      <ellipse cx="28" cy="46" rx="8" ry="4.6" fill="#1b1033" stroke="#4d7cff" strokeWidth="3.5" />
      <ellipse cx="72" cy="46" rx="8" ry="4.6" fill="#1b1033" stroke="#21c46b" strokeWidth="3.5" />
      <ellipse cx="50" cy="48" rx="12" ry="6.6" fill="#1b1033" stroke="#ff5a5f" strokeWidth="4" />
      {/* a stick standing in a hole, one falling into the open one */}
      <rect x="24.5" y="20" width="7" height="27" rx="3.5" fill="#4d7cff" {...ink} strokeWidth={3} />
      <g transform="rotate(14 50 26)">
        <rect x="46" y="6" width="8" height="34" rx="4" fill="#ff4fa3" {...ink} strokeWidth={3} />
      </g>
      <path d="M36 12l-5-6M64 12l5-6M50 3v-1" {...ink} fill="none" strokeWidth={3} opacity="0.75" />
      {/* the front rim of the open hole, over the stick */}
      <path d="M38 48a12 6.6 0 0 0 24 0" fill="none" stroke="#ff5a5f" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
