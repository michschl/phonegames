/*
 * Works around a WebKit bug in iOS 26: after the on-screen keyboard closes, visualViewport.offsetTop
 * keeps the keyboard's height instead of going back to 0, and everything fixed to the screen – the big
 * start button, the tab bar, sheets – floats that far up, in the middle of the page. While that lasts,
 * those elements are moved back down by the offset (`html.vv-shift` and `--vv-shift`, see global.css).
 * Other browsers keep offsetTop at 0 without keyboard and zoom, so nothing changes there.
 */

/** How far fixed elements have to move down: the stuck offset – only without keyboard and zoom. */
export function viewportShift(offsetTop: number, scale: number, editing: boolean): number {
  if (editing || Math.abs(scale - 1) > 0.01) return 0;
  return offsetTop >= 1 ? Math.round(offsetTop) : 0;
}

const NO_KEYBOARD = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);

/** A field with the on-screen keyboard has the focus. */
function editing(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement) return !NO_KEYBOARD.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
}

export function watchViewport(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let current = 0;
  const update = () => {
    const shift = viewportShift(viewport.offsetTop, viewport.scale, editing());
    if (shift === current) return;
    current = shift;
    root.classList.toggle('vv-shift', shift > 0);
    root.style.setProperty('--vv-shift', `${shift}px`);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  document.addEventListener('focusin', update);
  // The keyboard closes a moment after the field loses the focus.
  document.addEventListener('focusout', () => {
    for (const ms of [60, 350, 800]) window.setTimeout(update, ms);
  });
  update();
}
