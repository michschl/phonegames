import { describe, expect, it } from 'vitest';
import { mergeRecords, pruneTombstones, TOMBSTONE_TTL_MS } from './sync.ts';

interface Item {
  id: string;
  value: string;
  updatedAt: number;
  deleted: boolean;
}

const item = (id: string, value: string, updatedAt: number, deleted = false): Item => ({ id, value, updatedAt, deleted });

describe('mergeRecords', () => {
  it('keeps the newer version of each record', () => {
    const local = { a: item('a', 'lokal', 200), b: item('b', 'lokal', 100) };
    const merged = mergeRecords(local, [item('a', 'server', 150), item('b', 'server', 300)], (i) => i.id);
    expect(merged.a!.value).toBe('lokal');
    expect(merged.b!.value).toBe('server');
  });

  it('adds unknown records', () => {
    const merged = mergeRecords({}, [item('x', 'neu', 1)], (i) => i.id);
    expect(Object.keys(merged)).toEqual(['x']);
  });

  it('lets a deletion win on equal timestamps', () => {
    const merged = mergeRecords({ a: item('a', 'v', 100) }, [item('a', 'v', 100, true)], (i) => i.id);
    expect(merged.a!.deleted).toBe(true);
  });
});

describe('pruneTombstones', () => {
  it('removes old deletions only', () => {
    const now = Date.now();
    const pruned = pruneTombstones(
      {
        old: item('old', '', now - TOMBSTONE_TTL_MS - 1, true),
        fresh: item('fresh', '', now - 1000, true),
        alive: item('alive', '', 0),
      },
      now,
    );
    expect(Object.keys(pruned).sort()).toEqual(['alive', 'fresh']);
  });
});
