import { seeded, type Rng } from '../solo/logic.ts';

/*
 * Drohnen-Parcours: courses of gates in a city, a forest and a hall, the test whether a gate was flown
 * through, and the score. Pure functions, see drone.test.ts.
 */

export type Vec = [number, number, number];

export interface DroneGate {
  pos: Vec;
  /** Direction the gate faces (radians around the vertical axis) – it is flown through along this direction. */
  yaw: number;
  radius: number;
}

/** A box (building, wall, pillar) or a tree (trunk + crown, as a vertical cylinder). */
export type DroneObstacle = { kind: 'box'; min: Vec; max: Vec; color: string } | { kind: 'tree'; x: number; z: number; r: number; h: number };

export interface DroneCourse {
  name: string;
  gates: DroneGate[];
  obstacles: DroneObstacle[];
  start: Vec;
  startYaw: number;
  /** Limits of the area (x, z from −size to size; y from 0 to ceiling). */
  size: number;
  ceiling: number;
  /** A good time in seconds. */
  par: number;
  indoor: boolean;
}

export const DRONE_COURSES = ['Stadt', 'Wald', 'Halle'] as const;

const BUILDING_COLORS = ['#ffb3c1', '#ffd23f', '#9fe3ff', '#c7b8ff', '#b6f0a8', '#ffc59e'];

function pathPoints(rng: Rng, count: number, step: number, size: number, low: number, high: number): Vec[] {
  // A winding path of points, turning a little each time, kept inside the area.
  const points: Vec[] = [];
  let x = 0;
  let z = size * 0.6;
  let heading = Math.PI; // towards −z
  let y = (low + high) / 2;
  for (let i = 0; i < count; i++) {
    heading += (rng() - 0.5) * 1.4;
    // Steer back towards the middle near the edge.
    const toCentre = Math.atan2(-x, -z);
    if (Math.hypot(x, z) > size * 0.65) heading = heading * 0.5 + toCentre * 0.5;
    x = Math.max(-size * 0.85, Math.min(size * 0.85, x + Math.sin(heading) * step));
    z = Math.max(-size * 0.85, Math.min(size * 0.85, z + Math.cos(heading) * step));
    y = Math.max(low, Math.min(high, y + (rng() - 0.5) * 5));
    points.push([x, y, z]);
  }
  return points;
}

function gatesAlong(points: Vec[], from: Vec, radius: number): DroneGate[] {
  return points.map((p, i) => {
    const prev = i === 0 ? from : points[i - 1]!;
    return { pos: p, yaw: Math.atan2(p[0] - prev[0], p[2] - prev[2]), radius };
  });
}

/** Distance from a point to a segment in the ground plane. */
function distToSegment(px: number, pz: number, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / len));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[2] + t * dz));
}

function nearPath(x: number, z: number, path: Vec[], room: number): boolean {
  for (let i = 1; i < path.length; i++) if (distToSegment(x, z, path[i - 1]!, path[i]!) < room) return true;
  return false;
}

export function makeDroneCourse(index: number, seed: number): DroneCourse {
  const rng = seeded(seed);
  const name = DRONE_COURSES[index] ?? DRONE_COURSES[0];
  if (name === 'Halle') {
    const size = 34;
    const ceiling = 18;
    const points = pathPoints(rng, 14, 11, size * 0.8, 2.5, ceiling - 3);
    const start: Vec = [0, points[0]![1], size - 4];
    const path = [start, ...points];
    const obstacles: DroneObstacle[] = [];
    // Pillars and floating blocks, away from the flight path.
    for (let i = 0; i < 40 && obstacles.length < 22; i++) {
      const x = (rng() * 2 - 1) * (size - 4);
      const z = (rng() * 2 - 1) * (size - 4);
      if (nearPath(x, z, path, 4.5)) continue;
      const w = 1.5 + rng() * 2;
      obstacles.push({ kind: 'box', min: [x - w / 2, 0, z - w / 2], max: [x + w / 2, ceiling, z + w / 2], color: i % 3 === 0 ? '#ff7ad9' : '#7f73b8' });
    }
    return { name, gates: gatesAlong(points, start, 2.4), obstacles, start, startYaw: Math.PI, size, ceiling, par: 46, indoor: true };
  }
  if (name === 'Wald') {
    const size = 70;
    const points = pathPoints(rng, 13, 14, size, 2.5, 9);
    const start: Vec = [0, points[0]![1], size * 0.6 + 8];
    const path = [start, ...points];
    const obstacles: DroneObstacle[] = [];
    for (let i = 0; i < 900 && obstacles.length < 260; i++) {
      const x = (rng() * 2 - 1) * size;
      const z = (rng() * 2 - 1) * size;
      if (nearPath(x, z, path, 3.2)) continue;
      obstacles.push({ kind: 'tree', x, z, r: 1.1 + rng() * 0.6, h: 8 + rng() * 6 });
    }
    return { name, gates: gatesAlong(points, start, 2.6), obstacles, start, startYaw: Math.PI, size, ceiling: 40, par: 52, indoor: false };
  }
  // City: blocks of houses on a grid; the path follows the streets and goes over some roofs.
  const size = 80;
  const points = pathPoints(rng, 14, 15, size, 3, 22);
  const start: Vec = [0, points[0]![1], size * 0.6 + 8];
  const path = [start, ...points];
  const obstacles: DroneObstacle[] = [];
  for (let gx = -size; gx < size; gx += 16) {
    for (let gz = -size; gz < size; gz += 16) {
      const cx = gx + 8;
      const cz = gz + 8;
      if (nearPath(cx, cz, path, 9)) continue;
      const w = 6 + rng() * 4;
      const d = 6 + rng() * 4;
      const h = 8 + rng() * 26;
      obstacles.push({ kind: 'box', min: [cx - w / 2, 0, cz - d / 2], max: [cx + w / 2, h, cz + d / 2], color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)]! });
    }
  }
  return { name, gates: gatesAlong(points, start, 2.8), obstacles, start, startYaw: Math.PI, size, ceiling: 60, par: 50, indoor: false };
}

