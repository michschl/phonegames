import type { CSSProperties } from 'react';
import { BOXES } from '../../lib/learn.ts';

/** The boxes of a Kartenkasten with the number of cards in each («neu», Fach 1 … Fach 5). */
export function BoxRow({ counts, highlight }: { counts: number[]; highlight?: number }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="box-row" aria-label="Karten pro Fach">
      {counts.map((count, box) => (
        <div
          key={box}
          className={`box-col ${box === highlight ? 'is-highlight' : ''}`}
          style={{ '--fill': `${Math.round((count / max) * 100)}%` } as CSSProperties}
        >
          <span className="box-col__bar" aria-hidden="true" />
          {box === BOXES && (
            <span className="box-col__star" aria-hidden="true">
              ★
            </span>
          )}
          <strong>{count}</strong>
          <small>{box === 0 ? 'neu' : `Fach ${box}`}</small>
        </div>
      ))}
    </div>
  );
}
