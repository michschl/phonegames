import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mergeRecords, pruneTombstones } from '../../../shared/sync.ts';
import { LIMITS, type LibraryItem, type Player, type PlayerGroup, type SyncPayload } from '../../../shared/types.ts';
import { createId, nextColor, pickRandom, GROUP_EMOJIS } from '../lib/util.ts';

/**
 * Offline-first user data: the game library and the player groups.
 * Every change is stored locally first and synchronised in the background
 * (see lib/sync.ts). Deletions are kept as tombstones until synced.
 */
interface DataState {
  /** User the local data belongs to – prevents mixing data of different accounts. */
  ownerId: string | null;
  library: Record<string, LibraryItem>;
  groups: Record<string, PlayerGroup>;
  /** Incremented on every local change. */
  revision: number;
  /** Revision that was last confirmed by the server. */
  syncedRevision: number;
  lastSyncAt: number | null;

  addGame(gameId: string): void;
  removeGame(gameId: string): void;
  createGroup(input?: { name?: string; emoji?: string; players?: string[] }): PlayerGroup;
  updateGroup(id: string, patch: Partial<Pick<PlayerGroup, 'name' | 'emoji' | 'players'>>): void;
  deleteGroup(id: string): void;
  addPlayer(groupId: string, name: string): Player | null;
  removePlayer(groupId: string, playerId: string): void;
  applyRemote(payload: SyncPayload, sentRevision: number): void;
  resetFor(ownerId: string | null): void;
}

const empty = {
  library: {} as Record<string, LibraryItem>,
  groups: {} as Record<string, PlayerGroup>,
  revision: 0,
  syncedRevision: 0,
  lastSyncAt: null as number | null,
};

/** Monotonic timestamp so that two quick edits never share the same `updatedAt`. */
let lastStamp = 0;
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export function makePlayer(name: string, usedColors: string[]): Player {
  return { id: createId(), name: name.trim().slice(0, LIMITS.nameMax), color: nextColor(usedColors) };
}

export const useData = create<DataState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ...empty,

      addGame(gameId) {
        const existing = get().library[gameId];
        if (existing && !existing.deleted) return;
        const now = stamp();
        set((s) => ({
          library: { ...s.library, [gameId]: { gameId, addedAt: now, updatedAt: now, deleted: false } },
          revision: s.revision + 1,
        }));
      },

      removeGame(gameId) {
        const existing = get().library[gameId];
        if (!existing || existing.deleted) return;
        set((s) => ({
          library: { ...s.library, [gameId]: { ...existing, deleted: true, updatedAt: stamp() } },
          revision: s.revision + 1,
        }));
      },

      createGroup(input = {}) {
        const now = stamp();
        const players: Player[] = [];
        for (const name of input.players ?? []) {
          if (name.trim()) players.push(makePlayer(name, players.map((p) => p.color)));
        }
        const count = Object.values(get().groups).filter((g) => !g.deleted).length;
        const group: PlayerGroup = {
          id: createId(),
          name: input.name?.trim() || `Spielgruppe ${count + 1}`,
          emoji: input.emoji ?? pickRandom(GROUP_EMOJIS),
          players,
          createdAt: now,
          updatedAt: now,
          deleted: false,
        };
        set((s) => ({ groups: { ...s.groups, [group.id]: group }, revision: s.revision + 1 }));
        return group;
      },

      updateGroup(id, patch) {
        const group = get().groups[id];
        if (!group || group.deleted) return;
        set((s) => ({
          groups: { ...s.groups, [id]: { ...group, ...patch, updatedAt: stamp() } },
          revision: s.revision + 1,
        }));
      },

      deleteGroup(id) {
        const group = get().groups[id];
        if (!group || group.deleted) return;
        set((s) => ({
          groups: { ...s.groups, [id]: { ...group, players: [], deleted: true, updatedAt: stamp() } },
          revision: s.revision + 1,
        }));
      },

      addPlayer(groupId, name) {
        const group = get().groups[groupId];
        const trimmed = name.trim();
        if (!group || !trimmed || group.players.length >= LIMITS.playersPerGroup) return null;
        const player = makePlayer(
          trimmed,
          group.players.map((p) => p.color),
        );
        get().updateGroup(groupId, { players: [...group.players, player] });
        return player;
      },

      removePlayer(groupId, playerId) {
        const group = get().groups[groupId];
        if (!group) return;
        get().updateGroup(groupId, { players: group.players.filter((p) => p.id !== playerId) });
      },

      applyRemote(payload, sentRevision) {
        set((s) => ({
          library: pruneTombstones(mergeRecords(s.library, payload.library, (i) => i.gameId)),
          groups: pruneTombstones(mergeRecords(s.groups, payload.groups, (g) => g.id)),
          syncedRevision: Math.max(s.syncedRevision, sentRevision),
          lastSyncAt: Date.now(),
        }));
      },

      resetFor(ownerId) {
        set({ ownerId, ...empty });
      },
    }),
    {
      name: 'plausch-data',
      version: 1,
      partialize: (s) => ({
        ownerId: s.ownerId,
        library: s.library,
        groups: s.groups,
        revision: s.revision,
        syncedRevision: s.syncedRevision,
        lastSyncAt: s.lastSyncAt,
      }),
    },
  ),
);

/* ------------------------------------------------------------- selectors */

/** Game ids in "Meine Spiele", oldest first. */
export function useLibraryIds(): string[] {
  const library = useData((s) => s.library);
  return useMemo(
    () =>
      Object.values(library)
        .filter((item) => !item.deleted)
        .sort((a, b) => a.addedAt - b.addedAt)
        .map((item) => item.gameId),
    [library],
  );
}

export function useGroups(): PlayerGroup[] {
  const groups = useData((s) => s.groups);
  return useMemo(
    () =>
      Object.values(groups)
        .filter((g) => !g.deleted)
        .sort((a, b) => a.createdAt - b.createdAt),
    [groups],
  );
}

export function useGroup(id: string | undefined): PlayerGroup | undefined {
  return useData((s) => {
    const group = id ? s.groups[id] : undefined;
    return group && !group.deleted ? group : undefined;
  });
}

export const useHasPendingChanges = (): boolean => useData((s) => s.revision !== s.syncedRevision);
