/*
 * Kettenreaktion: a side view of a board with blocks; the player places ramps, springs, planks and dominoes,
 * then lets the ball go. The simulation (the same for the game and the tests), the levels with a proven
 * solution each, and the score. Pure functions, see chain.test.ts.
 *
 * Map characters (rows top to bottom):
 * `.` free (you may build here), `:` free (no building), `#` block, `o` ball that is released on start,
 * `O` ball lying on the floor, `G` goal, `*` star, `/` `\` fixed ramp, `=` fixed plank, `^` fixed spring,
 * `d` fixed domino, `b` button (opens all gates), `g` gate.
 */

export type PartKind = 'rampe' | 'feder' | 'brett' | 'domino';

export interface Placement {
  col: number;
  row: number;
  kind: PartKind;
  /** Ramps: false = `/` (rises to the right), true = `\` (falls to the right). */
  flip?: boolean;
}

export interface ChainLevel {
  name: string;
  map: string[];
  parts: Partial<Record<PartKind, number>>;
  /** A placement that reaches the goal and collects every star – proves the level can be solved. */
  solution: Placement[];
}

export const PART_KINDS: PartKind[] = ['rampe', 'feder', 'brett', 'domino'];

export const G = 18;
export const BALL_R = 0.28;
export const DOMINO_H = 1.4;
const DOMINO_T = 0.09;
const SPRING_V = 12.5;
const SPRING_VX = 2;
export const STEP_SECONDS = 1 / 240;
export const MAX_SECONDS = 30;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  /** Waiting for the start (the released ball). */
  held: boolean;
  /** The ball that is released (the others lie on the board). */
  main: boolean;
  out: boolean;
  /** Arrived in a goal. */
  home: boolean;
}

export interface Domino {
  col: number;
  row: number;
  /** Middle of the base. */
  x: number;
  y: number;
  dir: -1 | 0 | 1;
  a: number;
  w: number;
  state: 'stand' | 'fall' | 'rest';
  fixed: boolean;
}

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  kind: 'ramp' | 'plank' | 'spring';
  col: number;
  row: number;
}

export type ChainEvent =
  | { type: 'bump'; strength: number }
  | { type: 'spring'; col: number; row: number }
  | { type: 'domino' }
  | { type: 'star'; index: number }
  | { type: 'button' }
  | { type: 'goal'; index: number };

export interface World {
  cols: number;
  rows: number;
  /** 1 = block, 2 = closed gate, per cell (row 0 at the top). */
  solid: Uint8Array;
  segs: Seg[];
  dominoes: Domino[];
  balls: Ball[];
  stars: { x: number; y: number; taken: boolean }[];
  goals: { col: number; row: number; done: boolean }[];
  buttons: { col: number; row: number }[];
  pressed: boolean;
  lastSpring: number;
  hops: number;
  springs: number;
  time: number;
  still: number;
  status: 'edit' | 'run' | 'goal' | 'fail';
  reason?: 'out' | 'stuck' | 'time';
  events: ChainEvent[];
}

/** World y of a cell's bottom edge (rows count from the top, y upwards). */
export const cellY = (rows: number, row: number) => rows - 1 - row;

const at = (level: ChainLevel, col: number, row: number) => level.map[row]?.[col] ?? '#';

/** May the part go into this cell (with these other parts already placed)? */
export function canPlace(level: ChainLevel, placed: Placement[], col: number, row: number, kind: PartKind): boolean {
  if (at(level, col, row) !== '.') return false;
  if (placed.some((p) => p.col === col && p.row === row)) return false;
  if (kind === 'feder' || kind === 'domino') {
    // They stand on a block; a domino also needs room above it.
    if (at(level, col, row + 1) !== '#') return false;
    if (kind === 'domino' && '#g'.includes(at(level, col, row - 1))) return false;
  }
  return true;
}

function segFor(kind: PartKind | 'ramp/' | 'ramp\\', x: number, y: number, col: number, row: number): Seg {
  switch (kind) {
    case 'ramp/':
      return { ax: x, ay: y, bx: x + 1, by: y + 1, r: 0.07, kind: 'ramp', col, row };
    case 'ramp\\':
      return { ax: x, ay: y + 1, bx: x + 1, by: y, r: 0.07, kind: 'ramp', col, row };
    case 'brett':
      return { ax: x, ay: y + 0.04, bx: x + 1, by: y + 0.04, r: 0.06, kind: 'plank', col, row };
    default:
      return { ax: x + 0.22, ay: y + 0.14, bx: x + 0.78, by: y + 0.14, r: 0.07, kind: 'spring', col, row };
  }
}

