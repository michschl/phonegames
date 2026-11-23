import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useArenaScene } from '../engine.ts';
import { Confetti, environmentFrom, glow, grainTexture, hdr, Particles, Shake, Sky, softDot, Trail, Water, type SkyLook, type WaterLook } from '../fx.ts';
import { COURSES, golfScore, golfStars, HOLES, MAX_STROKES, strokeName } from '../golf.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Golfinsel: minigolf on islands floating over the sea. Pull back from anywhere like a slingshot and let
 * go – the further, the harder. Bumpers bounce, sand brakes, belts push, windmill blades block now and
 * then, ramps jump gaps; over the edge it is one stroke more.
 */

const R = 0.17;

/** The look of a course: a sunny island over a turquoise sea, or basalt over a sea of lava at night. */
interface Theme {
  sky: SkyLook;
  water: WaterLook;
  fog: [string, number, number];
  grass: [string, string];
  soil: string;
  sand: string;
  rock: string;
  wall: string;
  hemi: [number, number, number];
  sun: [string, number];
  reflections: number;
  bloom: { strength: number; radius: number; threshold: number };
  night: boolean;
}

const SUN_DIR: [number, number, number] = [-0.25, 0.77, -0.59];

const THEMES: Theme[] = [
  {
    sky: { top: '#1e78d8', horizon: '#c8ecff', sun: { dir: SUN_DIR, color: '#fff3d0' }, clouds: 0.45 },
    water: { deep: '#0a5c9e', shallow: '#22bfd0', sky: '#c4ecff', horizon: '#bfe6ff', sun: SUN_DIR, sunColor: '#fff6dc' },
    fog: ['#c8ecff', 34, 120],
    grass: ['#57d15e', '#4bc154'],
    soil: '#9a6a44',
    sand: '#f6de9e',
    rock: '#8a6a55',
    wall: '#cf8f58',
    hemi: [0xdff3ff, 0x4a9a6a, 0.4],
    sun: ['#fff1d6', 2.3],
    reflections: 0.45,
    bloom: { strength: 0.35, radius: 0.5, threshold: 1.1 },
    night: false,
  },
  {
    sky: { top: '#0b0612', horizon: '#8a2412', bottom: '#3a0c06', stars: 0.7 },
    water: { deep: '#170908', shallow: '#b32408', sky: '#000000', horizon: '#3a0d06', sun: SUN_DIR, sunColor: '#ff7a1e', lava: true },
    fog: ['#3a0c08', 28, 110],
    grass: ['#46a86b', '#3c9860'],
    soil: '#3a2a2e',
    sand: '#a3978c',
    rock: '#2e2630',
    wall: '#55495e',
    hemi: [0x8f9cff, 0xb8320e, 0.75],
    sun: ['#cfd8ff', 2.4],
    reflections: 0.3,
    bloom: { strength: 0.6, radius: 0.6, threshold: 1 },
    night: true,
  },
];
const CONVEYOR: Record<string, [number, number]> = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };
const MAX_POWER = 9;

interface HoleScene {
  group: THREE.Group;
  map: string[];
  tee: [number, number];
  cup: [number, number];
  blades: THREE.Group[];
  belts: THREE.Texture[];
  flag: THREE.Mesh;
  /** Flames of torches (they flicker). */
  flames: THREE.Sprite[];
  centre: THREE.Vector3;
  size: number;
}

function beltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4a4757';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(26, 16);
  ctx.lineTo(12, 6);
  ctx.lineTo(12, 26);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A palm for the far edge of the sunny island. */
function palm(seed: number): THREE.Group {
  const tree = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#8a6238', roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#2fae4c', roughness: 0.7, side: THREE.DoubleSide });
  const lean = 0.12 + (seed % 3) * 0.05;
  let y = 0;
  let x = 0;
  for (let k = 0; k < 5; k++) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - k * 0.006, 0.085 - k * 0.006, 0.34, 7), bark);
    part.position.set(x, y + 0.17, 0);
    part.rotation.z = -lean * k * 0.5;
    part.castShadow = true;
    tree.add(part);
    y += 0.32;
    x += Math.sin(lean * k * 0.5) * 0.3;
  }
  for (let k = 0; k < 7; k++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.95, 4).scale(1, 1, 0.18).translate(0, 0.45, 0), leaf);
    frond.position.set(x, y, 0);
    frond.rotation.set(0, (k / 7) * Math.PI * 2 + seed, 0);
    frond.rotateZ(1.25 + (k % 2) * 0.25);
    frond.castShadow = true;
    tree.add(frond);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: '#5a3d1e' }));
  nut.position.set(x, y - 0.06, 0.06);
  tree.add(nut);
  tree.rotation.y = seed * 1.7;
  return tree;
}

