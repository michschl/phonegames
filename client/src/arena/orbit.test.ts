import { describe, expect, it } from 'vitest';
import { ORBIT_LEVELS, orbitLevel, orbitScore, orbitStars, simulate, solve } from './orbit.ts';

describe('Orbit', () => {
  it('has 20 levels that can all be solved', () => {
    for (let i = 0; i < ORBIT_LEVELS; i++) {
      const level = orbitLevel(i);
      expect(solve(level), `Level ${i + 1}`).not.toBeNull();
    }
  });

  it('flies straight without planets, crashes into a planet, gets lost far away', () => {
    expect(simulate(orbitLevel(0), 0, -8).outcome).toBe('target');
    expect(simulate(orbitLevel(2), 0, -6).outcome).toBe('crash');
    expect(simulate(orbitLevel(0), 0, 8).outcome).toBe('lost');
  });

  it('scores attempts and time', () => {
    expect(orbitScore(1, 2)).toBeGreaterThan(orbitScore(2, 2));
    expect(orbitScore(20, 20)).toBe(100);
    expect([orbitStars(1), orbitStars(3), orbitStars(6)]).toEqual([3, 2, 1]);
  });
});
