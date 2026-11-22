import { useSettings } from '../store/settings.ts';

/** Can this device show 3D graphics? Kept apart from engine.ts, so pages can ask without loading three.js. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * How much the Arena may draw: «auto» starts with all effects and drops them when the phone cannot keep up,
 * «schoen» keeps them on, «schnell» leaves them out (saves battery, for old phones).
 */
export type ArenaGraphics = 'auto' | 'schoen' | 'schnell';

export const ARENA_SETTINGS = 'arena';

export function arenaGraphics(): ArenaGraphics {
  const stored = (useSettings.getState().gameSettings[ARENA_SETTINGS] as { grafik?: string } | undefined)?.grafik;
  return stored === 'schoen' || stored === 'schnell' ? stored : 'auto';
}