/**
 * Was the gate flown through between two positions? The segment must cross the gate's plane (in its
 * direction) inside its radius.
 */
export function throughGate(gate: DroneGate, from: Vec, to: Vec): boolean {
  const nx = Math.sin(gate.yaw);
  const nz = Math.cos(gate.yaw);
  const side = (p: Vec) => (p[0] - gate.pos[0]) * nx + (p[2] - gate.pos[2]) * nz;
  const a = side(from);
  const b = side(to);
  if (!(a < 0 && b >= 0)) return false;
  const t = a / (a - b);
  const hit: Vec = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  return Math.hypot(hit[0] - gate.pos[0], hit[1] - gate.pos[1], hit[2] - gate.pos[2]) <= gate.radius;
}

/** Pushes a point out of the obstacles; returns the pushed point and whether it hit something. */
export function collide(course: DroneCourse, p: Vec, r: number): { pos: Vec; hit: boolean } {
  const pos: Vec = [...p];
  let hit = false;
  for (const o of course.obstacles) {
    if (o.kind === 'box') {
      const nx = Math.max(o.min[0], Math.min(pos[0], o.max[0]));
      const ny = Math.max(o.min[1], Math.min(pos[1], o.max[1]));
      const nz = Math.max(o.min[2], Math.min(pos[2], o.max[2]));
      const dx = pos[0] - nx;
      const dy = pos[1] - ny;
      const dz = pos[2] - nz;
      const d = Math.hypot(dx, dy, dz);
      if (d >= r) continue;
      hit = true;
      if (d === 0) {
        pos[1] = o.max[1] + r;
        continue;
      }
      pos[0] = nx + (dx / d) * r;
      pos[1] = ny + (dy / d) * r;
      pos[2] = nz + (dz / d) * r;
    } else {
      if (pos[1] > o.h) continue;
      const dx = pos[0] - o.x;
      const dz = pos[2] - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r * (pos[1] > o.h * 0.35 ? 1.9 * (1 - (pos[1] - o.h * 0.35) / (o.h * 0.65)) + 0.4 : 0.35) + r;
      if (d >= min || d === 0) continue;
      hit = true;
      pos[0] = o.x + (dx / d) * min;
      pos[2] = o.z + (dz / d) * min;
    }
  }
  // The ground, the ceiling (hall) and the edge of the area.
  if (pos[1] < r) pos[1] = r;
  if (pos[1] > course.ceiling - r) pos[1] = course.ceiling - r;
  const limit = course.size + (course.indoor ? -r : 20);
  for (const i of [0, 2] as const) {
    if (Math.abs(pos[i]) > limit) {
      pos[i] = Math.sign(pos[i]) * limit;
      hit = hit || course.indoor;
    }
  }
  return { pos, hit };
}

export function droneScore(course: Pick<DroneCourse, 'par'>, seconds: number): number {
  return Math.max(0, Math.round((course.par * 3 - seconds) * 40));
}

export function droneStars(course: Pick<DroneCourse, 'par'>, seconds: number): number {
  return seconds <= course.par ? 3 : seconds <= course.par * 1.3 ? 2 : seconds <= course.par * 1.8 ? 1 : 0;
}
