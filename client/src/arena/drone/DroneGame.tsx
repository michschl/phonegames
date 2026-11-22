import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { collide, droneScore, droneStars, makeDroneCourse, throughGate, type DroneCourse, type Vec } from '../drone.ts';
import { useArenaScene } from '../engine.ts';
import { Confetti, environmentFrom, glow, grainTexture, hdr, Particles, Shake, Sky, type SkyLook } from '../fx.ts';
import { useSteer, useTwinSticks } from '../input.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Drohnen-Parcours: fly a drone through the gates in order – in a city, a forest or a hall. «Einfach»:
 * one stick, the drone flies forward by itself. «Profi»: two sticks like a real drone (left: turn and
 * height, right: forwards/backwards and sideways). A ghost flies the best time.
 */

const SAMPLE = 0.1;
const ghostKey = (course: number, player: string) => `phonegames-ghost-drohne-${course}-${player.toLowerCase()}`;

function loadGhost(course: number, player: string): { time: number; samples: number[][] } | null {
  try {
    const raw = localStorage.getItem(ghostKey(course, player));
    return raw ? (JSON.parse(raw) as { time: number; samples: number[][] }) : null;
  } catch {
    return null;
  }
}

function makeDrone(color: string, accent: string, ghost = false): { group: THREE.Group; rotors: THREE.Mesh[] } {
  const group = new THREE.Group();
  const mat = (c: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost, ...extra });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.9), mat(color));
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#1d1b26'));
  canopy.position.set(0, 0.1, 0.1);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.04), mat(accent, { emissive: accent, emissiveIntensity: 3 }));
  led.position.set(0, 0, 0.46);
  group.add(body, canopy, led);
  const rotors: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.62, 0.62],
    [0.62, 0.62],
    [-0.62, -0.62],
    [0.62, -0.62],
  ] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.9), mat('#2a2540'));
    arm.position.set(x / 2, 0, z / 2);
    arm.rotation.y = Math.atan2(x, z);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 20), mat('#ffffff', { transparent: true, opacity: ghost ? 0.15 : 0.45 }));
    rotor.position.set(x, 0.12, z);
    group.add(arm, rotor);
    rotors.push(rotor);
  }
  if (!ghost) group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return { group, rotors };
}

/** What a world needs from the game: its light, its glow, and a tick for what moves in it. */
interface World {
  hemi: [number, number, number];
  sun: [string, number, [number, number, number]];
  bloom: { strength: number; radius: number; threshold: number };
  vignette: number;
  tick(time: number, dt: number, at: Vec): void;
}

/** Fronts of houses: walls with dark panes, and the same layout with the panes that are lit. */
function windowTextures(): { wall: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    return canvas;
  };
  const wall = make();
  const lit = make();
  const w = wall.getContext('2d')!;
  const l = lit.getContext('2d')!;
  w.fillStyle = '#ffffff';
  w.fillRect(0, 0, 128, 128);
  l.fillStyle = '#000000';
  l.fillRect(0, 0, 128, 128);
  const lights = ['#ffd98a', '#ffd98a', '#ffe9b8', '#ffc56a', '#9fe3ff', '#ff9ad9'];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      w.fillStyle = '#39405f';
      w.fillRect(x * 16 + 4, y * 16 + 3, 8, 10);
      if (Math.random() < 0.42) {
        l.fillStyle = lights[Math.floor(Math.random() * lights.length)]!;
        l.fillRect(x * 16 + 4, y * 16 + 3, 8, 10);
      }
    }
  }
  const finish = (canvas: HTMLCanvasElement) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return { wall: finish(wall), lit: finish(lit) };
}

/** A floor with thin bright lines, as the map of what glows. */
function gridTexture(cells: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 7;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(cells, cells);
  return texture;
}

