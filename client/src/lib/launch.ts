import { sound } from './audio.ts';
import { prefersReducedMotion } from './util.ts';

/*
 * The start of a game, staged: the colours of the game flood the screen from the spot that was tapped,
 * its emoji pops up – and behind that curtain the game is put in place. Then the curtain lifts.
 *
 * Plain DOM and the Web Animations API, so it works where view transitions do not. With «reduced motion»
 * (or without the API, as in tests of single components) the game simply starts.
 */

export interface LaunchLook {
  colors: [string, string];
  emoji?: string;
}

/** Where the finger went down last – the flood starts there. */
let tap: { x: number; y: number; at: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (event) => (tap = { x: event.clientX, y: event.clientY, at: performance.now() }), {
    capture: true,
    passive: true,
  });
}

let running = false;

/**
 * Floods the screen in the look of the game and calls `go` (change the page, start the round) once it is
 * covered. `hold` is how long the emoji stays before the curtain lifts – short for games that start at once.
 */
export function launch(look: LaunchLook, go: () => void, hold = 240): void {
  if (running || prefersReducedMotion() || typeof document === 'undefined' || typeof document.body.animate !== 'function') {
    go();
    return;
  }
  running = true;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const fresh = tap && performance.now() - tap.at < 1500;
  const x = fresh ? tap!.x : width / 2;
  const y = fresh ? tap!.y : height - 80;
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 24;

  const curtain = document.createElement('div');
  curtain.className = 'launch';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.style.setProperty('--g1', look.colors[0]);
  curtain.style.setProperty('--g2', look.colors[1]);
  const ring = document.createElement('span');
  ring.className = 'launch__ring';
  const emoji = document.createElement('span');
  emoji.className = 'launch__emoji';
  emoji.textContent = look.emoji ?? '';
  curtain.append(ring, emoji);
  document.body.append(curtain);

  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    running = false;
    curtain.remove();
  };
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    go();
    // A moment for the game to be drawn behind the curtain, then it lifts.
    window.setTimeout(() => {
      curtain.style.pointerEvents = 'none';
      curtain
        .animate(
          [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.14)' },
          ],
          { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        )
        .finished.then(done, done);
    }, hold);
  };

  sound.whoosh();
  curtain
    .animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${radius}px at ${x}px ${y}px)` }], {
      duration: 430,
      easing: 'cubic-bezier(0.3, 0, 0.15, 1)',
      fill: 'forwards',
    })
    .finished.then(begin, begin);
  ring.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.9 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ],
    { duration: 700, delay: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
  );
  emoji.animate(
    [
      { transform: 'scale(0.2) rotate(-28deg)', opacity: 0 },
      { transform: 'scale(1.18) rotate(7deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ],
    { duration: 480, delay: 110, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'both' },
  );
  // Whatever happens to the animations (tab in the background, …): the game starts and the curtain goes.
  window.setTimeout(begin, 900);
  window.setTimeout(done, 2400);
}
