import { pick, seeded, shuffled, type Rng } from '../solo/logic.ts';

/*
 * Raumdenker: buildings of cubes. Three kinds of tasks – which view (top, front, side) belongs to a
 * building, how many cubes it has (hidden ones count), and whether two buildings are the same turned
 * around or mirror images. Pure functions, see raum.test.ts.
 */

export type Cube = [number, number, number]; // x, y (up), z (towards the viewer)

/** A view as a grid: rows from top to bottom, true = filled. */
export type View = boolean[][];

export type ViewName = 'oben' | 'vorne' | 'rechts';

export interface ViewTask {
  kind: 'ansicht';
  cubes: Cube[];
  view: ViewName;
  options: View[];
  answer: number;
}

export interface CountTask {
  kind: 'zaehlen';
  cubes: Cube[];
  options: number[];
  answer: number;
}

export interface MirrorTask {
  kind: 'spiegel';
  left: Cube[];
  right: Cube[];
  /** true = the right one is the left one, mirrored. */
  mirrored: boolean;
}

export type RaumTask = ViewTask | CountTask | MirrorTask;

/** A building on a square: towers of cubes (heights per cell, some cells empty). */
export function towers(size: number, maxHeight: number, rng: Rng): Cube[] {
  const cubes: Cube[] = [];
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      if (rng() < 0.25) continue;
      const h = 1 + Math.floor(rng() * maxHeight);
      for (let y = 0; y < h; y++) cubes.push([x, y, z]);
    }
  }
  return cubes.length > 0 ? cubes : [[0, 0, 0]];
}

const key = (c: Cube) => c.join(',');

function bounds(cubes: Cube[]): { min: Cube; max: Cube } {
  const min: Cube = [Infinity, Infinity, Infinity];
  const max: Cube = [-Infinity, -Infinity, -Infinity];
  for (const c of cubes) for (let i = 0; i < 3; i++) (min[i] = Math.min(min[i]!, c[i]!)), (max[i] = Math.max(max[i]!, c[i]!));
  return { min, max };
}

/** What you see from a side: from above (x across, z down), from the front (x across, y up), from the right (z across, y up). */
export function project(cubes: Cube[], view: ViewName, size?: number): View {
  const { min, max } = bounds(cubes);
  const w = size ?? Math.max(max[0] - min[0], max[2] - min[2], max[1] - min[1]) + 1;
  const grid: View = Array.from({ length: w }, () => Array.from({ length: w }, () => false));
  for (const [x0, y0, z0] of cubes) {
    const x = x0 - min[0];
    const y = y0 - min[1];
    const z = z0 - min[2];
    if (view === 'oben') grid[z]![x] = true;
    else if (view === 'vorne') grid[w - 1 - y]![x] = true;
    else grid[w - 1 - y]![w - 1 - z] = true;
  }
  return grid;
}

const sameView = (a: View, b: View) => JSON.stringify(a) === JSON.stringify(b);

function mirrorView(view: View): View {
  return view.map((row) => [...row].reverse());
}

/** Which view belongs to the building? The others are views from other sides, mirrored or changed by one cube. */
export function viewTask(cubes: Cube[], rng: Rng): ViewTask {
  const view = pick(['oben', 'vorne', 'rechts'] as ViewName[], rng);
  const { min, max } = bounds(cubes);
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 1;
  const right = project(cubes, view, size);
  const candidates: View[] = [
    ...(['oben', 'vorne', 'rechts'] as ViewName[]).filter((v) => v !== view).map((v) => project(cubes, v, size)),
    mirrorView(right),
    right.map((row) => [...row]).reverse(),
  ];
  // One cell more or less.
  for (let i = 0; i < 6; i++) {
    const changed = right.map((row) => [...row]);
    const r = Math.floor(rng() * size);
    const c = Math.floor(rng() * size);
    changed[r]![c] = !changed[r]![c];
    candidates.push(changed);
  }
  const wrong: View[] = [];
  for (const candidate of shuffled(candidates, rng)) {
    if (wrong.length === 3) break;
    if (sameView(candidate, right) || wrong.some((w) => sameView(w, candidate)) || candidate.every((row) => row.every((c) => !c))) continue;
    wrong.push(candidate);
  }
  const options = shuffled([right, ...wrong], rng);
  return { kind: 'ansicht', cubes, view, options, answer: options.indexOf(right) };
}

