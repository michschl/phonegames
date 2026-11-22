import { describe, expect, it } from 'vitest';
import { COURSES, golfScore, golfStars, HOLES, playable, strokeName } from './golf.ts';

describe('Golfinsel', () => {
  it('has two courses of nine playable holes with one tee and one cup', () => {
    for (const course of COURSES) {
      expect(course.holes).toHaveLength(HOLES);
      course.holes.forEach((hole, i) => {
        const text = hole.map.join('');
        expect(text.split('S'), `${course.name} ${i + 1}`).toHaveLength(2);
        expect(text.split('H'), `${course.name} ${i + 1}`).toHaveLength(2);
        expect(playable(hole.map), `${course.name} ${i + 1}`).toBe(true);
      });
    }
  });

  it('names and scores the strokes', () => {
    expect([strokeName(1, 3), strokeName(2, 3), strokeName(3, 3), strokeName(5, 3)]).toEqual(['Hole in One!', 'Birdie!', 'Par', '+2']);
    const par = COURSES[0]!.holes.map((h) => h.par);
    expect(golfScore(par, 0)).toBe(9 * 200);
    expect(golfStars(par, 0)).toBe(3);
    expect(golfStars(par.map((p) => p + 3), 0)).toBe(0);
  });
});
