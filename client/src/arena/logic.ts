import { seeded, shuffled } from '../solo/logic.ts';

/*
 * The rules of the Arena games that can be tested without 3D: runs of the Pistenjagd, the levels of the
 * Kugelbahn (always solvable), scores. See logic.test.ts.
 */

export { seeded };

/* ------------------------------------------------------------- Pistenjagd */

export interface Run {
  name: string;
  /** Metres from the start to the finish. */
  length: number;
  /** Half the width of the groomed piste. */
  halfWidth: number;
  /** Top speed in m/s. */
  maxSpeed: number;
  /** A good time in seconds – the stars are measured against it. */
  par: number;
  /** Width of a gate opening in metres. */
  gateWidth: number;
  gateEvery: number;
  obstacleDensity: number;
}

export const RUNS: Run[] = [
  { name: 'Blau', length: 900, halfWidth: 12, maxSpeed: 21, par: 52, gateWidth: 6, gateEvery: 45, obstacleDensity: 0.5 },
  { name: 'Rot', length: 1100, halfWidth: 10, maxSpeed: 25, par: 55, gateWidth: 5, gateEvery: 38, obstacleDensity: 0.8 },
  { name: 'Schwarz', length: 1300, halfWidth: 8, maxSpeed: 29, par: 58, gateWidth: 4.2, gateEvery: 32, obstacleDensity: 1.15 },
];

export interface Gate {
  z: number;
  /** Middle of the opening. */
  x: number;
  color: 'red' | 'blue';
}

export interface Obstacle {
  z: number;
  x: number;
  kind: 'tree' | 'rock';
  /** Collision radius. */
  r: number;
}

export interface Jump {
  z: number;
  x: number;
  halfWidth: number;
}

export interface Course {
  run: Run;
  gates: Gate[];
  obstacles: Obstacle[];
  jumps: Jump[];
  /** Middle of the piste at a distance – the piste winds down the mountain. */
  center(z: number): number;
}

/** A run down the mountain: the piste winds, gates alternate left and right, trees and rocks stay out of the gates. */
export function makeCourse(runIndex: number, seed: number): Course {
  const run = RUNS[runIndex] ?? RUNS[0]!;
  const rng = seeded(seed);
  const a = 6 + rng() * 6;
  const b = 3 + rng() * 4;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const center = (z: number) => a * Math.sin(z / 95 + p1) + b * Math.sin(z / 37 + p2);

  const gates: Gate[] = [];
  let side = rng() < 0.5 ? -1 : 1;
  for (let z = 70; z < run.length - 40; z += run.gateEvery * (0.85 + rng() * 0.3)) {
    const offset = side * (run.halfWidth * (0.25 + rng() * 0.35));
    gates.push({ z, x: center(z) + offset, color: gates.length % 2 === 0 ? 'red' : 'blue' });
    side = -side;
  }

  const jumps: Jump[] = [];
  for (let z = 220; z < run.length - 120; z += 260 + rng() * 140) {
    if (gates.some((g) => Math.abs(g.z - z) < 18)) continue;
    jumps.push({ z, x: center(z), halfWidth: run.halfWidth * 0.8 });
  }

  const obstacles: Obstacle[] = [];
  const free = (z: number, x: number, room: number) =>
    !gates.some((g) => Math.abs(g.z - z) < 10 && Math.abs(g.x - x) < run.gateWidth / 2 + room) && !jumps.some((j) => Math.abs(j.z - z) < 14);
  // Trees along both edges of the piste – the forest.
  for (let z = 20; z < run.length + 60; z += 5 + rng() * 6) {
    for (const s of [-1, 1]) {
      const x = center(z) + s * (run.halfWidth + 2 + rng() * 14);
      obstacles.push({ z, x, kind: 'tree', r: 1.1 });
    }
  }
  // On the piste: a few trees and rocks, more on the harder runs – never inside a gate.
  for (let z = 90; z < run.length - 30; z += 22 / run.obstacleDensity) {
    const x = center(z) + (rng() * 2 - 1) * run.halfWidth * 0.85;
    if (!free(z, x, 2.5)) continue;
    obstacles.push({ z, x, kind: rng() < 0.6 ? 'rock' : 'tree', r: 1.2 });
  }
  return { run, gates, obstacles, jumps, center };
}