export function countTask(cubes: Cube[], rng: Rng): CountTask {
  const n = cubes.length;
  const options = shuffled([...new Set([n, n - 1, n + 1, n + 2, n - 2].filter((x) => x > 0))].slice(0, 4), rng);
  return { kind: 'zaehlen', cubes, options, answer: n };
}

/** The 24 turns of a cube (rotation matrices with entries −1, 0, 1). */
export const ROTATIONS: number[][][] = (() => {
  const result: number[][][] = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const p of perms) {
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const m = [0, 1, 2].map((row) => [0, 1, 2].map((col) => (p[row] === col ? [sx, sy, sz][row]! : 0)));
          const det =
            m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
            m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
            m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
          if (det === 1) result.push(m);
        }
      }
    }
  }
  return result;
})();

export function rotate(cubes: Cube[], m: number[][]): Cube[] {
  return cubes.map(([x, y, z]) => [0, 1, 2].map((r) => m[r]![0]! * x + m[r]![1]! * y + m[r]![2]! * z) as Cube);
}

export function mirror(cubes: Cube[]): Cube[] {
  return cubes.map(([x, y, z]) => [-x, y, z]);
}

/** Shape without position: sorted cubes moved to the origin. */
function normal(cubes: Cube[]): string {
  const { min } = bounds(cubes);
  return cubes
    .map(([x, y, z]) => [x - min[0], y - min[1], z - min[2]] as Cube)
    .map(key)
    .sort()
    .join(';');
}

/** Can `b` be turned to look exactly like `a`? */
export function sameShape(a: Cube[], b: Cube[]): boolean {
  const target = normal(a);
  return ROTATIONS.some((m) => normal(rotate(b, m)) === target);
}

/** A chain of cubes with arms in all three directions – so its mirror image is a different shape. */
export function snake(length: number, rng: Rng): Cube[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cubes: Cube[] = [[0, 0, 0]];
    const dirs: Cube[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    let dir = pick(dirs, rng);
    let ok = true;
    while (cubes.length < length && ok) {
      const run = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < run && cubes.length < length; i++) {
        const last = cubes[cubes.length - 1]!;
        const next: Cube = [last[0] + dir[0], last[1] + dir[1], last[2] + dir[2]];
        if (cubes.some((c) => key(c) === key(next))) {
          ok = false;
          break;
        }
        cubes.push(next);
      }
      dir = pick(
        dirs.filter((d) => d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2] === 0),
        rng,
      );
    }
    if (ok && cubes.length === length && !sameShape(cubes, mirror(cubes))) return cubes;
  }
  return [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
  ];
}

export function mirrorTask(length: number, rng: Rng): MirrorTask {
  const left = snake(length, rng);
  const mirrored = rng() < 0.5;
  const base = mirrored ? mirror(left) : left;
  const turned = rotate(base, pick(ROTATIONS.slice(1), rng));
  return { kind: 'spiegel', left, right: turned, mirrored };
}

export const TASKS = 12;

/** The task number `index` (0–11) of a round – small buildings first, mirror images at the end. */
export function makeTask(index: number, rng: Rng = Math.random): RaumTask {
  if (index < 3) return viewTask(towers(3, 2, rng), rng);
  if (index < 5) return countTask(towers(3, 3, rng), rng);
  if (index < 7) return viewTask(towers(3, 3, rng), rng);
  if (index < 9) return index % 2 === 0 ? countTask(towers(4, 3, rng), rng) : mirrorTask(5, rng);
  return index % 2 === 0 ? viewTask(towers(4, 3, rng), rng) : mirrorTask(6 + (index > 10 ? 1 : 0), rng);
}

export { seeded };
