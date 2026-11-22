/** Can this device show 3D graphics? Kept apart from engine.ts, so pages can ask without loading three.js. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
