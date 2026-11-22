/*
 * Golfinsel: the holes of two courses as rows of characters, a check that every hole can be played,
 * and the score. Pure functions, see golf.test.ts.
 *
 * `#` fairway, `.` nothing (the ball falls into the sea), `W` bumper, `S` tee, `H` hole (the cup), `~` sand,
 * `<>^v` conveyor belt, `M` windmill (its blades block now and then), `J` jump ramp (flies over gaps).
 */

export interface Hole {
  map: string[];
  par: number;
}

export const COURSES: { name: string; holes: Hole[] }[] = [
  {
    name: 'Sonneninsel',
    holes: [
      { par: 2, map: ['WWWWW', 'W#H#W', 'W###W', 'W###W', 'W###W', 'W#S#W', 'WWWWW'] },
      { par: 2, map: ['WWWWWWW', 'W##H##W', 'W#####W', 'W###WWW', 'W###W..', 'W#S#W..', 'WWWWW..'] },
      { par: 3, map: ['WWWWWWWWW', 'WS######W', 'W#######W', 'WWWWW~~#W', '....W~~#W', '....W###W', '....WH##W', '....WWWWW'] },
      { par: 2, map: ['.......', '.##H##.', '.#####.', '..###..', '..###..', '..#S#..', '.......'] },
      { par: 3, map: ['WWWWWWW', 'W##H##W', 'W#####W', 'W<<<<<W', 'W#####W', 'W>>>>>W', 'W##S##W', 'WWWWWWW'] },
      { par: 3, map: ['WWWWWWW', 'W##H##W', 'W#####W', 'WWWMWWW', 'W#####W', 'W#####W', 'W##S##W', 'WWWWWWW'] },
      { par: 2, map: ['.#H#.', '.###.', '.....', '.....', '.#J#.', '.###.', '.#S#.'] },
      { par: 3, map: ['WWWWWWWWW', 'W#######W', 'W#WW#WW#W', 'W#######W', 'WWW#H#WWW', '..W###W..', '..W#S#W..', '..WWWWW..'] },
      { par: 4, map: ['WWWWWWWWW', 'WH#~~~##W', 'W##WWW##W', 'W##W.W^^W', 'W##W.W^^W', 'WvvW.W##W', 'Wvv#M###W', 'W#S#####W', 'WWWWWWWWW'] },
    ],
  },
  {
    name: 'Vulkaninsel',
    holes: [
      { par: 2, map: ['..H..', '..#..', '.###.', '..#..', '..#..', '.###.', '..S..'] },
      { par: 3, map: ['WWWWWWWWW', 'W#~~~~~#W', 'W#~~H~~#W', 'W#~~#~~#W', 'W#######W', 'WWWW#WWWW', '...W#W...', '...WSW...', '...WWW...'] },
      { par: 3, map: ['.......', '.#H#...', '.###...', '.###...', '.......', '.......', '.......', '..J....', '..###..', '...S#..'] },
      { par: 3, map: ['WWWWWWWWW', 'W>>>>>>vW', 'W^WWWWWvW', 'W^WH##WvW', 'W^W#WWWvW', 'W^##<<<<W', 'WWWWWWW#W', '......WSW', '......WWW'] },
      { par: 3, map: ['WWWWWWW', 'W##H##W', 'WWWMWWW', 'W#####W', 'WWWMWWW', 'W#####W', 'W##S##W', 'WWWWWWW'] },
      { par: 3, map: ['.#H#.', '.###.', '..#..', '..#..', '.###.', '.###.', '.....', '.....', '.....', '.#J#.', '.#S#.'] },
      { par: 4, map: ['WWWWWWWWWW', 'W#~~~~~~#W', 'W#WWWWWW#W', 'W#W....W#W', 'W#W.H#.W#W', 'W#W.#..W#W', 'W#W.#WWW#W', 'W##M#####W', 'WS#######W', 'WWWWWWWWWW'] },
      { par: 3, map: ['WWWWWWWWW', 'W##H####W', 'W<<<<<<<W', 'W>>>>>>>W', 'W<<<<<<<W', 'W#######W', 'W###S###W', 'WWWWWWWWW'] },
      { par: 4, map: ['...........', '.##H##.....', '.#####.....', '...#.......', '...........', '...J.......', '...######..', '.......#...', '...........', '.......J...', '.....##S##.'] },
    ],
  },
];

export const HOLES = 9;

const PASS = new Set(['#', 'S', 'H', '~', '<', '>', '^', 'v', 'M', 'J']);

function find(map: string[], ch: string): [number, number] | null {
  for (let y = 0; y < map.length; y++) {
    const x = map[y]!.indexOf(ch);
    if (x >= 0) return [x, y];
  }
  return null;
}

/** Can the ball get from the tee to the cup? Over passable tiles; from a jump ramp up to 4 tiles straight over a gap. */
export function playable(map: string[]): boolean {
  const start = find(map, 'S');
  if (!start || !find(map, 'H')) return false;
  const at = (x: number, y: number) => map[y]?.[x];
  const seen = new Set<string>();
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (at(x, y) === 'H') return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (PASS.has(at(x + dx, y + dy) ?? '')) queue.push([x + dx, y + dy]);
      if (at(x, y) === 'J') {
        for (let n = 2; n <= 5; n++) {
          if (PASS.has(at(x + dx * n, y + dy * n) ?? '')) {
            queue.push([x + dx * n, y + dy * n]);
            break;
          }
        }
      }
    }
  }
  return false;
}

/** «Hole in One», «Birdie», «Par», «Bogey» … */
export function strokeName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in One!';
  const diff = strokes - par;
  return diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`;
}

/** Points of a round: per hole 50 for every stroke under par + 4. */
export function golfScore(strokes: number[], course: number): number {
  return strokes.reduce((sum, s, i) => sum + Math.max(0, COURSES[course]!.holes[i]!.par + 4 - s) * 50, 0);
}

export function golfStars(strokes: number[], course: number): number {
  const par = COURSES[course]!.holes.reduce((sum, h) => sum + h.par, 0);
  const total = strokes.reduce((a, b) => a + b, 0);
  return total <= par ? 3 : total <= par + 5 ? 2 : total <= par + 12 ? 1 : 0;
}

/** A hole gives up after this many strokes. */
export const MAX_STROKES = 8;
