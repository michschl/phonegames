import { describe, expect, it } from 'vitest';
import { viewportShift } from './viewport.ts';

describe('viewportShift (iOS 26: fixed elements after the keyboard)', () => {
  it('moves fixed elements down by an offset that got stuck after the keyboard closed', () => {
    expect(viewportShift(336.4, 1, false)).toBe(336);
  });

  it('leaves them alone normally, while typing and when zoomed in', () => {
    expect(viewportShift(0, 1, false)).toBe(0);
    expect(viewportShift(0.4, 1, false)).toBe(0);
    expect(viewportShift(336, 1, true)).toBe(0);
    expect(viewportShift(120, 1.8, false)).toBe(0);
  });
});