/** Points of a run: faster is more, every missed gate counts 3 seconds. */
export function pisteScore(run: Run, seconds: number, missed: number): number {
  const time = seconds + missed * 3;
  return Math.max(0, Math.round((run.par * 3 - time) * 40));
}

export function pisteStars(run: Run, seconds: number, missed: number): number {
  const time = seconds + missed * 3;
  return time <= run.par ? 3 : time <= run.par * 1.25 ? 2 : time <= run.par * 1.6 ? 1 : 0;
}

/* -------------------------------------------------------------- Kugelbahn */

/**
 * A level as rows of characters: `#` floor, `.` nothing (fall!), `W` wall, `S` start, `G` goal,
 * `C` checkpoint, `<>^v` boost, `B` switch, `D` door (closed until the switch is touched).
 */
export type LevelMap = string[];

const INTRO: LevelMap[] = [
  // 1 – just roll to the goal
  ['WWWWWWW', 'W#####W', 'W##S##W', 'W#####W', 'W#####W', 'W#####W', 'W##G##W', 'WWWWWWW'],
  // 2 – a bend, no walls on one side
  ['.......', '.S###..', '.####..', '...##..', '...####', '...####', '.....G#', '.......'],
  // 3 – a narrow bridge
  ['..........', '.S##......', '.###......', '..##......', '..#########', '.........##', '.......C###', '.......##..', '.......#G..'],
  // 4 – boosts
  ['WWWWWWWWWW', 'WS#######W', 'W######>#W', 'WWWWWWW##W', 'W#####<##W', 'W##.......', 'W##.......', 'W#G.......'],
  // 5 – switch and door
  ['WWWWWWWWW', 'WS######W', 'W#######W', 'W##WWWDWW', 'W#BW###.W', 'W##W###.W', 'WWWW#G#.W', 'WWWWWWWWW'],
];

/** Generated levels: a winding path over the void, narrower and with more holes the higher the level. */
function generated(level: number): LevelMap {
  const rng = seeded(1000 + level * 7919);
  const cells = 4 + Math.min(4, Math.floor(level / 5)); // coarse cells per side
  const size = 3; // tiles per cell
  const width = level < 12 ? 3 : 2; // path width in tiles
  // A path through the coarse grid: random walk without revisits.
  const visited = new Set<string>();
  const path: [number, number][] = [];
  let found = false;
  const walk = (cx: number, cy: number) => {
    if (found) return;
    visited.add(`${cx},${cy}`);
    path.push([cx, cy]);
    if (path.length >= Math.min(cells * cells, 6 + level)) {
      found = true;
      return;
    }
    for (const [dx, dy] of shuffled(
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as [number, number][],
      rng,
    )) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells || visited.has(`${nx},${ny}`)) continue;
      walk(nx, ny);
      if (found) return;
    }
    path.pop();
  };
  walk(0, 0);
  const n = cells * size;
  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => '.'));
  const paint = (x: number, y: number, ch = '#') => {
    if (x >= 0 && y >= 0 && x < n && y < n) grid[y]![x] = ch;
  };
  const block = (cx: number, cy: number) => {
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) paint(cx * size + x, cy * size + y);
  };
  for (let i = 0; i < path.length; i++) {
    const [cx, cy] = path[i]!;
    block(cx, cy);
    const next = path[i + 1];
    if (!next) continue;
    // Connect to the next cell.
    const [nx, ny] = next;
    for (let s = 0; s <= size; s++) {
      for (let w = 0; w < width; w++) {
        if (nx !== cx) paint(Math.min(cx, nx) * size + s, cy * size + w);
        else paint(cx * size + w, Math.min(cy, ny) * size + s);
      }
    }
  }
  const [sx, sy] = path[0]!;
  const [gx, gy] = path[path.length - 1]!;
  paint(sx * size, sy * size, 'S');
  paint(gx * size + width - 1, gy * size + width - 1, 'G');
  // Checkpoints every few cells, boosts on straights, holes in wide paths.
  for (let i = 3; i < path.length - 1; i += 4) paint(path[i]![0] * size, path[i]![1] * size, 'C');
  for (let i = 1; i < path.length - 2; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    const [cx2, cy2] = path[i + 1]!;
    if (rng() < 0.25 && ax - bx === bx - cx2 && ay - by === by - cy2) {
      const arrow = cx2 > bx ? '>' : cx2 < bx ? '<' : cy2 > by ? 'v' : '^';
      paint(bx * size + 1, by * size + (width > 2 ? 1 : 0), arrow);
    }
  }
  if (width === 3) {
    for (let i = 2; i < path.length - 1; i++) {
      if (rng() < Math.min(0.5, 0.1 + level * 0.03)) paint(path[i]![0] * size + 1, path[i]![1] * size + 1, '.');
    }
  }
  return grid.map((row) => row.join(''));
}

