import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { useArenaScene } from '../engine.ts';
import { Confetti, glow as glowSprite, hdr, Nebula, Particles, Shake, Trail } from '../fx.ts';
import { useSteer } from '../input.ts';
import { kugelLevel, kugelScore, kugelStars } from '../logic.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Kugelbahn: a marble on floating platforms. Tilting the phone (or dragging like a joystick) rolls it;
 * walls stop it, the edge lets it fall. Boosts push, the switch opens the doors, flags are checkpoints.
 */

const R = 0.32;
const SOLID = new Set(['W']);
const VOID = new Set(['.', undefined]);
const BOOST: Record<string, [number, number]> = { '>': [1, 0], '<': [-1, 0], v: [0, 1], '^': [0, -1] };

/** The glowing rim of a tile: a bright line around a dark face. */
function edgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  // The shine around the line is painted here: left to the bloom, so many lines would add up to a haze.
  for (const [width, alpha] of [
    [10, 0.035],
    [6, 0.07],
  ] as const) {
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = width;
    ctx.strokeRect(0, 0, 64, 64);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);
  return new THREE.CanvasTexture(canvas);
}

/** A column of light: bright at the foot, gone at the top. */
function beamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(canvas);
}

/** Level colours: from violet over teal to orange, a little different every few levels. */
function levelColors(level: number): [THREE.Color, THREE.Color, THREE.Color] {
  const hue = (0.72 + level * 0.045) % 1;
  // (As colours of the screen – the default would read them as amounts of light, which looks far paler.)
  const screen = THREE.SRGBColorSpace;
  return [new THREE.Color().setHSL(hue, 0.6, 0.23, screen), new THREE.Color().setHSL(hue, 0.6, 0.15, screen), new THREE.Color().setHSL((hue + 0.55) % 1, 0.7, 0.14, screen)];
}

