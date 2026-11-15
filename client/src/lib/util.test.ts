import { describe, expect, it } from 'vitest';
import { GAMES } from '../games/registry.ts';
import { breakableName } from './util.ts';

describe('breakableName', () => {
  it('marks the word joint of long compound names with a soft hyphen', () => {
    expect(breakableName('Zufallsfinger')).toBe('Zufalls­finger');
    expect(breakableName('Hutspiel-Marathon')).toBe('Hut­spiel-Marathon');
  });

  it('leaves other names untouched', () => {
    expect(breakableName('Nachts im Dorf')).toBe('Nachts im Dorf');
    expect(breakableName('Wer bin ich?')).toBe('Wer bin ich?');
  });

  it('never changes the visible letters of a game name', () => {
    for (const game of GAMES) expect(breakableName(game.name).replaceAll('­', '')).toBe(game.name);
  });
});
