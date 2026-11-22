import { describe, expect, it } from 'vitest';
import { countTask, makeTask, mirror, project, ROTATIONS, rotate, sameShape, seeded, snake, towers, viewTask, type Cube } from './raum.ts';

describe('Raumdenker', () => {
  it('knows the 24 turns of a cube', () => {
    expect(ROTATIONS).toHaveLength(24);
    const shape: Cube[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    for (const m of ROTATIONS) expect(sameShape(shape, rotate(shape, m))).toBe(true);
  });

  it('projects a building: from above, the front and the right', () => {
    const cubes: Cube[] = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 1],
    ];
    expect(project(cubes, 'oben')).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(project(cubes, 'vorne')).toEqual([
      [true, false],
      [true, true],
    ]);
    expect(project(cubes, 'rechts')).toEqual([
      [false, true],
      [true, true],
    ]);
  });

  it('offers four different views with exactly one right one, and counts hidden cubes', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = seeded(seed);
      const task = viewTask(towers(3, 3, rng), rng);
      expect(task.options).toHaveLength(4);
      expect(new Set(task.options.map((o) => JSON.stringify(o))).size).toBe(4);
      expect(task.options[task.answer]).toEqual(project(task.cubes, task.view, task.options[0]!.length));
      const count = countTask(task.cubes, rng);
      expect(count.options).toContain(count.cubes.length);
    }
  });

  it('builds shapes whose mirror image is a different shape', () => {
    for (let seed = 0; seed < 50; seed++) {
      const shape = snake(6, seeded(seed));
      expect(sameShape(shape, mirror(shape))).toBe(false);
    }
    for (let i = 0; i < 12; i++) {
      const task = makeTask(i, seeded(i + 1));
      if (task.kind === 'spiegel') expect(sameShape(task.left, task.right)).toBe(!task.mirrored);
    }
  });
});
