import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mergeRecords, pruneTombstones } from '../../../shared/sync.ts';
import {
  LIMITS,
  type LearnCard,
  type LearnProgress,
  type LearnStack,
  type LibraryItem,
  type Player,
  type PlayerGroup,
  type SyncPayload,
} from '../../../shared/types.ts';
import { kastenStatus, nextProgress, progressId } from '../lib/learn.ts';
import { createId, nextColor, pickRandom, GROUP_EMOJIS } from '../lib/util.ts';

/** A stack as edited by the user – ids are added when saving. */
export interface StackInput {
  title: string;
  subject: string;
  languages: string[];
  cards: (Omit<LearnCard, 'id'> & { id?: string })[];
  suggestedModes: LearnStack['suggestedModes'];
  source: LearnStack['source'];
}

/**
 * Offline-first user data: the game library, the player groups and the learning stacks.
 * Every change is stored locally first and synchronised in the background
 * (see lib/sync.ts). Deletions are kept as tombstones until synced.
 */
interface DataState {
  /** User the local data belongs to – prevents mixing data of different accounts. */
  ownerId: string | null;
  library: Record<string, LibraryItem>;
  groups: Record<string, PlayerGroup>;
  stacks: Record<string, LearnStack>;
  progress: Record<string, LearnProgress>;
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
  /** Creates a stack, or replaces the stack with `id`. */
  saveStack(input: StackInput, id?: string): LearnStack;
  deleteStack(id: string): void;
  /** Moves a card in the person's Kartenkasten after an answer. */
  recordAnswer(stackId: string, player: string, cardId: string, correct: boolean): void;
  resetProgress(stackId: string, player: string): void;
  applyRemote(payload: SyncPayload, sentRevision: number): void;
  resetFor(ownerId: string | null): void;
}

const empty = {
  library: {} as Record<string, LibraryItem>,
  groups: {} as Record<string, PlayerGroup>,
  stacks: {} as Record<string, LearnStack>,
  progress: {} as Record<string, LearnProgress>,
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

      saveStack(input, id) {
        const now = stamp();
        const existing = id ? get().stacks[id] : undefined;
        const stack: LearnStack = {
          id: existing?.id ?? createId(),
          title: input.title.trim().slice(0, LIMITS.stackTitleMax) || 'Neuer Stapel',
          subject: input.subject.trim().slice(0, 40),
          languages: input.languages,
          cards: input.cards.slice(0, LIMITS.cardsPerStack).map((card) => ({
            id: card.id ?? createId(),
            kind: card.kind,
            prompt: card.prompt.trim().slice(0, LIMITS.cardText),
            answer: card.answer.trim().slice(0, LIMITS.cardText),
            accepted: card.accepted.map((a) => a.trim()).filter(Boolean).slice(0, 10),
            distractors: card.distractors.map((d) => d.trim()).filter(Boolean).slice(0, 3),
          })),
          suggestedModes: input.suggestedModes,
          source: existing?.source ?? input.source,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          deleted: false,
        };
        set((s) => ({ stacks: { ...s.stacks, [stack.id]: stack }, revision: s.revision + 1 }));
        return stack;
      },

      deleteStack(id) {
        const stack = get().stacks[id];
        if (!stack || stack.deleted) return;
        const now = stamp();
        // The progress of every person goes with the stack.
        const progress = { ...get().progress };
        for (const entry of Object.values(progress)) {
          if (entry.stackId === id && !entry.deleted) progress[entry.id] = { ...entry, cards: {}, deleted: true, updatedAt: now };
        }
        set((s) => ({
          stacks: { ...s.stacks, [id]: { ...stack, cards: [], deleted: true, updatedAt: now } },
          progress,
          revision: s.revision + 1,
        }));
      },

      recordAnswer(stackId, player, cardId, correct) {
        const id = progressId(stackId, player);
        const current = get().progress[id];
        const entry: LearnProgress = {
          id,
          stackId,
          player: player.trim().slice(0, LIMITS.nameMax),
          cards: { ...(current && !current.deleted ? current.cards : {}) },
          updatedAt: stamp(),
          deleted: false,
        };
        entry.cards[cardId] = nextProgress(entry.cards[cardId], correct);
        set((s) => ({ progress: { ...s.progress, [id]: entry }, revision: s.revision + 1 }));
      },

      resetProgress(stackId, player) {
        const id = progressId(stackId, player);
        const current = get().progress[id];
        if (!current || current.deleted) return;
        set((s) => ({
          progress: { ...s.progress, [id]: { ...current, cards: {}, deleted: true, updatedAt: stamp() } },
          revision: s.revision + 1,
        }));
      },

      applyRemote(payload, sentRevision) {
        set((s) => ({
          library: pruneTombstones(mergeRecords(s.library, payload.library, (i) => i.gameId)),
          groups: pruneTombstones(mergeRecords(s.groups, payload.groups, (g) => g.id)),
          stacks: pruneTombstones(mergeRecords(s.stacks, payload.stacks ?? [], (x) => x.id)),
          progress: pruneTombstones(mergeRecords(s.progress, payload.progress ?? [], (x) => x.id)),
          syncedRevision: Math.max(s.syncedRevision, sentRevision),
          lastSyncAt: Date.now(),
        }));
      },

      resetFor(ownerId) {
        set({ ownerId, ...empty });
      },
    }),
    {
      name: 'phonegames-data',
      version: 1,
      partialize: (s) => ({
        ownerId: s.ownerId,
        library: s.library,
        groups: s.groups,
        stacks: s.stacks,
        progress: s.progress,
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

export function useStacks(): LearnStack[] {
  const stacks = useData((s) => s.stacks);
  return useMemo(
    () =>
      Object.values(stacks)
        .filter((x) => !x.deleted)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [stacks],
  );
}

export function useStack(id: string | null | undefined): LearnStack | undefined {
  return useData((s) => {
    const stack = id ? s.stacks[id] : undefined;
    return stack && !stack.deleted ? stack : undefined;
  });
}

/** What `player` knows of the stack (undefined = nothing learned yet). */
export function useProgress(stackId: string | null | undefined, player: string | null | undefined): LearnProgress | undefined {
  return useData((s) => {
    if (!stackId || !player) return undefined;
    const entry = s.progress[progressId(stackId, player)];
    return entry && !entry.deleted ? entry : undefined;
  });
}

/** Cards due again per stack, summed over everyone learning it – new cards do not count. */
export function useDueByStack(): Record<string, number> {
  const stacks = useData((s) => s.stacks);
  const progress = useData((s) => s.progress);
  return useMemo(() => {
    const now = Date.now();
    const due: Record<string, number> = {};
    for (const entry of Object.values(progress)) {
      const stack = stacks[entry.stackId];
      if (entry.deleted || !stack || stack.deleted) continue;
      due[stack.id] = (due[stack.id] ?? 0) + kastenStatus(stack, entry, now).due;
    }
    return due;
  }, [stacks, progress]);
}

export const useHasPendingChanges = (): boolean => useData((s) => s.revision !== s.syncedRevision);
