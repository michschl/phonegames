/*
 * Changes of page with a sense of place (View Transitions API, see global.css):
 *
 *  - tabs and the switches of an area slide to the side the finger went («right» = the new page comes from the right),
 *  - «Zurück» brings the page before back from the left,
 *  - the picture of the game that was tapped flies into the start card of its page.
 *
 * Where the browser has no view transitions the page simply changes.
 */

export type Move = 'left' | 'right' | 'back';

let timer = 0;

/** How the next change of page moves. Call right before navigating. */
export function nextMove(move: Move): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.vt = move;
  window.clearTimeout(timer);
  // Long enough for the transition, short enough not to colour the navigation after it.
  timer = window.setTimeout(() => delete root.dataset.vt, 900);
}

/** The pictures that can fly: the art of a game on a tile, a row, a small card or the big card. */
const ART = '.game-row__art, .mini-card__art, .hero-card__art, .game-tile__art > :first-child, .solo-tile__cover';

let tagged: HTMLElement | null = null;

function fly(link: Element): void {
  if (tagged) tagged.style.viewTransitionName = '';
  // The whole tile of an Arena game grows into its page; elsewhere the picture does.
  const art = link.matches('.arena-tile') ? (link as HTMLElement) : link.querySelector<HTMLElement>(ART);
  tagged = art;
  if (!art) return;
  art.style.viewTransitionName = 'game-art';
  // Still here after a second (opened in a new tab, navigation cancelled): no longer special.
  window.setTimeout(() => {
    if (tagged !== art) return;
    art.style.viewTransitionName = '';
    tagged = null;
  }, 1200);
}

/** Once, at the start of the app. */
export function installTransitions(): void {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) return;
  // Before the router handles the click: the old picture is photographed with its name.
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href^="/spiel/"], a[href^="/allein/"], a[href^="/arena/"]');
      if (link) fly(link);
    },
    true,
  );
  // The back button or gesture of the browser moves like «Zurück» in the app.
  window.addEventListener('popstate', () => nextMove('back'));
}

/** The cards that lean towards the finger while pressed (components.css, «Living cards»). */
const LEANING = '.game-tile, .hero-card, .solo-tile, .arena-tile';

/** Once, at the start of the app: tells a pressed card where the finger is. */
export function installLeaning(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'pointerdown',
    (event) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>(LEANING);
      if (!card) return;
      const box = card.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      card.style.setProperty('--px', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(2));
      card.style.setProperty('--py', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(2));
    },
    { capture: true, passive: true },
  );
}