export default function KugelGame({ skin: skinId, option, tilt, onFinish, onQuit }: ArenaPlayProps) {
  const map = kugelLevel(option);
  const skin = ARENA_GAMES.find((g) => g.id === 'kugel')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES[1]!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const steer = useSteer(areaRef, { tilt, range: 70 });
  const [hud, setHud] = useState({ time: 0, falls: 0 });
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad'; id: number } | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const live = useRef({ running: false, done: false });
  const countdown = useStartCountdown(() => {
    live.current.running = true;
  });

  useEffect(() => {
    countdown.begin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useArenaScene(canvasRef, (renderer) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05030f');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    const hemi = new THREE.HemisphereLight(0xc9b8ff, 0x1a1033, 0.5);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    scene.add(hemi, sun, sun.target);

    const rows = map.length;
    const cols = Math.max(...map.map((r) => r.length));
    const at = (x: number, z: number) => (z >= 0 && z < rows && x >= 0 ? map[z]![x] : undefined);
    const board = new THREE.Group();
    board.position.set(-cols / 2, 0, -rows / 2);
    const pivot = new THREE.Group();
    pivot.add(board);
    scene.add(pivot);

    const [light, dark, wallColor] = levelColors(option);
    const wallHue = wallColor.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).h;
    const neon = new THREE.Color().setHSL(wallHue, 1, 0.62, THREE.SRGBColorSpace);
    const edges = edgeTexture();
    // Deep space far below: it shifts against the board as the marble rolls.
    const hue = wallHue;
    const tint = (h: number, sat: number, l: number) => `#${new THREE.Color().setHSL(h % 1, sat, l, THREE.SRGBColorSpace).getHexString()}`;
    const nebula = new Nebula(520, {
      deep: '#03020b',
      a: tint(hue, 0.8, 0.45),
      b: tint(hue + 0.18, 0.8, 0.5),
      c: tint(hue + 0.6, 0.9, 0.6),
      seed: option + 2,
      scale: 0.9,
      stars: 0.9,
    });
    nebula.position.y = -55;
    scene.add(nebula);

    const floorTiles: [number, number][] = [];
    const wallTiles: [number, number][] = [];
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const ch = at(x, z);
        if (VOID.has(ch)) continue;
        if (ch === 'W') wallTiles.push([x, z]);
        else floorTiles.push([x, z]);
      }
    }
    const m = new THREE.Matrix4();
    const floor = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.98, 0.4, 0.98),
      new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, envMapIntensity: 0, emissive: neon, emissiveMap: edges, emissiveIntensity: 1 }),
      floorTiles.length,
    );
    floorTiles.forEach(([x, z], i) => {
      m.makeTranslation(x + 0.5, -0.2, z + 0.5);
      floor.setMatrixAt(i, m);
      floor.setColorAt(i, (x + z) % 2 === 0 ? light : dark);
    });
    floor.receiveShadow = true;
    const walls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.7, 1),
      new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.55, metalness: 0, envMapIntensity: 0, emissive: neon, emissiveMap: edges, emissiveIntensity: 1 }),
      Math.max(1, wallTiles.length),
    );
    wallTiles.forEach(([x, z], i) => {
      m.makeTranslation(x + 0.5, 0.15, z + 0.5);
      walls.setMatrixAt(i, m);
    });
    walls.count = wallTiles.length;
    walls.castShadow = true;
    walls.receiveShadow = true;
    board.add(floor, walls);

    // Special tiles.
    let start: [number, number] = [0.5, 0.5];
    const doors: THREE.Mesh[] = [];
    const checkpoints = new Map<string, THREE.Mesh>();
    let switchMesh: THREE.Mesh | null = null;
    const glow = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 2.6 });
    const boosts: [number, number, number, number][] = [];
    const beams: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
    let goalAt: [number, number] | null = null;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0.32, 0);
    arrowShape.lineTo(-0.1, 0.3);
    arrowShape.lineTo(-0.1, 0.12);
    arrowShape.lineTo(-0.32, 0.12);
    arrowShape.lineTo(-0.32, -0.12);
    arrowShape.lineTo(-0.1, -0.12);
    arrowShape.lineTo(-0.1, -0.3);
    arrowShape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2);
    let goal: THREE.Group | null = null;
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const ch = at(x, z);
        if (ch === 'S') start = [x + 0.5, z + 0.5];
        if (ch === 'D') {
          const door = new THREE.Mesh(
            new THREE.BoxGeometry(1, 0.8, 1),
            new THREE.MeshStandardMaterial({ color: '#2e7dff', transparent: true, opacity: 0.55, emissive: '#2e7dff', emissiveIntensity: 2.2, emissiveMap: edges }),
          );
          door.position.set(x + 0.5, 0.2, z + 0.5);
          board.add(door);
          doors.push(door);
        }
        if (ch === 'B') {
          switchMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#2e7dff', emissive: '#2e7dff', emissiveIntensity: 2.4 }));
          switchMesh.position.set(x + 0.5, 0.04, z + 0.5);
          const halo = glowSprite('#2e7dff', 1.8, 0.7);
          halo.position.set(x + 0.5, 0.3, z + 0.5);
          switchMesh.userData.halo = halo;
          board.add(switchMesh, halo);
        }
        if (ch === 'C') {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#e6e6ee' }));
          pole.position.set(x + 0.15, 0.45, z + 0.15);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ color: '#b8b3c9', side: THREE.DoubleSide }));
          flag.position.set(x + 0.36, 0.75, z + 0.15);
          board.add(pole, flag);
          checkpoints.set(`${x},${z}`, flag);
        }
        if (ch && BOOST[ch]) {
          const [dx, dz] = BOOST[ch]!;
          const arrow = new THREE.Mesh(arrowGeo, glow);
          arrow.position.set(x + 0.5, 0.011, z + 0.5);
          arrow.rotation.y = -Math.atan2(dz, dx);
          board.add(arrow);
          boosts.push([x + 0.5, z + 0.5, dx, dz]);
        }
        if (ch === 'G') {
          goal = new THREE.Group();
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 10, 32), new THREE.MeshBasicMaterial({ color: hdr('#8dff5a', 2.4) }));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.03;
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 3.6, 24, 1, true),
            new THREE.MeshBasicMaterial({ map: beamTexture(), color: hdr('#8dff5a', 0.9), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          );
          beam.position.y = 1.8;
          const halo = glowSprite('#8dff5a', 2, 0.5);
          halo.position.y = 0.4;
          goal.add(beam, halo);
          beams.push(beam);
          goalAt = [x + 0.5, z + 0.5];
          const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: '#b6ff7a', emissive: '#69e02b', emissiveIntensity: 2.4, metalness: 0.3, roughness: 0.2 }));
          crystal.position.y = 0.75;
          crystal.name = 'crystal';
          goal.add(ring, crystal);
          goal.position.set(x + 0.5, 0, z + 0.5);
          board.add(goal);
        }
      }
    }

    // Stars below.
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 120;
      starPos[i * 3 + 1] = -8 - Math.random() * 40;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: hdr('#ffffff', 1.6), size: 0.22, transparent: true, opacity: 0.9 })));

    const marbleMat =
      skin.id === 'galaxie'
        ? new THREE.MeshPhysicalMaterial({ color: skin.color, emissive: skin.accent, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.15, clearcoat: 1 })
        : skin.id === 'lava'
          ? new THREE.MeshPhysicalMaterial({ color: skin.color, emissive: '#ff3300', emissiveIntensity: 0.6, roughness: 0.35 })
          : skin.id === 'eis'
            ? new THREE.MeshPhysicalMaterial({ color: skin.color, transmission: 0.6, thickness: 0.5, roughness: 0.05, metalness: 0 })
            : new THREE.MeshPhysicalMaterial({ color: skin.color, metalness: 1, roughness: 0.12 });
    // (The room mirrored in the marble is bright enough to glow: keep it below that.)
    marbleMat.envMapIntensity = 0.5;
    const marble = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), marbleMat);
    marble.castShadow = true;
    board.add(marble);
    // Sparks, the trail of the marble, paper snippets at the goal and a jolt for hard knocks – all on the board.
    const sparks = new Particles(420);
    const ribbon = new Trail(34, R * 1.5, skin.accent, { intensity: 1.7 });
    const confetti = new Confetti();
    const shake = new Shake();
    board.add(sparks, ribbon);
    scene.add(confetti);
    const eye = { position: new THREE.Vector3() };
    let clock = 0;

    const state = { x: start[0], z: start[1], y: R, vx: 0, vz: 0, vy: 0, falling: false, time: 0, falls: 0, open: false, respawn: start, last: '' };
    const camPos = new THREE.Vector3();
    let hudIn = 0;
    const blocked = (x: number, z: number) => {
      const ch = at(x, z);
      return ch !== undefined && (SOLID.has(ch) || (ch === 'D' && !state.open));
    };

    const update = (dt: number) => {
      const s = state;
      clock += dt;
      nebula.tick(clock);
      const go = live.current.running && !live.current.done;
      const sx = steer.current.x;
      const sz = steer.current.y;
      pivot.rotation.set(sz * 0.07, 0, -sx * 0.07);
      if (go) {
        s.time += dt;
        const steps = 4;
        const h = dt / steps;
        for (let k = 0; k < steps; k++) {
          if (!s.falling) {
            s.vx += sx * 9 * h;
            s.vz += sz * 9 * h;
            const tile = at(Math.floor(s.x), Math.floor(s.z));
            if (tile && BOOST[tile]) {
              s.vx += BOOST[tile]![0] * 18 * h;
              s.vz += BOOST[tile]![1] * 18 * h;
            }
            const friction = 1 - 0.7 * h;
            s.vx *= friction;
            s.vz *= friction;
            const speed = Math.hypot(s.vx, s.vz);
            if (speed > 7) {
              s.vx *= 7 / speed;
              s.vz *= 7 / speed;
            }
            s.x += s.vx * h;
            s.z += s.vz * h;
            // Walls and closed doors: push out of the tile, bounce a little.
            const cx = Math.floor(s.x);
            const cz = Math.floor(s.z);
            for (let tz = cz - 1; tz <= cz + 1; tz++) {
              for (let tx = cx - 1; tx <= cx + 1; tx++) {
                if (!blocked(tx, tz)) continue;
                const nx = Math.max(tx, Math.min(s.x, tx + 1));
                const nz = Math.max(tz, Math.min(s.z, tz + 1));
                const dx = s.x - nx;
                const dz = s.z - nz;
                const dist = Math.hypot(dx, dz);
                if (dist >= R || dist === 0) continue;
                const ux = dx / dist;
                const uz = dz / dist;
                s.x = nx + ux * R;
                s.z = nz + uz * R;
                const vn = s.vx * ux + s.vz * uz;
                if (vn < 0) {
                  s.vx -= 1.4 * vn * ux;
                  s.vz -= 1.4 * vn * uz;
                  if (vn < -2.5) {
                    sound.click(0.8);
                    haptic(8);
                    sparks.burst({ x: nx, y: R, z: nz }, Math.min(18, Math.round(-vn * 3)), [neon, '#ffffff'], { speed: [0.6, 3], up: 1, life: [0.2, 0.5], size: [0.06, 0.16], gravity: 5, intensity: 2.6 });
                    shake.kick(Math.min(0.4, -vn * 0.06));
                  }
                }
              }
            }
            if (VOID.has(at(Math.floor(s.x), Math.floor(s.z)))) {
              s.falling = true;
              s.vy = 0;
              sound.whoosh();
              haptic([30, 30, 30]);
            }
          } else {
            s.vy -= 18 * h;
            s.y += s.vy * h;
            s.x += s.vx * h * 0.5;
            s.z += s.vz * h * 0.5;
          }
        }
        if (s.falling && s.y < -6) {
          s.falls++;
          s.falling = false;
          s.x = s.respawn[0];
          s.z = s.respawn[1];
          s.y = R;
          s.vx = 0;
          s.vz = 0;
          ribbon.reset();
          sparks.burst({ x: s.x, y: R, z: s.z }, 40, [skin.accent, '#ffffff'], { speed: [0.8, 3.5], up: 1.5, life: [0.4, 0.9], size: [0.08, 0.2], drag: 2, intensity: 2.6 });
          setFlash({ text: '+2 s', tone: 'bad', id: s.falls });
          sound.pop();
        }
        if (!s.falling) {
          const key = `${Math.floor(s.x)},${Math.floor(s.z)}`;
          const tile = at(Math.floor(s.x), Math.floor(s.z));
          if (key !== s.last) {
            s.last = key;
            if (tile === 'B' && !s.open) {
              s.open = true;
              sound.sparkle();
              haptic(20);
              const button = switchMesh as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> | null;
              if (button) {
                button.material.color.set('#9be15d');
                button.material.emissive.set('#5cd12b');
                (button.userData.halo as THREE.Sprite).material.color.copy(hdr('#8dff5a', 0.7));
                sparks.burst({ x: button.position.x, y: 0.2, z: button.position.z }, 40, ['#8dff5a', '#2e7dff', '#ffffff'], { speed: [1, 4], up: 2.5, life: [0.4, 0.9], size: [0.08, 0.2], gravity: 5, intensity: 2.8 });
              }
              for (const door of doors) sparks.burst(door.position, 26, ['#2e7dff', '#9bd0ff'], { speed: [0.5, 2.5], up: 1.5, life: [0.4, 0.9], size: [0.08, 0.2], gravity: 2, intensity: 2.6 });
              shake.kick(0.3);
              setFlash({ text: 'Tor offen!', tone: 'good', id: 9000 });
            }
            const cp = checkpoints.get(key);
            if (cp && (s.respawn[0] !== Math.floor(s.x) + 0.5 || s.respawn[1] !== Math.floor(s.z) + 0.5)) {
              s.respawn = [Math.floor(s.x) + 0.5, Math.floor(s.z) + 0.5];
              const cloth = cp.material as THREE.MeshStandardMaterial;
              cloth.color.set('#9be15d');
              cloth.emissive.set('#5cd12b');
              cloth.emissiveIntensity = 1.8;
              sparks.burst({ x: s.x, y: 0.5, z: s.z }, 34, ['#8dff5a', '#ffffff'], { speed: [0.8, 3.5], up: 2.5, life: [0.4, 0.9], size: [0.08, 0.2], gravity: 5, intensity: 2.8 });
              sound.ding();
            }
            if (tile === 'G') {
              live.current.done = true;
              const seconds = Math.round(s.time * 10) / 10;
              setFinished(`${seconds.toFixed(1)} s`);
              sparks.burst({ x: s.x, y: 0.5, z: s.z }, 110, ['#8dff5a', '#ffffff', '#ffd23f', skin.accent], { speed: [1, 7], up: 4, life: [0.6, 1.5], size: [0.08, 0.26], gravity: 5, intensity: 3 });
              confetti.burst(camera, scene);
              shake.kick(0.35);
              sound.fanfare();
              haptic([20, 40, 20]);
              window.setTimeout(
                () =>
                  onFinish({
                    score: kugelScore(map, seconds, s.falls),
                    stars: kugelStars(map, seconds, s.falls),
                    summary: `Level ${option + 1} in ${seconds.toFixed(1)} s${s.falls ? ` · ${s.falls}× runtergefallen` : ''}`,
                    key: `kugel:L${option + 1}`,
                    records: { 'kugel:level': option + 1 },
                  }),
                1400,
              );
            }
          }
        }
        hudIn -= dt;
        if (hudIn <= 0) {
          hudIn = 0.1;
          setHud({ time: s.time, falls: s.falls });
        }
      }
      // Doors sink once open.
      for (const door of doors) {
        if (state.open && door.position.y > -0.6) door.position.y -= dt * 1.5;
      }
      if (goal) {
        const crystal = goal.getObjectByName('crystal');
        if (crystal) {
          crystal.rotation.y += dt * 2;
          crystal.position.y = 0.75 + Math.sin(clock * 2.2) * 0.08;
        }
      }
      for (const beam of beams) beam.material.opacity = 0.26 + Math.sin(clock * 3) * 0.08;
      // Light rises from the goal; boosters throw sparks the way they push.
      if (goalAt && Math.random() < dt * 16) {
        const a = Math.random() * Math.PI * 2;
        sparks.emit(goalAt[0] + Math.cos(a) * 0.36, 0.05, goalAt[1] + Math.sin(a) * 0.36, 0, 1.2 + Math.random() * 1.5, 0, 1.2, 0.09, '#8dff5a', { intensity: 2.6 });
      }
      for (const [bx, bz, dx, dz] of boosts) {
        if (Math.random() < dt * 5) sparks.emit(bx + (Math.random() - 0.5) * 0.6, 0.06, bz + (Math.random() - 0.5) * 0.6, dx * 2.2, 0.3, dz * 2.2, 0.45, 0.09, '#ffd23f', { intensity: 2.8 });
      }
      glow.emissiveIntensity = 2.2 + Math.sin(clock * 6) * 0.8;
      // The marble rolls.
      marble.position.set(s.x, s.y, s.z);
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > 0.01) {
        const axis = new THREE.Vector3(s.vz, 0, -s.vx).normalize();
        marble.rotateOnWorldAxis(axis, (speed * dt) / R);
      }
      const world = new THREE.Vector3();
      marble.getWorldPosition(world);
      camPos.lerp(new THREE.Vector3(world.x, world.y + 10, world.z + 4.8), Math.min(1, dt * 3.5));
      camera.position.copy(camPos);
      camera.lookAt(world.x, world.y, world.z - 2);
      shake.apply(camera, dt, 0.5);
      // The trail lives on the board, so it needs the camera as seen from there.
      board.worldToLocal(eye.position.copy(camera.position));
      if (s.y > -5) ribbon.follow(s.x, s.y, s.z, dt, eye);
      sparks.update(dt);
      confetti.update(dt);
      sun.position.set(world.x + 4, world.y + 14, world.z + 6);
      sun.target.position.copy(world);
    };

    // Start the camera at the marble.
    const startWorld = new THREE.Vector3(start[0] - cols / 2, R, start[1] - rows / 2);
    camPos.set(startWorld.x, startWorld.y + 12, startWorld.z + 8);

    return {
      scene,
      camera,
      update,
      fx: { bloom: { strength: 0.6, radius: 0.65, threshold: 1 }, vignette: 0.45 },
      dispose: () => {
        env.dispose();
        pmrem.dispose();
      },
    };
  });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <GameShell label={`Kugelbahn · Level ${option + 1}`} onExit={onQuit} accent="#8b5cf6" night className="arena-shell">
      <div className="arena-hud">
        <span>
          <strong>{hud.time.toFixed(1)}</strong> s
        </span>
        {hud.falls > 0 && (
          <span>
            <em>{hud.falls}× gefallen</em>
          </span>
        )}
      </div>
      <div ref={areaRef} className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Kugelbahn – Handy neigen oder mit dem Finger ziehen" />
        {flash && (
          <p key={flash.id} className={`arena-flash is-${flash.tone}`} aria-live="assertive">
            {flash.text}
          </p>
        )}
        {finished && <p className="arena-finish">Geschafft! {finished}</p>}
        <p className="arena-hint">{tilt ? 'Handy neigen' : 'Finger ziehen wie ein Joystick'}</p>
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