function buildWorld(scene: THREE.Scene, course: DroneCourse, renderer: THREE.WebGLRenderer): World {
  const m = new THREE.Matrix4();
  const boxes = course.obstacles.filter((o) => o.kind === 'box');
  const trees = course.obstacles.filter((o) => o.kind === 'tree');
  const ticks: ((time: number, dt: number, at: Vec) => void)[] = [];
  let world: Omit<World, 'tick'>;

  if (course.indoor) {
    // A hall of neon: dark, shiny floor with a glowing grid, light strips on walls, ceiling and pillars.
    const room: SkyLook = { top: '#1a0f3a', horizon: '#c23a8a', bottom: '#12203f' };
    scene.background = new THREE.Color('#0a0818');
    scene.fog = new THREE.Fog(0x0a0818, 30, 120);
    environmentFrom(renderer, scene, room, 0.5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(course.size * 2, course.size * 2),
      new THREE.MeshStandardMaterial({ color: '#15122a', roughness: 0.28, metalness: 0.55, emissive: '#2ec5ff', emissiveMap: gridTexture(course.size / 2), emissiveIntensity: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(course.size * 2, course.ceiling, course.size * 2), new THREE.MeshStandardMaterial({ color: '#1c1640', roughness: 0.8, side: THREE.BackSide }));
    walls.position.y = course.ceiling / 2;
    scene.add(floor, walls);
    const lamp = new THREE.MeshBasicMaterial({ color: hdr('#cfeaff', 2.4) });
    for (let x = -course.size + 8; x < course.size; x += 16) {
      for (let z = -course.size + 8; z < course.size; z += 16) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 0.5), lamp);
        strip.position.set(x, course.ceiling - 0.15, z);
        scene.add(strip);
      }
    }
    // Lines of light around the hall.
    for (const [y, color] of [
      [2.5, '#ff3fa4'],
      [course.ceiling - 2, '#2ec5ff'],
    ] as const) {
      const band = new THREE.MeshBasicMaterial({ color: hdr(color, 2) });
      for (const side of [-1, 1]) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(course.size * 2, 0.18, 0.12), band);
        a.position.set(0, y, side * (course.size - 0.1));
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, course.size * 2), band);
        b.position.set(side * (course.size - 0.1), y, 0);
        scene.add(a, b);
      }
    }
    // Pillars of dark metal with two rings of light each.
    const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#241d4a', roughness: 0.35, metalness: 0.6 }), boxes.length);
    const rings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), boxes.length * 2);
    boxes.forEach((o, i) => {
      if (o.kind !== 'box') return;
      const size = new THREE.Vector3(o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]);
      const centre = new THREE.Vector3((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2, (o.min[2] + o.max[2]) / 2);
      m.compose(centre, new THREE.Quaternion(), size);
      pillars.setMatrixAt(i, m);
      const color = hdr(o.color === '#ff7ad9' ? '#ff3fa4' : '#8a6bff', 2.1);
      [0.22, 0.7].forEach((t, k) => {
        m.compose(new THREE.Vector3(centre.x, o.min[1] + size.y * t, centre.z), new THREE.Quaternion(), new THREE.Vector3(size.x + 0.12, 0.16, size.z + 0.12));
        rings.setMatrixAt(i * 2 + k, m);
        rings.setColorAt(i * 2 + k, color);
      });
    });
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    scene.add(pillars, rings);
    world = { hemi: [0x8f86ff, 0x1a1436, 0.9], sun: ['#cfd8ff', 0.9, [0.3, 1, 0.25]], bloom: { strength: 0.75, radius: 0.7, threshold: 1 }, vignette: 0.5 };
  } else if (course.name === 'Wald') {
    // A forest in the low evening sun, with fireflies.
    const look: SkyLook = { top: '#2f6fc4', horizon: '#ffd7a0', sun: { dir: [0.15, 0.2, -0.97], color: '#ffd9a0', size: 0.0014, glow: 0.8 }, clouds: 0.35, cloudColor: '#fff0d8' };
    const sky = new Sky(look);
    scene.add(sky);
    scene.fog = new THREE.Fog(0xe6cfa4, 40, 190);
    environmentFrom(renderer, scene, look, 0.55);
    const grain = grainTexture(0.22);
    grain.repeat.set(course.size, course.size);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(course.size * 4, course.size * 4), new THREE.MeshStandardMaterial({ color: '#5aa648', roughness: 1, map: grain }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Ferns and tufts cover the ground (nothing to bump into).
    const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 0.7, 5).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 420);
    const tint = new THREE.Color();
    for (let i = 0; i < 420; i++) {
      const size = 0.5 + Math.random() * 1.1;
      m.compose(new THREE.Vector3((Math.random() - 0.5) * course.size * 2.6, 0, (Math.random() - 0.5) * course.size * 2.6), new THREE.Quaternion(), new THREE.Vector3(size, size * (0.6 + Math.random()), size));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, tint.set(['#3f9a3f', '#4fb04a', '#6cc24f', '#e8d24a'][i % 4]!));
    }
    scene.add(tufts);
    const flies = new Particles(120);
    scene.add(flies);
    ticks.push((time, dt, at) => {
      sky.tick(time);
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const d = 4 + Math.random() * 26;
        flies.emit(at[0] + Math.cos(a) * d, 0.6 + Math.random() * 5, at[2] + Math.sin(a) * d, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 2.5, 0.2, '#e8ff7a', { endSize: 0.16, intensity: 3 });
      }
      flies.update(dt);
    });
    world = { hemi: [0xdfeaff, 0x4a7a3a, 0.85], sun: ['#ffd29a', 2.7, [0.15, 0.32, -0.97]], bloom: { strength: 0.5, radius: 0.7, threshold: 1.15 }, vignette: 0.32 };
  } else {
    // The city at dusk: lit windows, neon on the corners, lights on the roofs, wet streets.
    const look: SkyLook = { top: '#0c0a2e', horizon: '#e0527a', bottom: '#2a1840', sun: { dir: [0.22, 0.07, -0.97], color: '#ff9a5a', size: 0.003, glow: 1.6 }, stars: 0.5, clouds: 0.3, cloudColor: '#b0507a' };
    const sky = new Sky(look);
    scene.add(sky);
    scene.fog = new THREE.Fog(0x5a2a5c, 45, 230);
    environmentFrom(renderer, scene, look, 0.7);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(course.size * 4, course.size * 4),
      new THREE.MeshStandardMaterial({ color: '#16172a', roughness: 0.3, metalness: 0.6, emissive: '#ff3fa4', emissiveMap: gridTexture(course.size / 3), emissiveIntensity: 0.5 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    ticks.push((time) => sky.tick(time));
    world = { hemi: [0x8f86ff, 0x3a2a55, 0.95], sun: ['#ffb38a', 1.5, [0.22, 0.3, -0.97]], bloom: { strength: 0.8, radius: 0.75, threshold: 1 }, vignette: 0.45 };

    // All houses as one mesh: panes laid by their size, so wide and tall houses simply have more of them.
    const { wall, lit } = windowTextures();
    const dusk = new THREE.Color('#2b2a5a');
    const tint = new THREE.Color();
    const parts: THREE.BufferGeometry[] = [];
    const neon = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), boxes.length);
    const beacons: THREE.Sprite[] = [];
    boxes.forEach((o, i) => {
      if (o.kind !== 'box') return;
      const size = new THREE.Vector3(o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]);
      const centre = new THREE.Vector3((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2, (o.min[2] + o.max[2]) / 2);
      const part = new THREE.BoxGeometry(size.x, size.y, size.z);
      const uv = part.attributes.uv as THREE.BufferAttribute;
      const shift = Math.floor(Math.random() * 8) / 8;
      for (let v = 0; v < uv.count; v++) {
        const face = Math.floor(v / 4); // +x −x +y −y +z −z
        if (face === 2 || face === 3) uv.setXY(v, 0.005, 0.005); // roofs have no windows
        else uv.setXY(v, shift + (uv.getX(v) * (face < 2 ? size.z : size.x)) / 17.6, shift + (uv.getY(v) * size.y) / 20.8);
      }
      tint.set(o.color).lerp(dusk, 0.62);
      const colors: number[] = [];
      for (let v = 0; v < uv.count; v++) colors.push(tint.r, tint.g, tint.b);
      part.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      part.translate(centre.x, centre.y, centre.z);
      parts.push(part);
      // A strip of neon up one corner.
      m.compose(new THREE.Vector3(o.max[0] + 0.06, size.y * 0.46, o.max[2] + 0.06), new THREE.Quaternion(), new THREE.Vector3(0.28, size.y * 0.88, 0.28));
      neon.setMatrixAt(i, m);
      neon.setColorAt(i, hdr(['#ff3fa4', '#2ec5ff', '#a46bff', '#ffd23f'][i % 4]!, i % 2 === 0 ? 2.2 : 0));
      if (size.y > 26) {
        const beacon = glow('#ff3b3b', 2.6, 1.4);
        beacon.position.set(centre.x, o.max[1] + 0.6, centre.z);
        beacon.userData.phase = i;
        scene.add(beacon);
        beacons.push(beacon);
      }
    });
    if (parts.length > 0) {
      const city = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, map: wall, emissive: '#ffffff', emissiveMap: lit, emissiveIntensity: 1.25, roughness: 0.65, metalness: 0.1 }));
      city.castShadow = true;
      city.receiveShadow = true;
      scene.add(city, neon);
      for (const part of parts) part.dispose();
    }
    ticks.push((time) => {
      for (const beacon of beacons) beacon.material.opacity = Math.sin(time * 2.2 + (beacon.userData.phase as number)) > 0.3 ? 1 : 0.15;
    });
  }

  if (trees.length > 0) {
    // Tall firs: dark below, lighter towards the top where the sun still reaches.
    const crownParts = [new THREE.ConeGeometry(1, 0.55, 7).translate(0, 0.5, 0), new THREE.ConeGeometry(0.75, 0.45, 7).translate(0, 0.8, 0)];
    const low = new THREE.Color('#12452f');
    const high = new THREE.Color('#3f9a55');
    for (const part of crownParts) {
      const position = part.attributes.position as THREE.BufferAttribute;
      const colors: number[] = [];
      for (let v = 0; v < position.count; v++) {
        const c = low.clone().lerp(high, Math.min(1, Math.max(0, (position.getY(v) - 0.25) / 0.8)));
        colors.push(c.r, c.g, c.b);
      }
      part.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const foliage = new THREE.InstancedMesh(mergeGeometries(crownParts)!, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }), trees.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 }), trees.length);
    trees.forEach((o, i) => {
      if (o.kind !== 'tree') return;
      m.compose(new THREE.Vector3(o.x, 0, o.z), new THREE.Quaternion(), new THREE.Vector3(o.r * 1.9, o.h, o.r * 1.9));
      foliage.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(o.x, 0, o.z), new THREE.Quaternion(), new THREE.Vector3(o.r * 1.2, o.h * 0.4, o.r * 1.2));
      trunks.setMatrixAt(i, m);
    });
    foliage.castShadow = true;
    trunks.castShadow = true;
    scene.add(foliage, trunks);
  }
  return { ...world, tick: (time, dt, at) => ticks.forEach((tick) => tick(time, dt, at)) };
}