/** Builds the world for a level with the player's parts; balls wait until `release`. */
export function createWorld(level: ChainLevel, placed: Placement[]): World {
  const rows = level.map.length;
  const cols = Math.max(...level.map.map((r) => r.length));
  const w: World = {
    cols,
    rows,
    solid: new Uint8Array(cols * rows),
    segs: [],
    dominoes: [],
    balls: [],
    stars: [],
    goals: [],
    buttons: [],
    pressed: false,
    lastSpring: -1,
    hops: 0,
    springs: 0,
    time: 0,
    still: 0,
    status: 'edit',
    events: [],
  };
  const domino = (col: number, row: number, fixed: boolean) =>
    w.dominoes.push({ col, row, x: col + 0.5, y: cellY(rows, row), dir: 0, a: 0, w: 0, state: 'stand', fixed });
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = at(level, col, row);
      const x = col;
      const y = cellY(rows, row);
      if (ch === '#') w.solid[row * cols + col] = 1;
      else if (ch === 'g') w.solid[row * cols + col] = 2;
      else if (ch === 'o') w.balls.push({ x: x + 0.5, y: y + 0.5, vx: 0, vy: 0, spin: 0, held: true, main: true, out: false, home: false });
      else if (ch === 'O') w.balls.push({ x: x + 0.5, y: y + BALL_R, vx: 0, vy: 0, spin: 0, held: false, main: false, out: false, home: false });
      else if (ch === 'G') w.goals.push({ col, row, done: false });
      else if (ch === '*') w.stars.push({ x: x + 0.5, y: y + 0.5, taken: false });
      else if (ch === 'b') w.buttons.push({ col, row });
      else if (ch === '/') w.segs.push(segFor('ramp/', x, y, col, row));
      else if (ch === '\\') w.segs.push(segFor('ramp\\', x, y, col, row));
      else if (ch === '=') w.segs.push(segFor('brett', x, y, col, row));
      else if (ch === '^') w.segs.push(segFor('feder', x, y, col, row));
      else if (ch === 'd') domino(col, row, true);
    }
  }
  for (const p of placed) {
    const x = p.col;
    const y = cellY(rows, p.row);
    if (p.kind === 'domino') domino(p.col, p.row, false);
    else if (p.kind === 'rampe') w.segs.push(segFor(p.flip ? 'ramp\\' : 'ramp/', x, y, p.col, p.row));
    else w.segs.push(segFor(p.kind, x, y, p.col, p.row));
  }
  return w;
}

export function release(w: World) {
  for (const b of w.balls) b.held = false;
  w.status = 'run';
}

/** The tip of a domino. */
export function dominoTip(d: Domino): [number, number] {
  const px = d.x + d.dir * DOMINO_T;
  return [px + d.dir * DOMINO_H * Math.sin(d.a), d.y + DOMINO_H * Math.cos(d.a)];
}

function closestOnSeg(px: number, py: number, s: { ax: number; ay: number; bx: number; by: number }): [number, number, number] {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  return [s.ax + dx * t, s.ay + dy * t, t];
}

function isSolid(w: World, col: number, row: number): boolean {
  if (col < 0 || col >= w.cols || row < 0 || row >= w.rows) return false;
  return w.solid[row * w.cols + col]! > 0;
}

function solidAt(w: World, x: number, y: number): boolean {
  return isSolid(w, Math.floor(x), w.rows - 1 - Math.floor(y));
}

/** Pushes a ball out of a contact and bounces it; (sx, sy) is the velocity of the surface. */
function contact(b: Ball, qx: number, qy: number, reach: number, e: number, sx = 0, sy = 0): { nx: number; ny: number; impact: number } | null {
  let nx = b.x - qx;
  let ny = b.y - qy;
  const d = Math.hypot(nx, ny);
  if (d >= reach) return null;
  if (d < 1e-6) {
    nx = 0;
    ny = 1;
  } else {
    nx /= d;
    ny /= d;
  }
  b.x += nx * (reach - d);
  b.y += ny * (reach - d);
  const rvx = b.vx - sx;
  const rvy = b.vy - sy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
  }
  return { nx, ny, impact: Math.max(0, -vn) };
}

