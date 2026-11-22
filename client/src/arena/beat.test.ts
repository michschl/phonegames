import { describe, expect, it } from 'vitest';
import { beatStars, judge, makeSong, multiplier, points, sectionAt, STYLES } from './beat.ts';

describe('Beat-Bahn', () => {
  it('makes a song of about 80 seconds with notes on four lanes, in order and never two at once', () => {
    for (let s = 0; s < STYLES.length; s++) {
      const song = makeSong(s, 7);
      expect(song.length).toBeGreaterThan(60);
      expect(song.length).toBeLessThan(100);
      expect(song.notes.length).toBeGreaterThan(60);
      for (let i = 1; i < song.notes.length; i++) expect(song.notes[i]!.time).toBeGreaterThan(song.notes[i - 1]!.time);
      expect(new Set(song.notes.map((n) => n.lane))).toEqual(new Set([0, 1, 2, 3]));
      expect(makeSong(s, 7).notes).toEqual(song.notes);
    }
    const song = makeSong(0, 1);
    expect(sectionAt(song, 0)).toBe('intro');
    expect(sectionAt(song, song.length - 2)).toBe('outro');
  });

  it('judges the timing and rewards streaks', () => {
    expect([judge(0.02), judge(-0.1), judge(0.2)]).toEqual(['perfekt', 'gut', 'daneben']);
    expect([multiplier(0), multiplier(10), multiplier(35)]).toEqual([1, 2, 4]);
    expect(points('perfekt', 20)).toBe(900);
    expect(beatStars(90, 0, 100)).toBe(3);
    expect(beatStars(20, 20, 100)).toBe(0);
  });
});
