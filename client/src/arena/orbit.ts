import { seeded, type Rng } from '../solo/logic.ts';

/*
 * Orbit: a probe is launched and pulled by the planets' gravity; it has to reach the target ring without
 * crashing or flying away. Levels, the simulation (the same for the game and the preview) and a search that
 * proves every level can be solved. Pure functions, see orbit.test.ts.
 */

export interface Body {
  x: number;
  z: number;
  r: number;
  /** Pull (mass × G); 0 = an asteroid that only blocks. */
  mass: number;
  color: string;
}

export interface OrbitLevel {
  start: [number, number];
  target: [number, number];
  targetR: number;
  bodies: Body[];
  /** Seconds of the path shown while aiming. */
  preview: number;
}

/** The playing field: x from −W to W, z from −H to H. */
export const W = 10;
export const H = 17;
export const MAX_SPEED = 13;
const STEP = 1 / 120;
const FLIGHT = 14; // seconds until the probe is lost

const COLORS = ['#ff8a3d', '#3a86ff', '#9be15d', '#ff4f6d', '#c7b8ff', '#ffd23f', '#2ec5ff'];

const INTRO: OrbitLevel[] = [
  // 1 – no planet: aim straight
  { start: [0, 13], target: [0, -12], targetR: 1.6, bodies: [], preview: 3 },
  // 2 – one planet bends the path
  { start: [-6, 13], target: [6, -12], targetR: 1.5, bodies: [{ x: 0, z: 0, r: 2.2, mass: 60, color: '#ff8a3d' }], preview: 2.5 },
  // 3 – around the planet
  { start: [0, 13], target: [0, -13], targetR: 1.4, bodies: [{ x: 0, z: 0, r: 3, mass: 90, color: '#3a86ff' }], preview: 2.2 },
  // 4 – two planets
  {
    start: [-7, 14],
    target: [7, -13],
    targetR: 1.4,
    bodies: [
      { x: -2, z: 4, r: 2, mass: 55, color: '#9be15d' },
      { x: 3, z: -5, r: 2.4, mass: 70, color: '#ff4f6d' },
    ],
    preview: 2,
  },
  // 5 – asteroids in the way
  {
    start: [0, 14],
    target: [0, -13],
    targetR: 1.3,
    bodies: [
      { x: 0, z: 0, r: 2.4, mass: 80, color: '#c7b8ff' },
      { x: -4, z: -6, r: 0.8, mass: 0, color: '#8a8396' },
      { x: 4, z: -6, r: 0.8, mass: 0, color: '#8a8396' },
    ],
    preview: 1.8,
  },
];

export const ORBIT_LEVELS = 20;

export type Outcome = 'target' | 'crash' | 'lost';

