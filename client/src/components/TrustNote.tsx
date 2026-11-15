/** Small Swiss flag (SVG, so it looks the same everywhere – Windows has no flag emojis). */
function SwissFlag() {
  return (
    <svg className="trust-note__flag" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="5" fill="#da291c" />
      <rect x="13" y="6" width="6" height="20" fill="#fff" />
      <rect x="6" y="13" width="20" height="6" fill="#fff" />
    </svg>
  );
}

/** Quiet note about where Phonegames comes from and what it does not do. */
export function TrustNote({ className = '' }: { className?: string }) {
  return (
    <p className={`trust-note ${className}`}>
      <span className="trust-note__line">
        <SwissFlag />
        Entwickelt und betrieben in der Schweiz
      </span>
      <span className="trust-note__line">Ohne Werbung · Ohne Tracking</span>
    </p>
  );
}