function bump(w: World, impact: number) {
  if (impact > 2.5) w.events.push({ type: 'bump', strength: Math.min(1, impact / 12) });
}

function stepBall(w: World, b: Ball, dt: number) {
  b.vy -= G * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  let grounded = false;
  // Blocks and closed gates around the ball.
  const c0 = Math.floor(b.x - BALL_R);
  const c1 = Math.floor(b.x + BALL_R);
  const y0 = Math.floor(b.y - BALL_R);
  const y1 = Math.floor(b.y + BALL_R);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      if (!isSolid(w, cx, w.rows - 1 - cy)) continue;
      const qx = Math.max(cx, Math.min(cx + 1, b.x));
      const qy = Math.max(cy, Math.min(cy + 1, b.y));
      const hit = contact(b, qx, qy, BALL_R, 0.3);
      if (hit) {
        bump(w, hit.impact);
        if (hit.ny > 0.5) grounded = true;
      }
    }
  }
  for (const s of w.segs) {
    if (b.x < Math.min(s.ax, s.bx) - 0.6 || b.x > Math.max(s.ax, s.bx) + 0.6 || b.y < Math.min(s.ay, s.by) - 0.6 || b.y > Math.max(s.ay, s.by) + 0.6) continue;
    const [qx, qy] = closestOnSeg(b.x, b.y, s);
    const vx = b.vx;
    const hit = contact(b, qx, qy, BALL_R + s.r, s.kind === 'spring' ? 0 : 0.2);
    if (!hit) continue;
    if (s.kind === 'spring' && hit.ny > 0.3) {
      // A spring always jumps the same: high, and only a little on in the direction the ball came from – so jumps can be planned.
      b.vy = SPRING_V;
      b.vx = Math.abs(vx) < 0.3 ? 0 : Math.sign(vx) * SPRING_VX;
      // Hopping on the same spring again and again leads nowhere.
      const key = s.row * w.cols + s.col;
      w.hops = w.lastSpring === key ? w.hops + 1 : 1;
      w.springs++;
      w.lastSpring = key;
      w.events.push({ type: 'spring', col: s.col, row: s.row });
    } else {
      bump(w, hit.impact);
      if (hit.ny > 0.5) grounded = true;
    }
  }
  for (const d of w.dominoes) {
    const px = d.x + d.dir * DOMINO_T;
    const [tx, ty] = dominoTip(d);
    const seg = { ax: px, ay: d.y + 0.02, bx: tx, by: ty };
    if (b.x < Math.min(seg.ax, seg.bx) - 0.6 || b.x > Math.max(seg.ax, seg.bx) + 0.6 || b.y < Math.min(seg.ay, seg.by) - 0.6 || b.y > Math.max(seg.ay, seg.by) + 0.6) continue;
    const [qx, qy] = closestOnSeg(b.x, b.y, seg);
    let sx = 0;
    let sy = 0;
    if (d.state === 'fall') {
      // A falling domino pushes with the speed of the point that touches.
      // (A light domino hands on only part of its speed to the heavier ball.)
      const l = Math.hypot(qx - px, qy - d.y) * 0.4;
      sx = d.w * d.dir * l * Math.cos(d.a);
      sy = -d.w * l * Math.sin(d.a);
    }
    const hit = contact(b, qx, qy, BALL_R + DOMINO_T, d.state === 'fall' ? 0 : 0.25, sx, sy);
    if (!hit) continue;
    if (hit.ny > 0.5) grounded = true;
    if (d.state === 'stand' && hit.impact > 0.8) {
      d.dir = b.x < d.x ? 1 : -1;
      d.state = 'fall';
      d.w = Math.min(5, 1 + hit.impact * 0.35);
      w.events.push({ type: 'domino' });
    }
  }
  // The board is a box: walls left and right.
  if (b.x < BALL_R) contact(b, 0, b.y, BALL_R, 0.3);
  if (b.x > w.cols - BALL_R) contact(b, w.cols, b.y, BALL_R, 0.3);
  if (grounded) {
    const damp = Math.max(0, 1 - 0.25 * dt);
    b.vx *= damp;
  }
  b.spin -= (b.vx / BALL_R) * dt;
  if (b.y < -2) b.out = true;
}

