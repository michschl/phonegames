/**
 * Draws random cards while avoiding cards that were shown recently. The
 * history is stored per game on the device, so a new evening does not start
 * with the same cards as the last one.
 */
export function drawFresh<T>(
  storageKey: string,
  pool: readonly T[],
  idOf: (item: T) => string,
  options: { exclude?: Iterable<string>; random?: () => number } = {},
): T {
  if (pool.length === 0) throw new Error('drawFresh: empty pool');
  const random = options.random ?? Math.random;
  const exclude = new Set(options.exclude ?? []);
  const recent = new Set(readRecent(storageKey));

  let candidates = pool.filter((item) => !recent.has(idOf(item)) && !exclude.has(idOf(item)));
  if (candidates.length === 0) {
    // Everything was seen recently: forget the history, but still respect `exclude`.
    writeRecent(storageKey, []);
    candidates = pool.filter((item) => !exclude.has(idOf(item)));
    if (candidates.length === 0) candidates = [...pool];
  }

  const item = candidates[Math.floor(random() * candidates.length)]!;
  remember(storageKey, idOf(item), Math.max(10, Math.floor(pool.length * 0.8)));
  return item;
}

function key(storageKey: string): string {
  return `phonegames-recent-${storageKey}`;
}

function readRecent(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(key(storageKey));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecent(storageKey: string, ids: string[]): void {
  try {
    localStorage.setItem(key(storageKey), JSON.stringify(ids));
  } catch {
    /* storage blocked – not critical */
  }
}

function remember(storageKey: string, id: string, max: number): void {
  writeRecent(storageKey, [...readRecent(storageKey).filter((x) => x !== id), id].slice(-max));
}
