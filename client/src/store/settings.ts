import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LearnDirection } from '../lib/learn.ts';
import { normalize } from '../lib/util.ts';

/** Device-local preferences (not synchronised). */
interface SettingsState {
  sound: boolean;
  haptics: boolean;
  /** Settings per game, e.g. `{ bombe: { duration: 'mittel', ... } }`. */
  gameSettings: Record<string, unknown>;
  /** Last used player group per game. */
  lastGroupByGame: Record<string, string>;
  /** Most recently started game, shown as «Weiterspielen» on the home screen. */
  lastPlayed: { gameId: string; groupId?: string; at: number } | null;
  /** Preferred narrator voice (voiceURI); null = pick the best one automatically. */
  voiceId: string | null;
  /** Hints that were dismissed on this device, e.g. `passkey:<userId>`. */
  dismissedHints: string[];
  /** Spickzettel: who learned a stack last on this device (stack id → name), and who learned last at all. */
  lastLearnerByStack: Record<string, string>;
  lastLearner: string | null;
  /** Spickzettel: names added as learners on this device that are in no group yet. */
  learnerNames: string[];
  /** Spickzettel: how each person answers in the Kartenkasten (normalised name → mode). */
  learnCheck: Record<string, 'self' | 'choice' | 'type'>;
  /** Lernen: which way the vocabulary of a stack is asked (stack id → direction), «forward» if missing. */
  learnDirection: Record<string, LearnDirection>;
  setSound(on: boolean): void;
  setHaptics(on: boolean): void;
  setGameSettings(gameId: string, value: unknown): void;
  setLastGroup(gameId: string, groupId: string): void;
  setLastPlayed(gameId: string, groupId?: string): void;
  setVoiceId(voiceId: string | null): void;
  dismissHint(key: string): void;
  setLastLearner(stackId: string, name: string): void;
  addLearnerName(name: string): void;
  setLearnCheck(name: string, check: 'self' | 'choice' | 'type'): void;
  setLearnDirection(stackId: string, direction: LearnDirection): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      gameSettings: {},
      lastGroupByGame: {},
      lastPlayed: null,
      voiceId: null,
      dismissedHints: [],
      lastLearnerByStack: {},
      lastLearner: null,
      learnerNames: [],
      learnCheck: {},
      learnDirection: {},
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics }),
      setGameSettings: (gameId, value) => set((s) => ({ gameSettings: { ...s.gameSettings, [gameId]: value } })),
      setLastGroup: (gameId, groupId) => set((s) => ({ lastGroupByGame: { ...s.lastGroupByGame, [gameId]: groupId } })),
      setLastPlayed: (gameId, groupId) => set({ lastPlayed: { gameId, groupId, at: Date.now() } }),
      setVoiceId: (voiceId) => set({ voiceId }),
      dismissHint: (key) => set((s) => ({ dismissedHints: s.dismissedHints.includes(key) ? s.dismissedHints : [...s.dismissedHints, key] })),
      setLastLearner: (stackId, name) =>
        set((s) => ({ lastLearnerByStack: { ...s.lastLearnerByStack, [stackId]: name }, lastLearner: name })),
      setLearnCheck: (name, check) => set((s) => ({ learnCheck: { ...s.learnCheck, [normalize(name)]: check } })),
      setLearnDirection: (stackId, direction) => set((s) => ({ learnDirection: { ...s.learnDirection, [stackId]: direction } })),
      addLearnerName: (name) =>
        set((s) => ({ learnerNames: s.learnerNames.includes(name) ? s.learnerNames : [...s.learnerNames, name].slice(-30) })),
    }),
    { name: 'phonegames-settings', version: 1 },
  ),
);

/** Typed accessor for a game's settings with defaults for missing keys. */
export function useGameSettings<T extends object>(gameId: string, defaults: T): [T, (value: T) => void] {
  const stored = useSettings((s) => s.gameSettings[gameId]) as Partial<T> | undefined;
  const setGameSettings = useSettings((s) => s.setGameSettings);
  const value = { ...defaults, ...stored } as T;
  return [value, (next: T) => setGameSettings(gameId, next)];
}