export interface Probe {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Seconds of one step of the simulation – the game steps with the same size, so it flies the previewed path. */
export const STEP_SECONDS = STEP;

/** One step of the flight; returns how it ended, or null while flying. */
export function step(level: OrbitLevel, p: Probe): Outcome | null {
  let ax = 0;
  let az = 0;
  for (const b of level.bodies) {
    if (b.mass === 0) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const d2 = dx * dx + dz * dz + 0.5;
    const f = b.mass / (d2 * Math.sqrt(d2));
    ax += dx * f;
    az += dz * f;
  }
  p.vx += ax * STEP;
  p.vz += az * STEP;
  p.x += p.vx * STEP;
  p.z += p.vz * STEP;
  if (Math.hypot(p.x - level.target[0], p.z - level.target[1]) < level.targetR) return 'target';
  for (const b of level.bodies) if (Math.hypot(p.x - b.x, p.z - b.z) < b.r + 0.25) return 'crash';
  if (Math.abs(p.x) > W + 4 || Math.abs(p.z) > H + 4) return 'lost';
  return null;
}

/** Flies the probe from the start with a launch velocity; every `sample`-th point is recorded for the path. */
export function simulate(level: OrbitLevel, vx: number, vz: number, seconds = FLIGHT, sample = 6): { outcome: Outcome; path: [number, number][]; time: number } {
  const p: Probe = { x: level.start[0], z: level.start[1], vx, vz };
  const path: [number, number][] = [[p.x, p.z]];
  const steps = Math.round(seconds / STEP);
  for (let i = 1; i <= steps; i++) {
    const outcome = step(level, p);
    if (i % sample === 0 || outcome) path.push([p.x, p.z]);
    if (outcome) return { outcome, path, time: i * STEP };
  }
  return { outcome: 'lost', path, time: seconds };
}

export const FLIGHT_SECONDS = FLIGHT;

/** A launch that reaches the target, if there is one (a search over directions and strengths). */
export function solve(level: OrbitLevel): [number, number] | null {
  for (let p = 4; p <= 12; p++) {
    const speed = (MAX_SPEED * p) / 12;
    for (let a = 0; a < 96; a++) {
      const angle = (a / 96) * Math.PI * 2;
      const vx = Math.cos(angle) * speed;
      const vz = Math.sin(angle) * speed;
      if (simulate(level, vx, vz, FLIGHT, 1000).outcome === 'target') return [vx, vz];
    }
  }
  return null;
}

function generated(index: number): OrbitLevel {
  for (let attempt = 0; ; attempt++) {
    const rng: Rng = seeded(7000 + index * 131 + attempt * 9973);
    const start: [number, number] = [(rng() * 2 - 1) * 7, 13 + rng() * 2];
    const target: [number, number] = [(rng() * 2 - 1) * 7, -12 - rng() * 2];
    const planets = 2 + Math.min(3, Math.floor(index / 6));
    const rocks = Math.min(5, Math.floor((index - 4) / 3));
    const bodies: Body[] = [];
    const free = (x: number, z: number, r: number) =>
      Math.hypot(x - start[0], z - start[1]) > r + 3 &&
      Math.hypot(x - target[0], z - target[1]) > r + 2.5 &&
      bodies.every((b) => Math.hypot(b.x - x, b.z - z) > b.r + r + 1.5);
    for (let i = 0, tries = 0; i < planets && tries < 200; tries++) {
      const r = 1.4 + rng() * 1.8;
      const x = (rng() * 2 - 1) * (W - r - 1);
      const z = (rng() * 2 - 1) * (H - 6);
      if (!free(x, z, r)) continue;
      bodies.push({ x, z, r, mass: r * r * (10 + rng() * 10), color: COLORS[(index + i) % COLORS.length]! });
      i++;
    }
    for (let i = 0, tries = 0; i < rocks && tries < 200; tries++) {
      const r = 0.6 + rng() * 0.4;
      const x = (rng() * 2 - 1) * (W - 1);
      const z = (rng() * 2 - 1) * (H - 5);
      if (!free(x, z, r)) continue;
      bodies.push({ x, z, r, mass: 0, color: '#8a8396' });
      i++;
    }
    const level: OrbitLevel = { start, target, targetR: Math.max(0.9, 1.4 - index * 0.025), bodies, preview: Math.max(0.8, 2 - index * 0.06) };
    // A level must be solvable – but not by just flying straight.
    const straight = simulate(level, 0, 0.001, FLIGHT, 1000);
    const dx = target[0] - start[0];
    const dz = target[1] - start[1];
    const len = Math.hypot(dx, dz);
    const direct = simulate(level, (dx / len) * MAX_SPEED * 0.6, (dz / len) * MAX_SPEED * 0.6, FLIGHT, 1000);
    if (straight.outcome !== 'target' && direct.outcome !== 'target' && solve(level)) return level;
    if (attempt > 40) return level;
  }
}

const cache = new Map<number, OrbitLevel>();

export function orbitLevel(index: number): OrbitLevel {
  if (index < INTRO.length) return INTRO[index]!;
  let level = cache.get(index);
  if (!level) {
    level = generated(index);
    cache.set(index, level);
  }
  return level;
}

export function orbitScore(attempts: number, seconds: number): number {
  return Math.max(100, Math.round(1000 - (attempts - 1) * 150 - seconds * 20));
}

export function orbitStars(attempts: number): number {
  return attempts <= 1 ? 3 : attempts <= 3 ? 2 : 1;
}