function stepDomino(w: World, d: Domino, dt: number) {
  if (d.state !== 'fall') return;
  d.w += ((3 * G) / (2 * DOMINO_H)) * Math.sin(Math.max(0.08, d.a)) * dt;
  d.a += d.w * dt;
  const [tx, ty] = dominoTip(d);
  // The next domino in the falling direction gets pushed and holds this one.
  for (const o of w.dominoes) {
    if (o === d || o.state === 'fall' || Math.abs(o.y - d.y) > 0.5) continue;
    const ahead = d.dir * (o.x - d.x);
    if (ahead <= 0 || ahead > DOMINO_H + 0.2) continue;
    if (d.dir * (tx - o.x) >= -DOMINO_T * 2 && ty <= o.y + DOMINO_H) {
      if (o.state === 'stand') {
        o.dir = d.dir;
        o.state = 'fall';
        o.w = Math.max(1.5, d.w * 0.8);
        w.events.push({ type: 'domino' });
      }
      d.state = 'rest';
      return;
    }
  }
  if (solidAt(w, tx, ty) || d.a >= Math.PI / 2) {
    if (d.a >= Math.PI / 2) d.a = Math.PI / 2;
    d.state = 'rest';
    w.events.push({ type: 'bump', strength: 0.4 });
  }
  pressButtons(w, tx, ty);
}

function pressButtons(w: World, x: number, y: number) {
  if (w.pressed) return;
  for (const btn of w.buttons) {
    const by = cellY(w.rows, btn.row);
    if (x > btn.col && x < btn.col + 1 && y >= by - 0.05 && y < by + 0.5) {
      w.pressed = true;
      w.events.push({ type: 'button' });
      for (let i = 0; i < w.solid.length; i++) if (w.solid[i] === 2) w.solid[i] = 0;
      return;
    }
  }
}

function collideBalls(w: World) {
  const live = w.balls.filter((b) => !b.held && !b.out && !b.home);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= BALL_R * 2 || d < 1e-6) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (BALL_R * 2 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const j2 = -vn * 0.95;
        a.vx -= j2 * nx;
        a.vy -= j2 * ny;
        b.vx += j2 * nx;
        b.vy += j2 * ny;
        bump(w, -vn);
      }
    }
  }
}

/** One step of the simulation; sets `status` when it ends. */
export function stepWorld(w: World, dt = STEP_SECONDS) {
  if (w.status !== 'run') return;
  w.time += dt;
  for (const d of w.dominoes) stepDomino(w, d, dt);
  let moving = w.dominoes.some((d) => d.state === 'fall');
  for (const b of w.balls) {
    if (b.held || b.out || b.home) continue;
    stepBall(w, b, dt);
    if (Math.hypot(b.vx, b.vy) > 0.25) moving = true;
    pressButtons(w, b.x, b.y);
    w.stars.forEach((s, index) => {
      if (!s.taken && Math.hypot(s.x - b.x, s.y - b.y) < 0.5) {
        s.taken = true;
        w.events.push({ type: 'star', index });
      }
    });
    w.goals.forEach((g, index) => {
      const gy = cellY(w.rows, g.row);
      if (!g.done && b.x > g.col && b.x < g.col + 1 && b.y > gy && b.y < gy + 1) {
        g.done = true;
        b.home = true;
        b.x = g.col + 0.5;
        b.y = gy + 0.42;
        w.events.push({ type: 'goal', index });
      }
    });
  }
  collideBalls(w);
  if (w.goals.length > 0 && w.goals.every((g) => g.done)) {
    w.status = 'goal';
    return;
  }
  if (w.balls.every((b) => b.out || b.home)) {
    w.status = 'fail';
    w.reason = 'out';
    return;
  }
  w.still = moving ? 0 : w.still + dt;
  if (w.still > 1.2 || w.hops > 3 || w.springs > 12) {
    w.status = 'fail';
    w.reason = 'stuck';
  } else if (w.time > MAX_SECONDS) {
    w.status = 'fail';
    w.reason = 'time';
  }
}

/** Runs a level with these parts to the end. */
export function runChain(level: ChainLevel, placed: Placement[]): { status: 'goal' | 'fail'; reason?: World['reason']; stars: number; time: number } {
  const w = createWorld(level, placed);
  release(w);
  while (w.status === 'run') {
    stepWorld(w);
    w.events.length = 0;
  }
  return { status: w.status as 'goal' | 'fail', reason: w.reason, stars: w.stars.filter((s) => s.taken).length, time: w.time };
}