export default function DroneGame({ player, skin: skinId, option, tilt, mode, onFinish, onQuit }: ArenaPlayProps) {
  const skin = ARENA_GAMES.find((g) => g.id === 'drohne')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES.find((g) => g.id === 'drohne')!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const leftKnob = useRef<HTMLSpanElement>(null);
  const rightKnob = useRef<HTMLSpanElement>(null);
  const sticks = useTwinSticks(areaRef, 60);
  const tiltSteer = useSteer(areaRef, { tilt: true, range: 60 });
  const [hud, setHud] = useState({ time: 0, gates: 0 });
  const [flash, setFlash] = useState<{ text: string; id: number } | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const live = useRef({ running: false, done: false });
  const countdown = useStartCountdown(() => {
    live.current.running = true;
  });
  const total = useRef(0);

  useEffect(() => {
    countdown.begin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useArenaScene(canvasRef, (renderer) => {
    const course = makeDroneCourse(option, 3100 + option * 17);
    total.current = course.gates.length;
    const scene = new THREE.Scene();
    const world = buildWorld(scene, course, renderer);
    const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 500);
    const sun = new THREE.DirectionalLight(world.sun[0], world.sun[1]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0008;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
    scene.add(new THREE.HemisphereLight(world.hemi[0], world.hemi[1], world.hemi[2]), sun, sun.target);
    // Sparks, paper snippets at the finish, a jolt on a crash. (No trail: the camera flies right behind.)
    const sparks = new Particles(320);
    const confetti = new Confetti();
    const shake = new Shake();
    scene.add(sparks, confetti);

    // Gates: the next one glows, passed ones fade.
    const gateMeshes = course.gates.map((gate) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(gate.radius, 0.16, 10, 40),
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.4 }),
      );
      ring.position.set(...gate.pos);
      ring.rotation.y = gate.yaw;
      scene.add(ring);
      return ring;
    });
    // The next gate shines.
    const beacon = glow(skin.color, 6, 0.4);
    scene.add(beacon);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 12), new THREE.MeshBasicMaterial({ color: hdr(skin.color, 2) }));
    scene.add(arrow);

    const { group: drone, rotors } = makeDrone(skin.color, skin.accent);
    // Position lights: red on the left, green on the right.
    for (const [x, color] of [
      [-0.62, '#ff3b3b'],
      [0.62, '#3bff6a'],
    ] as const) {
      const light = glow(color, 0.5, 1.4);
      light.position.set(x, 0.05, -0.62);
      drone.add(light);
    }
    scene.add(drone);
    const best = loadGhost(option, player);
    const ghost = best ? makeDrone('#9fe3ff', '#ffffff', true).group : null;
    if (ghost) scene.add(ghost);

    const s = {
      pos: [...course.start] as Vec,
      vel: [0, 0, 0] as Vec,
      yaw: course.startYaw,
      stun: 0,
      time: 0,
      next: 0,
    };
    const samples: number[][] = [];
    let sampleIn = 0;
    let hudIn = 0;
    const camPos = new THREE.Vector3(s.pos[0], s.pos[1] + 3, s.pos[2] + 6);
    let clock = 0;
    const tmp = new THREE.Vector3();

    const update = (dt: number) => {
      const go = live.current.running && !live.current.done;
      const l = sticks.current.left;
      const r = sticks.current.right;
      // Inputs: «Einfach» (or tilting) – one stick: turn and height, flying forward by itself.
      let yawRate = 0;
      let climb = 0;
      let forward = 0;
      let strafe = 0;
      if (mode === 1 && !tilt) {
        yawRate = -l.x * 2.1;
        climb = -l.y * 7;
        forward = -r.y * 15;
        strafe = r.x * 10;
      } else {
        const x = tilt ? tiltSteer.current.x : Math.abs(r.x) + Math.abs(r.y) > Math.abs(l.x) + Math.abs(l.y) ? r.x : l.x;
        const y = tilt ? tiltSteer.current.y : Math.abs(r.x) + Math.abs(r.y) > Math.abs(l.x) + Math.abs(l.y) ? r.y : l.y;
        yawRate = -x * 1.9;
        climb = -y * 6.5;
        forward = 11.5;
      }
      if (go) {
        s.time += dt;
        if (s.stun > 0) {
          s.stun -= dt;
          yawRate = 0;
          climb = 0;
          forward = 0;
          strafe = 0;
        }
        s.yaw += yawRate * dt;
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const target: Vec = [fx * forward - fz * strafe, climb, fz * forward + fx * strafe];
        const k = Math.min(1, dt * 3);
        for (let i = 0; i < 3; i++) s.vel[i] = s.vel[i]! + (target[i]! - s.vel[i]!) * k;
        const from: Vec = [...s.pos];
        const moved: Vec = [s.pos[0] + s.vel[0] * dt, s.pos[1] + s.vel[1] * dt, s.pos[2] + s.vel[2] * dt];
        const { pos, hit } = collide(course, moved, 0.55);
        s.pos = pos;
        if (hit && s.stun <= 0) {
          s.stun = 0.35;
          for (let i = 0; i < 3; i++) s.vel[i] = -s.vel[i]! * 0.3;
          sparks.burst({ x: s.pos[0], y: s.pos[1], z: s.pos[2] }, 46, ['#ffd23f', '#ff8a3d', '#ffffff'], { speed: [1, 7], life: [0.3, 0.8], size: [0.1, 0.3], gravity: 8, intensity: 3 });
          shake.kick(0.7);
          sound.click(0.7);
          haptic([30, 30, 30]);
          setFlash({ text: 'Bumm!', id: Date.now() });
        }
        const gate = course.gates[s.next];
        if (gate && throughGate(gate, from, s.pos)) {
          const passed = gateMeshes[s.next]!.material as THREE.MeshStandardMaterial;
          passed.color.set('#9be15d');
          passed.emissive.set('#5cd12b');
          passed.emissiveIntensity = 0.9;
          sparks.burst({ x: gate.pos[0], y: gate.pos[1], z: gate.pos[2] }, 54, [skin.color, '#ffffff', '#9be15d'], { speed: [2, 8], life: [0.4, 1], size: [0.12, 0.34], drag: 1.6, intensity: 3 });
          s.next++;
          sound.ding();
          haptic(10);
          if (s.next >= course.gates.length) {
            live.current.done = true;
            const seconds = Math.round(s.time * 10) / 10;
            if (!best || seconds < best.time) {
              try {
                localStorage.setItem(ghostKey(option, player), JSON.stringify({ time: seconds, samples }));
              } catch {
                // no ghost next time
              }
            }
            setFinished(`${seconds.toFixed(1)} s`);
            confetti.burst(camera, scene);
            sound.fanfare();
            window.setTimeout(
              () =>
                onFinish({
                  score: droneScore(course, seconds),
                  stars: droneStars(course, seconds),
                  summary: `${course.name}: ${course.gates.length} Tore in ${seconds.toFixed(1)} s`,
                }),
              1500,
            );
          }
        }
        sampleIn -= dt;
        if (sampleIn <= 0) {
          sampleIn = SAMPLE;
          samples.push([Math.round(s.time * 100) / 100, ...s.pos.map((v) => Math.round(v * 10) / 10), Math.round(s.yaw * 100) / 100]);
        }
        hudIn -= dt;
        if (hudIn <= 0) {
          hudIn = 0.1;
          setHud({ time: s.time, gates: s.next });
        }
      }

      // Gate highlight, the drone, its rotors and the arrow to the next gate.
      gateMeshes.forEach((ring, i) => {
        if (i === s.next) {
          const mat = ring.material as THREE.MeshStandardMaterial;
          mat.color.set(skin.color);
          mat.emissive.set(skin.color);
          mat.emissiveIntensity = 2.2 + Math.sin(performance.now() / 160) * 0.6;
          beacon.position.copy(ring.position);
        }
      });
      beacon.visible = s.next < gateMeshes.length;
      beacon.scale.setScalar(6 + Math.sin(performance.now() / 260) * 0.8);
      world.tick(clock, dt, s.pos);
      clock += dt;
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const speedFwd = s.vel[0] * fx + s.vel[2] * fz;
      const speedSide = s.vel[0] * -fz + s.vel[2] * fx;
      drone.position.set(...s.pos);
      drone.rotation.set(Math.min(0.4, speedFwd * 0.025), s.yaw, -Math.max(-0.5, Math.min(0.5, speedSide * 0.04 + yawRate * 0.12)), 'YXZ');
      for (const rotor of rotors) rotor.rotation.y += dt * 40;
      sparks.update(dt);
      confetti.update(dt);
      const gate = course.gates[s.next];
      if (gate) {
        tmp.set(gate.pos[0] - s.pos[0], gate.pos[1] - s.pos[1], gate.pos[2] - s.pos[2]).normalize();
        arrow.position.set(s.pos[0], s.pos[1] + 0.9, s.pos[2]);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp);
        arrow.visible = true;
      } else arrow.visible = false;
      if (ghost && best) {
        const list = best.samples;
        let k = Math.min(list.length - 1, Math.floor(s.time / SAMPLE));
        while (k > 0 && list[k]![0]! > s.time) k--;
        const sample = list[k];
        if (sample) {
          ghost.position.set(sample[1]!, sample[2]!, sample[3]!);
          ghost.rotation.y = sample[4]!;
        }
      }
      const wanted = new THREE.Vector3(s.pos[0] - fx * 5, s.pos[1] + 2, s.pos[2] - fz * 5);
      camPos.lerp(wanted, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      camera.lookAt(s.pos[0] + fx * 4, s.pos[1] + 0.3, s.pos[2] + fz * 4);
      shake.apply(camera, dt, 0.5);
      // The faster, the wider the view.
      const fov = 64 + Math.min(1, Math.hypot(s.vel[0], s.vel[2]) / 15) * 10;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      sun.position.set(s.pos[0] + world.sun[2][0] * 60, s.pos[1] + world.sun[2][1] * 60 + 10, s.pos[2] + world.sun[2][2] * 60);
      sun.target.position.set(...s.pos);

      // Thumb sticks drawn where the fingers are.
      for (const [stick, el] of [
        [l, leftKnob.current],
        [r, rightKnob.current],
      ] as const) {
        if (!el) continue;
        if (stick.origin && stick.knob) {
          el.style.display = 'block';
          el.style.left = `${stick.origin.x}px`;
          el.style.top = `${stick.origin.y}px`;
          el.style.setProperty('--dx', `${stick.knob.x - stick.origin.x}px`);
          el.style.setProperty('--dy', `${stick.knob.y - stick.origin.y}px`);
        } else el.style.display = 'none';
      }
    };
    return { scene, camera, update, fx: { bloom: world.bloom, vignette: world.vignette } };
  });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 600);
    return () => window.clearTimeout(t);
  }, [flash]);

  const hint = tilt
    ? 'Handy neigen: links/rechts drehen, vor/zurück sinken/steigen'
    : mode === 1
      ? 'Links: drehen und Höhe · Rechts: vor, zurück und seitwärts'
      : 'Daumen ziehen: links/rechts drehen, hoch/runter steigen';
  return (
    <GameShell label={`Drohnen-Parcours · ${['Stadt', 'Wald', 'Halle'][option] ?? ''}`} onExit={onQuit} accent={skin.color} night={option !== 1} className="arena-shell">
      <div className="arena-hud">
        <span>
          <strong>{hud.time.toFixed(1)}</strong> s
        </span>
        <span>
          Tor <strong>{Math.min(hud.gates + 1, total.current || 1)}</strong> / {total.current || '…'}
        </span>
      </div>
      <div ref={areaRef} className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Drohnen-Parcours – mit dem Daumen steuern" />
        <span ref={leftKnob} className="arena-stick" aria-hidden="true" />
        <span ref={rightKnob} className="arena-stick" aria-hidden="true" />
        {flash && (
          <p key={flash.id} className="arena-flash is-bad">
            {flash.text}
          </p>
        )}
        {finished && <p className="arena-finish">Ziel! {finished}</p>}
        <p className={`arena-hint ${option === 1 ? 'is-dark' : ''}`}>{hint}</p>
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
