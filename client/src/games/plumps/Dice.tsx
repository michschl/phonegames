import type { CSSProperties } from 'react';
import { HOLES } from './logic.ts';

/*
 * A die as a real cube (CSS 3D): six faces, turned so the rolled one looks at the players. Every roll adds
 * two full turns on both axes, so the cube tumbles before it comes to rest.
 */

/** How the cube has to be turned for a face to look to the front. Opposite faces add up to 7. */
const TURN: Record<number, [number, number]> = {
  1: [0, 0],
  2: [0, -90],
  3: [-90, 0],
  4: [90, 0],
  5: [0, 90],
  6: [0, 180],
};

/** Where the pips of a face sit on a 3 × 3 grid (0–8). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ kind, value, rolls }: { kind: 'zahl' | 'farbe'; value: number; rolls: number }) {
  const [rx, ry] = TURN[value] ?? TURN[1]!;
  return (
    <span className={`die die--${kind} ${rolls > 0 ? 'has-rolled' : ''}`} aria-hidden="true">
      {/* The hop starts anew with every roll: two classes with the same animation take turns (a key would build a new cube, which could not tumble on from where it lay). */}
      <span className={`die__hop ${rolls === 0 ? '' : rolls % 2 ? 'is-a' : 'is-b'}`}>
        <span className="die__cube" style={{ '--rx': `${rx + rolls * 720}deg`, '--ry': `${ry + rolls * 720}deg` } as CSSProperties}>
          {[1, 2, 3, 4, 5, 6].map((face) =>
            kind === 'zahl' ? (
              <span key={face} className={`die__face die__face--${face}`}>
                {Array.from({ length: 9 }, (_, cell) => (
                  <i key={cell} className={PIPS[face]!.includes(cell) ? 'is-pip' : ''} />
                ))}
              </span>
            ) : (
              <span key={face} className={`die__face die__face--${face} die__face--colour`} style={{ '--c': HOLES[face - 1]!.color } as CSSProperties} />
            ),
          )}
        </span>
      </span>
      <span className="die__shadow" />
    </span>
  );
}
