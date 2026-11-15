import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Device-local preferences (not synchronised). */
interface SettingsState {
  sound: boolean;
  haptics: boolean;
  /** Settings per game, e.g. `{ bombe: { duration: 'mittel', ... } }`. */
  gameSettings: Record<string, unknown>;
  /** Last used player group per game. */
  lastGroupByGame: Record<string, string>;
  setSound(on: boolean): void;
  setHaptics(on: boolean): void;
  setGameSettings(gameId: string, value: unknown): void;
  setLastGroup(gameId: string, groupId: string): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      gameSettings: {},
      lastGroupByGame: {},
      setSound: (sound) => set({ sound }),
      setHaptics: (haptics) => set({ haptics }),
      setGameSettings: (gameId, value) => set((s) => ({ gameSettings: { ...s.gameSettings, [gameId]: value } })),
      setLastGroup: (gameId, groupId) => set((s) => ({ lastGroupByGame: { ...s.lastGroupByGame, [gameId]: groupId } })),
    }),
    { name: 'plausch-settings', version: 1 },
  ),
);

/** Typed accessor for a game's settings with defaults for missing keys. */
export function useGameSettings<T extends object>(gameId: string, defaults: T): [T, (value: T) => void] {
  const stored = useSettings((s) => s.gameSettings[gameId]) as Partial<T> | undefined;
  const setGameSettings = useSettings((s) => s.setGameSettings);
  const value = { ...defaults, ...stored } as T;
  return [value, (next: T) => setGameSettings(gameId, next)];
}
