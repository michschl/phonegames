/**
 * Offline-first synchronisation helpers.
 *
 * Every synced record carries an `updatedAt` timestamp and a `deleted` flag
 * (tombstone). Merging is "last write wins" per record: the version with the
 * newer `updatedAt` survives. The same function is used on the client and in
 * the tests so both sides agree on the outcome.
 */

export interface Versioned {
  updatedAt: number;
  deleted: boolean;
}

/** How long deleted records are kept so that other devices learn about the deletion. */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Merge two collections, keyed by `keyOf`. Returns a new record map.
 * When both sides have the same timestamp the incoming record wins only if it
 * is a deletion, so a delete is never silently undone.
 */
export function mergeRecords<T extends Versioned>(
  current: Record<string, T>,
  incoming: Iterable<T>,
  keyOf: (item: T) => string,
): Record<string, T> {
  const result: Record<string, T> = { ...current };
  for (const item of incoming) {
    const key = keyOf(item);
    const existing = result[key];
    if (shouldReplace(existing, item)) result[key] = item;
  }
  return result;
}

export function shouldReplace<T extends Versioned>(existing: T | undefined, incoming: T): boolean {
  if (!existing) return true;
  if (incoming.updatedAt > existing.updatedAt) return true;
  return incoming.updatedAt === existing.updatedAt && incoming.deleted && !existing.deleted;
}

/** Drop tombstones that are older than the TTL. */
export function pruneTombstones<T extends Versioned>(
  records: Record<string, T>,
  now: number = Date.now(),
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(records)) {
    if (value.deleted && now - value.updatedAt > TOMBSTONE_TTL_MS) continue;
    result[key] = value;
  }
  return result;
}