export const LEVEL_COUNT = 30;

export function kugelLevel(index: number): LevelMap {
  return index < INTRO.length ? INTRO[index]! : generated(index);
}

/** Can the goal be reached from the start (rolling over floor, through doors only once the switch was touched)? */
export function solvable(map: LevelMap): boolean {
  const h = map.length;
  const find = (ch: string): [number, number] | null => {
    for (let y = 0; y < h; y++) {
      const x = map[y]!.indexOf(ch);
      if (x >= 0) return [x, y];
    }
    return null;
  };
  const start = find('S');
  if (!start || !find('G')) return false;
  const walkable = (x: number, y: number, doorsOpen: boolean) => {
    const ch = map[y]?.[x];
    return ch !== undefined && ch !== '.' && ch !== 'W' && (ch !== 'D' || doorsOpen);
  };
  // States: position and whether the switch was touched.
  const seen = new Set<string>();
  const queue: [number, number, boolean][] = [[start[0], start[1], false]];
  while (queue.length > 0) {
    const [x, y, open] = queue.shift()!;
    const key = `${x},${y},${open}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ch = map[y]![x];
    if (ch === 'G') return true;
    const nowOpen = open || ch === 'B';
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (walkable(x + dx, y + dy, nowOpen)) queue.push([x + dx, y + dy, nowOpen]);
    }
  }
  return false;
}

/** Shortest number of tiles from start to goal – for the good time of a level. */
export function pathLength(map: LevelMap): number {
  const h = map.length;
  let start: [number, number] = [0, 0];
  for (let y = 0; y < h; y++) {
    const x = map[y]!.indexOf('S');
    if (x >= 0) start = [x, y];
  }
  const dist = new Map<string, number>([[`${start[0]},${start[1]}`, 0]]);
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const d = dist.get(`${x},${y}`)!;
    if (map[y]![x] === 'G') return d;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ch = map[y + dy]?.[x + dx];
      if (ch === undefined || ch === '.' || ch === 'W' || dist.has(`${x + dx},${y + dy}`)) continue;
      dist.set(`${x + dx},${y + dy}`, d + 1);
      queue.push([x + dx, y + dy]);
    }
  }
  return 20;
}

/** A good time for a level: about 2.5 tiles per second plus some for the switch. */
export function kugelPar(map: LevelMap): number {
  return Math.round(pathLength(map) / 2.5 + (map.some((row) => row.includes('B')) ? 8 : 0) + 4);
}

export function kugelScore(map: LevelMap, seconds: number, falls: number): number {
  const time = seconds + falls * 2;
  return Math.max(100, Math.round((kugelPar(map) * 3 - time) * 50));
}

export function kugelStars(map: LevelMap, seconds: number, falls: number): number {
  const time = seconds + falls * 2;
  const par = kugelPar(map);
  return time <= par ? 3 : time <= par * 1.5 ? 2 : 1;
}
