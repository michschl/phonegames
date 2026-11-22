import { describe, expect, it } from 'vitest';
import { collide, DRONE_COURSES, droneScore, droneStars, makeDroneCourse, throughGate, type DroneGate } from './drone.ts';

describe('Drohnen-Parcours', () => {
  it('builds three courses with gates that are free of obstacles', () => {
    for (let i = 0; i < DRONE_COURSES.length; i++) {
      for (const seed of [1, 2, 3]) {
        const course = makeDroneCourse(i, seed);
        expect(course.gates.length).toBeGreaterThanOrEqual(12);
        for (const gate of course.gates) {
          const { hit } = collide(course, gate.pos, 0.5);
          expect(hit, `${course.name} ${seed}`).toBe(false);
          expect(gate.pos[1]).toBeLessThan(course.ceiling);
        }
      }
    }
    expect(makeDroneCourse(0, 5).obstacles).toEqual(makeDroneCourse(0, 5).obstacles);
  });

  it('counts a gate only when flown through its middle, in its direction', () => {
    const gate: DroneGate = { pos: [0, 5, 0], yaw: Math.PI, radius: 2 }; // faces −z
    expect(throughGate(gate, [0, 5, 1], [0, 5, -1])).toBe(true);
    expect(throughGate(gate, [0, 5, -1], [0, 5, 1])).toBe(false); // the wrong way
    expect(throughGate(gate, [3, 5, 1], [3, 5, -1])).toBe(false); // beside it
    expect(throughGate(gate, [0.5, 6, 0.4], [0.5, 6, -0.4])).toBe(true);
  });

  it('pushes the drone out of a house and scores the time', () => {
    const course = makeDroneCourse(0, 1);
    const house = course.obstacles.find((o) => o.kind === 'box')!;
    if (house.kind !== 'box') throw new Error('no house');
    const inside: [number, number, number] = [(house.min[0] + house.max[0]) / 2, 2, house.min[2] + 0.1];
    expect(collide(course, inside, 0.5).hit).toBe(true);
    expect(droneScore({ par: 50 }, 40)).toBeGreaterThan(droneScore({ par: 50 }, 60));
    expect(droneStars({ par: 50 }, 49)).toBe(3);
  });
});