/** A torch for the far edge of the volcano island; returns the flame to make it flicker. */
function torch(): { group: THREE.Group; flame: THREE.Sprite } {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#2a2228', roughness: 0.8 }));
  pole.position.y = 0.45;
  pole.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.12, 8), new THREE.MeshStandardMaterial({ color: '#6b5a4a', metalness: 0.6, roughness: 0.4 }));
  bowl.position.y = 0.94;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: hdr('#ffb13d', 3) }));
  core.position.y = 1.03;
  const flame = glow('#ff7a1e', 1.3, 1.6);
  flame.position.y = 1.1;
  group.add(pole, bowl, core, flame);
  return { group, flame };
}

function buildHole(map: string[], accent: string, theme: Theme): HoleScene {
  const group = new THREE.Group();
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const at = (x: number, z: number) => map[z]?.[x];
  const grain = grainTexture(0.16);
  const soil = new THREE.MeshStandardMaterial({ color: theme.soil, roughness: 1, map: grain });
  const top = (color: string, roughness: number) => [soil, soil, new THREE.MeshStandardMaterial({ color, roughness, map: grain }), soil, soil, soil];
  const grass = top(theme.grass[0], 0.9);
  const grass2 = top(theme.grass[1], 0.9);
  const sand = top(theme.sand, 1);
  const rock = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 1, flatShading: true });
  const wood = new THREE.MeshPhysicalMaterial({ color: theme.wall, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const tileGeo = new THREE.BoxGeometry(1, 0.3, 1);
  const rockGeo = new THREE.CylinderGeometry(0.58, 0.12, 1.3, 5);
  const wallGeo = new RoundedBoxGeometry(0.98, 0.34, 0.98, 2, 0.07);
  const blades: THREE.Group[] = [];
  const belts: THREE.Texture[] = [];
  const flames: THREE.Sprite[] = [];
  let tee: [number, number] = [0.5, 0.5];
  let cup: [number, number] = [0.5, 0.5];
  const flagMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  let flag = new THREE.Mesh();
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const ch = at(x, z);
      if (!ch || ch === '.') continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const isBelt = ch in CONVEYOR;
      let topMat: THREE.Material | THREE.Material[] = ch === '~' ? sand : (x + z) % 2 === 0 ? grass : grass2;
      if (isBelt) {
        const tex = beltTexture();
        const [dx, dz] = CONVEYOR[ch]!;
        tex.center.set(0.5, 0.5);
        tex.rotation = -Math.atan2(dz, dx);
        belts.push(tex);
        topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: theme.night ? 0.35 : 0.1 });
      }
      const tile = new THREE.Mesh(tileGeo, topMat);
      tile.position.set(cx, -0.15, cz);
      tile.receiveShadow = true;
      const stone = new THREE.Mesh(rockGeo, rock);
      stone.position.set(cx, -0.95, cz);
      stone.rotation.y = (x * 7 + z * 13) % 5;
      stone.scale.y = 0.8 + ((x * 3 + z * 5) % 4) * 0.22;
      group.add(tile, stone);
      if (ch === 'W') {
        const wall = new THREE.Mesh(wallGeo, wood);
        wall.position.set(cx, 0.17, cz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);
        // Something to look at on the far edge, where it hides nothing.
        if (z === 0 && (x * 5 + rows) % 3 === 0) {
          if (theme.night) {
            const { group: light, flame } = torch();
            light.position.set(cx, 0.34, cz);
            group.add(light);
            flames.push(flame);
          } else {
            const tree = palm(x + rows);
            tree.position.set(cx, 0.34, cz);
            group.add(tree);
          }
        }
      }
      if (ch === 'S') tee = [cx, cz];
      if (ch === 'S') {
        const mat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.7), new THREE.MeshStandardMaterial({ color: '#2f8f3c' }));
        mat.position.set(cx, 0.01, cz);
        group.add(mat);
      }
      if (ch === 'H') {
        cup = [cx, cz];
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 24), new THREE.MeshBasicMaterial({ color: '#0b0a12' }));
        hole.position.set(cx, 0.011, cz);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.29, 32), new THREE.MeshBasicMaterial({ color: hdr('#ffffff', theme.night ? 2.2 : 1.3) }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.set(cx, 0.013, cz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.6, roughness: 0.3 }));
        pole.position.set(cx, 0.7, cz);
        pole.castShadow = true;
        flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32, 8, 1).translate(0.25, 0, 0), flagMat);
        flag.position.set(cx, 1.24, cz);
        flag.castShadow = true;
        group.add(hole, rim, pole, flag);
      }
      if (ch === 'J') {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff5a00', emissiveIntensity: 1.5 }));
        ramp.position.set(cx, 0.1, cz);
        ramp.rotation.x = 0.25;
        group.add(ramp);
      }
      if (ch === 'M') {
        // A windmill over the passage: the house on the wall, the blades turning in front.
        const house = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.4, 0.8, 2, 0.06), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.8, map: grain }));
        house.position.set(cx, 0.9, cz - 0.4);
        house.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#e0485e', flatShading: true }));
        roof.position.set(cx, 2.05, cz - 0.4);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.82), new THREE.MeshBasicMaterial({ color: '#2a2540' }));
        door.position.set(cx, 0.25, cz - 0.4);
        const windowLight = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.82), new THREE.MeshBasicMaterial({ color: hdr('#ffd98a', theme.night ? 2.6 : 0.9) }));
        windowLight.position.set(cx - 0.55, 1.25, cz - 0.4);
        const hub = new THREE.Group();
        hub.position.set(cx, 1.15, cz + 0.08);
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.04), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }));
          blade.position.y = 0.55;
          blade.castShadow = true;
          const arm = new THREE.Group();
          arm.rotation.z = (i * Math.PI) / 2;
          arm.add(blade);
          hub.add(arm);
        }
        group.add(house, roof, door, windowLight, hub);
        blades.push(hub);
      }
    }
  }
  return { group, map, tee, cup, blades, belts, flag, flames, centre: new THREE.Vector3(cols / 2, 0, rows / 2), size: Math.max(cols, rows) };
}