/** Points: a base for the goal, more for stars and parts left over, less for many tries and hints. */
export function chainScore(stars: number, unused: number, attempts: number, hints = 0): number {
  return Math.max(100, Math.round(400 + stars * 250 + unused * 80 - (attempts - 1) * 40 - hints * 60));
}

/** One star for the goal, one for every star collected (up to three). */
export function chainStars(collected: number): number {
  return Math.min(3, 1 + collected);
}

export const CHAIN_LEVELS: ChainLevel[] = [
  {
    name: 'Erste Rampe',
    map: ['.o......', '........', '........', '........', '........', '........', '...*....', '........', '....*...', '........', '......G.', '########'],
    parts: { rampe: 1 },
    solution: [{ col: 1, row: 5, kind: 'rampe', flip: true }],
  },
  {
    name: 'Zickzack',
    map: ['o.......', '........', '........', '######..', '........', '...*....', '..######', '........', '*.......', '........', 'G.......', '########'],
    parts: { rampe: 2 },
    solution: [{ col: 0, row: 2, kind: 'rampe', flip: true }, { col: 7, row: 5, kind: 'rampe' }],
  },
  {
    name: 'Sprungfeder',
    map: ['........', '........', '........', '........', 'o.......', '\\.......', '#\\..*...', '##......', '##...#..', '##...#*.', '##...#.G', '########'],
    parts: { feder: 1 },
    solution: [{ col: 3, row: 10, kind: 'feder' }],
  },
  {
    name: 'Brücke',
    map: ['o.......', '\\.......', '#\\......', '##\\..**G', '###..###', '........', '........', '........', '........', '........', '........', '........'],
    parts: { brett: 2 },
    solution: [{ col: 3, row: 3, kind: 'brett' }, { col: 4, row: 3, kind: 'brett' }],
  },
  {
    name: 'Dominoeffekt',
    map: ['........', '....*...', 'o.......', '\\.......', '#\\*.....', '##.dd..b', '########', '........', '....O...', '....g...', '....G...', '########'],
    parts: { domino: 2, feder: 1 },
    solution: [{ col: 5, row: 5, kind: 'domino' }, { col: 6, row: 5, kind: 'domino' }, { col: 2, row: 5, kind: 'feder' }],
  },
  {
    name: 'Schalter',
    map: ['o.......', '........', '........', '......b.', '###g####', '..#.#...', '..#*#...', '..#.#...', '..#*#...', '..#.#...', '..#G#...', '########'],
    parts: { rampe: 2 },
    solution: [{ col: 0, row: 3, kind: 'rampe', flip: true }, { col: 7, row: 3, kind: 'rampe' }],
  },
  {
    name: 'Treppe',
    map: ['........', '........', '........', '.....*..', '......G.', '......##', '...*..##', '......##', 'o..#####', '\\..#####', '#..#####', '########'],
    parts: { feder: 2 },
    solution: [{ col: 2, row: 10, kind: 'feder' }, { col: 4, row: 7, kind: 'feder' }],
  },
  {
    name: 'Kettenbrücke',
    map: ['........', 'o.......', '\\...*...', '#\\......', '##.d..O.', '##.####.', '#######.', '.......*', '........', '........', '.......G', '########'],
    parts: { domino: 2, feder: 1 },
    solution: [{ col: 4, row: 4, kind: 'domino' }, { col: 5, row: 4, kind: 'domino' }, { col: 2, row: 5, kind: 'feder' }],
  },
  {
    name: 'Schanze',
    map: ['o.......', '\\.......', '#\\......', '##\\.....', '###..*..', '###...*G', '####..##', '####..##', '####..##', '####..##', '####..##', '########'],
    parts: { rampe: 1, brett: 1 },
    solution: [{ col: 3, row: 5, kind: 'rampe' }],
  },
  {
    name: 'Grosse Kette',
    map: ['........', '......O.', '.....#g#', 'o.......', '......*.', '#.....G.', '##.*....', '##...d.b', '##.#####', '##.#####', '##.#####', '########'],
    parts: { rampe: 1, brett: 1, domino: 1 },
    solution: [{ col: 0, row: 4, kind: 'rampe', flip: true }, { col: 2, row: 7, kind: 'brett' }, { col: 6, row: 7, kind: 'domino' }],
  },
];