export default function GolfGame({ skin: skinId, option, onFinish, onQuit }: ArenaPlayProps) {
  const course = COURSES[option] ?? COURSES[0]!;
  const skin = ARENA_GAMES.find((g) => g.id === 'golf')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES.find((g) => g.id === 'golf')!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState(0);
  const [strokes, setStrokes] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad'; id: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const aim = useRef<{ from: { x: number; y: number } | null; dx: number; dy: number }>({ from: null, dx: 0, dy: 0 });
  const shoot = useRef<((dir: [number, number], power: number) => void) | null>(null);
  const state = useRef({ hole: 0, strokes: [] as number[], current: 0, done: false });

  // Pull back like a slingshot, let go to shoot.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const down = (e: PointerEvent) => {
      aim.current = { from: { x: e.clientX, y: e.clientY }, dx: 0, dy: 0 };
      area.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!aim.current.from) return;
      aim.current.dx = e.clientX - aim.current.from.x;
      aim.current.dy = e.clientY - aim.current.from.y;
    };
    const up = () => {
      const { from, dx, dy } = aim.current;
      aim.current = { from: null, dx: 0, dy: 0 };
      if (!from) return;
      const length = Math.hypot(dx, dy);
      if (length < 12) return;
      shoot.current?.([-dx / length, -dy / length], Math.min(1, length / 140));
    };
    area.addEventListener('pointerdown', down);
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
    return () => {
      area.removeEventListener('pointerdown', down);
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', up);
    };
  }, []);

  useArenaScene(canvasRef, (renderer) => {
    const theme = THEMES[option % THEMES.length]!;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    const sky = new Sky(theme.sky);
    scene.add(sky);
    environmentFrom(renderer, scene, theme.sky, theme.reflections);
    // The sun stands ahead, so the sea glitters towards the camera and everything has a bright rim.
    const sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
    scene.add(new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]), sun, sun.target);
    const sea = new Water(900, theme.water);
    sea.position.y = -4;
    scene.add(sea);
    if (theme.night) {
      // The lava lights the island from below.
      const ember = new THREE.PointLight(0xff5a1e, 14, 40, 1.6);
      ember.position.set(0, -3, 0);
      scene.add(ember);
    }
    // Things around the island: clouds drifting below it, or rocks standing in the lava.
    const drifting: THREE.Sprite[] = [];
    if (theme.night) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.4;
        const d = 12 + (i % 3) * 5;
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.9 + (i % 3) * 0.5, 3 + (i % 4) * 1.4, 5), new THREE.MeshStandardMaterial({ color: '#1e181f', roughness: 1, flatShading: true }));
        spire.position.set(Math.cos(a) * d, -3.2 + (i % 4) * 0.5, Math.sin(a) * d - 4);
        spire.rotation.y = i;
        const heat = glow('#ff5a1e', 4, 0.25);
        heat.position.set(spire.position.x, -3.6, spire.position.z);
        scene.add(spire, heat);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
        cloud.scale.set(6 + (i % 3) * 2, 2 + (i % 2), 1);
        cloud.position.set(((i * 37) % 30) - 15, -2.8 - (i % 3) * 0.4, ((i * 53) % 26) - 16);
        scene.add(cloud);
        drifting.push(cloud);
      }
    }

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(R, 32, 20),
      new THREE.MeshPhysicalMaterial({ color: skin.color, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, emissive: skin.id === 'neon' ? skin.color : '#000000', emissiveIntensity: 1.2 }),
    );
    ball.castShadow = true;
    scene.add(ball);
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    scene.add(arrow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.3, 32), new THREE.MeshBasicMaterial({ color: hdr('#ffffff', 1.6), transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    // What flies: sparks and embers (glowing), sand and spray (not glowing), a trail, paper snippets, a ring on the sea.
    const sparks = new Particles(380);
    const puffs = new Particles(260, { additive: false, sharp: 1 });
    const ribbon = new Trail(30, R * 1.7, theme.night ? skin.accent : '#ffffff', { additive: theme.night, opacity: theme.night ? 1 : 0.6, intensity: theme.night ? 1.5 : 1 });
    const confetti = new Confetti();
    const shake = new Shake();
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 48),
      new THREE.MeshBasicMaterial({ color: theme.night ? hdr('#ffb13d', 2.5) : '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    ripple.rotation.x = -Math.PI / 2;
    scene.add(sparks, puffs, ribbon, confetti, ripple);
    let rippleAge = 1;

    let holeScene: HoleScene | null = null;
    let shown = -1;
    const b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, moving: false, air: false, falling: false, sunk: 0, from: [0, 0] as [number, number], time: 0, wait: 0 };
    const camTarget = new THREE.Vector3();
    const camPos = new THREE.Vector3();

    const load = (index: number) => {
      if (holeScene) {
        scene.remove(holeScene.group);
        holeScene.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          mesh.geometry?.dispose();
          for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
            (material as THREE.MeshStandardMaterial).map?.dispose();
            material.dispose();
          }
        });
      }
      holeScene = buildHole(course.holes[index]!.map, skin.accent, theme);
      scene.add(holeScene.group);
      shown = index;
      Object.assign(b, { x: holeScene.tee[0], z: holeScene.tee[1], y: 0, vx: 0, vz: 0, vy: 0, moving: false, air: false, falling: false, sunk: 0 });
      ribbon.reset();
      camTarget.set(0, 0, 0);
      // Every hole starts with a flight in from high above.
      camPos.set(0, holeScene.size * 2 + 6, holeScene.size * 1.5 + 6);
    };

    shoot.current = (dir, power) => {
      const s = state.current;
      if (!holeScene || b.moving || b.falling || b.sunk > 0 || s.done) return;
      sound.unlock();
      b.vx = dir[0] * power * MAX_POWER;
      b.vz = dir[1] * power * MAX_POWER;
      b.from = [b.x, b.z];
      b.moving = true;
      s.current++;
      setCurrent(s.current);
      sound.click(0.6 + power);
      haptic(10);
    };

    const tileAt = (x: number, z: number) => holeScene?.map[Math.floor(z)]?.[Math.floor(x)];
    const bladesBlock = () => {
      const angle = ((b.time * 1.6) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2);
      return angle < 0.38 || angle > Math.PI / 2 - 0.12;
    };
    const solid = (x: number, z: number) => {
      const ch = holeScene?.map[z]?.[x];
      return ch === 'W' || (ch === 'M' && bladesBlock());
    };

    const nextHole = (count: number) => {
      const s = state.current;
      s.strokes = [...s.strokes, count];
      setStrokes(s.strokes);
      window.setTimeout(() => {
        if (s.hole + 1 >= HOLES) {
          s.done = true;
          setFinished(true);
          confetti.burst(camera, scene);
          sound.fanfare();
          const par = course.holes.reduce((sum, h) => sum + h.par, 0);
          const total = s.strokes.reduce((a, c) => a + c, 0);
          window.setTimeout(
            () =>
              onFinish({
                score: golfScore(s.strokes, option),
                stars: golfStars(s.strokes, option),
                summary: `${course.name}: ${total} Schläge (Par ${par}, ${total - par >= 0 ? '+' : ''}${total - par})`,
              }),
            1200,
          );
          return;
        }
        s.hole++;
        s.current = 0;
        setHole(s.hole);
        setCurrent(0);
      }, 1300);
    };

    const update = (dt: number) => {
      const s = state.current;
      b.time += dt;
      if (shown !== s.hole && !s.done) load(s.hole);
      if (!holeScene) return;
      const hs = holeScene;
      const ox = -hs.centre.x;
      const oz = -hs.centre.z;
      for (const hub of hs.blades) hub.rotation.z = -b.time * 1.6;
      for (const tex of hs.belts) tex.offset.x = (tex.offset.x - dt * 1.2) % 1;
      // The flag waves: a ripple runs along the cloth.
      const cloth = hs.flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < cloth.count; i++) cloth.setZ(i, Math.sin(cloth.getX(i) * 9 - b.time * 7) * 0.05 * (cloth.getX(i) / 0.5));
      cloth.needsUpdate = true;
      for (const flame of hs.flames) flame.scale.setScalar(1.15 + Math.sin(b.time * 17 + flame.id) * 0.12 + Math.random() * 0.12);
      sky.tick(b.time);
      sea.tick(b.time);
      drifting.forEach((cloud, i) => (cloud.position.x = ((((i * 37) % 30) + b.time * (0.25 + (i % 3) * 0.1)) % 34) - 17));
      if (theme.night && Math.random() < dt * 22) {
        // Embers rise from the lava.
        const a = Math.random() * Math.PI * 2;
        const d = 3 + Math.random() * 14;
        sparks.emit(Math.cos(a) * d, -3.8, Math.sin(a) * d - 2, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 2, 0.09 + Math.random() * 0.08, '#ff8a2a', { intensity: 3, gravity: -0.3 });
      }
      if (rippleAge < 1) {
        rippleAge = Math.min(1, rippleAge + dt * 0.9);
        ripple.scale.setScalar(0.4 + rippleAge * 4.5);
        ripple.material.opacity = (1 - rippleAge) * 0.8;
      }

      if (b.sunk > 0) {
        b.sunk += dt;
        b.y = Math.max(-0.3, -b.sunk * 1.2);
      } else if (b.falling) {
        b.vy -= 14 * dt;
        b.y += b.vy * dt;
        b.x += b.vx * dt * 0.5;
        b.z += b.vz * dt * 0.5;
        if (b.y < -3.5) {
          // Into the sea: a splash and a ring – or a burst of fire.
          const at = { x: b.x + ox, y: -3.85, z: b.z + oz };
          if (theme.night) sparks.burst(at, 70, ['#ffb13d', '#ff5a1e', '#ffe08a'], { speed: [1, 6], up: 4, life: [0.5, 1.3], size: [0.15, 0.4], gravity: 6, intensity: 3.2 });
          else puffs.burst(at, 60, ['#ffffff', '#bfeaff', '#e8f8ff'], { speed: [0.8, 4], up: 5, life: [0.5, 1.1], size: [0.12, 0.32], gravity: 11, alpha: 0.9 });
          ripple.position.set(at.x, -3.93, at.z);
          rippleAge = 0;
          sound.pop();
          b.falling = false;
          [b.x, b.z] = b.from;
          b.y = 0;
          b.vx = b.vz = b.vy = 0;
          b.moving = false;
          s.current++;
          setCurrent(s.current);
          setFlash({ text: 'Ins Meer! +1', tone: 'bad', id: Date.now() });
          if (s.current >= MAX_STROKES) nextHole(MAX_STROKES);
        }
      } else if (b.moving) {
        const steps = 4;
        const h = dt / steps;
        for (let k = 0; k < steps && b.moving && !b.falling && b.sunk === 0; k++) {
          if (b.air) {
            b.vy -= 14 * h;
            b.y += b.vy * h;
            b.x += b.vx * h;
            b.z += b.vz * h;
            if (b.y <= 0) {
              b.y = 0;
              b.vy = 0;
              b.air = false;
              puffs.burst({ x: b.x + ox, y: 0.05, z: b.z + oz }, 12, ['#ffffff', theme.grass[0]], { speed: [0.5, 2], up: 1, life: [0.3, 0.6], size: [0.07, 0.16], gravity: 5, alpha: 0.85 });
              sound.pop();
            }
            continue;
          }
          const tile = tileAt(b.x, b.z);
          const friction = tile === '~' ? 4.5 : 0.95;
          b.vx *= 1 - friction * h;
          b.vz *= 1 - friction * h;
          if (tile && CONVEYOR[tile]) {
            b.vx += CONVEYOR[tile]![0] * 3.4 * h;
            b.vz += CONVEYOR[tile]![1] * 3.4 * h;
          }
          const speed = Math.hypot(b.vx, b.vz);
          if (tile === '~' && speed > 0.8 && Math.random() < 0.5) {
            puffs.emit(b.x + ox, 0.06, b.z + oz, -b.vx * 0.2 + (Math.random() - 0.5), 0.8 + Math.random(), -b.vz * 0.2 + (Math.random() - 0.5), 0.45, 0.14, theme.sand, { gravity: 5, alpha: 0.9 });
          }
          if (tile === 'J' && speed > 1.2) {
            b.air = true;
            b.vy = 3 + speed * 0.3;
            sparks.burst({ x: b.x + ox, y: 0.15, z: b.z + oz }, 18, ['#ff8a3d', '#ffd23f'], { speed: [0.5, 3], up: 2, life: [0.3, 0.7], size: [0.08, 0.2], gravity: 4, intensity: 2.6 });
            sound.whoosh();
          }
          b.x += b.vx * h;
          b.z += b.vz * h;
          // Bumpers and windmill blades.
          const cx = Math.floor(b.x);
          const cz = Math.floor(b.z);
          for (let tz = cz - 1; tz <= cz + 1; tz++) {
            for (let tx = cx - 1; tx <= cx + 1; tx++) {
              if (!solid(tx, tz)) continue;
              const nx = Math.max(tx, Math.min(b.x, tx + 1));
              const nz = Math.max(tz, Math.min(b.z, tz + 1));
              const dx = b.x - nx;
              const dz = b.z - nz;
              const d = Math.hypot(dx, dz);
              if (d >= R || d === 0) continue;
              const ux = dx / d;
              const uz = dz / d;
              b.x = nx + ux * R;
              b.z = nz + uz * R;
              const vn = b.vx * ux + b.vz * uz;
              if (vn < 0) {
                b.vx -= 1.75 * vn * ux;
                b.vz -= 1.75 * vn * uz;
                if (vn < -1) {
                  sound.click(1.4);
                  sparks.burst({ x: nx + ox, y: 0.2, z: nz + oz }, Math.min(16, Math.round(-vn * 3)), ['#ffffff', '#ffd98a'], { speed: [0.5, 2.5], up: 1, life: [0.2, 0.45], size: [0.05, 0.12], gravity: 5, intensity: 2.2 });
                  if (vn < -4) shake.kick(0.18);
                }
              }
            }
          }
          const under = tileAt(b.x, b.z);
          if (!under || under === '.') {
            b.falling = true;
            b.vy = 0;
            sound.whoosh();
            haptic([30, 30, 30]);
            break;
          }
          // The cup: slow enough falls in, too fast rolls over.
          const dc = Math.hypot(b.x - hs.cup[0], b.z - hs.cup[1]);
          if (dc < 0.22 && Math.hypot(b.vx, b.vz) < 3.6) {
            b.sunk = 0.001;
            b.moving = false;
            const count = s.current;
            const par = course.holes[s.hole]!.par;
            sound.ding();
            if (count <= par) window.setTimeout(() => sound.fanfare(), 250);
            haptic([20, 40, 20]);
            setFlash({ text: strokeName(count, par), tone: count <= par ? 'good' : 'bad', id: Date.now() });
            const at = { x: hs.cup[0] + ox, y: 0.1, z: hs.cup[1] + oz };
            sparks.burst(at, 50, ['#ffd23f', '#ffffff', skin.accent], { speed: [1, 4.5], up: 3.5, life: [0.5, 1.1], size: [0.07, 0.2], gravity: 6, intensity: 3 });
            if (count <= par) confetti.burst(camera, scene);
            nextHole(count);
            break;
          }
          if (Math.hypot(b.vx, b.vz) < 0.06) {
            b.vx = b.vz = 0;
            b.moving = false;
            if (s.current >= MAX_STROKES) {
              setFlash({ text: 'Weiter zum nächsten Loch', tone: 'bad', id: Date.now() });
              nextHole(MAX_STROKES);
            }
          }
        }
      }

      // Ball, aim, camera.
      hs.group.position.set(ox, 0, oz);
      ball.position.set(b.x + ox, b.y + R, b.z + oz);
      ball.visible = b.y > -3.6;
      ribbon.follow(ball.position.x, ball.position.y, ball.position.z, dt, camera);
      sparks.update(dt);
      puffs.update(dt);
      confetti.update(dt);
      const moving = Math.hypot(b.vx, b.vz);
      if (moving > 0.01) ball.rotateOnWorldAxis(new THREE.Vector3(b.vz, 0, -b.vx).normalize(), (moving * dt) / R);
      const a = aim.current;
      const length = Math.hypot(a.dx, a.dy);
      const ready = !b.moving && !b.falling && b.sunk === 0 && !s.done;
      ring.visible = ready;
      ring.position.set(b.x + ox, 0.02, b.z + oz);
      if (a.from && length > 12 && ready) {
        const power = Math.min(1, length / 140);
        arrow.visible = true;
        arrow.position.set(b.x + ox, 0.05, b.z + oz);
        arrow.rotation.y = Math.atan2(a.dx / length, a.dy / length);
        arrow.scale.set(1, 1, 0.4 + power * 2.6);
        (arrow.material as THREE.MeshBasicMaterial).color.setHSL(0.33 - power * 0.33, 0.9, 0.55).multiplyScalar(1.8);
      } else arrow.visible = false;
      const focus = new THREE.Vector3(b.x + ox, 0, b.z + oz).multiplyScalar(0.35);
      camTarget.lerp(focus, Math.min(1, dt * 2));
      const wanted = new THREE.Vector3(camTarget.x, hs.size * 1.05 + 2.5, camTarget.z + hs.size * 0.7 + 2);
      camPos.lerp(wanted, Math.min(1, dt * 2));
      camera.position.copy(camPos);
      camera.lookAt(camTarget.x, 0, camTarget.z - 0.5);
      shake.apply(camera, dt, 0.4);
      sun.position.set(camTarget.x + SUN_DIR[0] * 22, SUN_DIR[1] * 22, camTarget.z + SUN_DIR[2] * 22);
      sun.target.position.copy(camTarget);
    };
    return { scene, camera, update, fx: { bloom: theme.bloom, vignette: theme.night ? 0.5 : 0.28 } };
  });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1200);
    return () => window.clearTimeout(t);
  }, [flash]);

  const par = course.holes[hole]?.par ?? 3;
  const played = strokes.reduce((a, c) => a + c, 0);
  const parSoFar = course.holes.slice(0, strokes.length).reduce((a, h) => a + h.par, 0);
  return (
    <GameShell label={`Golfinsel · Loch ${Math.min(hole + 1, HOLES)} / ${HOLES}`} onExit={onQuit} accent={option === 1 ? '#ff5a1e' : '#4cc25a'} night={option === 1} className="arena-shell">
      <div className="arena-hud">
        <span>
          Par <strong>{par}</strong>
        </span>
        <span>
          Schläge <strong>{current}</strong>
        </span>
        <span>
          Total <strong>{played - parSoFar >= 0 ? `+${played - parSoFar}` : played - parSoFar}</strong>
        </span>
      </div>
      <div ref={areaRef} className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Golfinsel – zurückziehen und loslassen, um zu schlagen" />
        {flash && (
          <p key={flash.id} className={`arena-flash is-${flash.tone}`} aria-live="assertive">
            {flash.text}
          </p>
        )}
        {finished && <p className="arena-finish">Runde fertig! ⛳</p>}
        <p className={`arena-hint ${option === 1 ? '' : 'is-dark'}`}>Irgendwo tippen, zurückziehen, loslassen</p>
      </div>
    </GameShell>
  );
}
