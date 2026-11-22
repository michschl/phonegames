import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { skyTexture, useArenaScene } from '../engine.ts';
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

function buildHole(map: string[], accent: string): HoleScene {
  const group = new THREE.Group();
  const rows = map.length;
  const cols = Math.max(...map.map((r) => r.length));
  const at = (x: number, z: number) => map[z]?.[x];
  const grass = new THREE.MeshStandardMaterial({ color: '#4cc25a', roughness: 0.85 });
  const grass2 = new THREE.MeshStandardMaterial({ color: '#44b352', roughness: 0.85 });
  const sand = new THREE.MeshStandardMaterial({ color: '#f1d79a', roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: '#7a5b46', roughness: 1, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: '#b7794a', roughness: 0.7 });
  const tileGeo = new THREE.BoxGeometry(1, 0.3, 1);
  const rockGeo = new THREE.CylinderGeometry(0.55, 0.15, 1.2, 5);
  const wallGeo = new THREE.BoxGeometry(1, 0.32, 1);
  const blades: THREE.Group[] = [];
  const belts: THREE.Texture[] = [];
  let tee: [number, number] = [0.5, 0.5];
  let cup: [number, number] = [0.5, 0.5];
  const flagMat = new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide });
  let flag = new THREE.Mesh();
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const ch = at(x, z);
      if (!ch || ch === '.') continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      const isBelt = ch in CONVEYOR;
      let topMat: THREE.Material = ch === '~' ? sand : (x + z) % 2 === 0 ? grass : grass2;
      if (isBelt) {
        const tex = beltTexture();
        const [dx, dz] = CONVEYOR[ch]!;
        tex.center.set(0.5, 0.5);
        tex.rotation = -Math.atan2(dz, dx);
        belts.push(tex);
        topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      }
      const tile = new THREE.Mesh(tileGeo, topMat);
      tile.position.set(cx, -0.15, cz);
      tile.receiveShadow = true;
      const stone = new THREE.Mesh(rockGeo, rock);
      stone.position.set(cx, -0.9, cz);
      group.add(tile, stone);
      if (ch === 'W') {
        const wall = new THREE.Mesh(wallGeo, wood);
        wall.position.set(cx, 0.16, cz);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);
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
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        pole.position.set(cx, 0.7, cz);
        flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), flagMat);
        flag.position.set(cx + 0.23, 1.25, cz);
        group.add(hole, pole, flag);
      }
      if (ch === 'J') {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#7a2c00', emissiveIntensity: 0.4 }));
        ramp.position.set(cx, 0.1, cz);
        ramp.rotation.x = 0.25;
        group.add(ramp);
      }
      if (ch === 'M') {
        // A windmill over the passage: the house on the wall, the blades turning in front.
        const house = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.8), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.8 }));
        house.position.set(cx, 0.9, cz - 0.4);
        house.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#e0485e', flatShading: true }));
        roof.position.set(cx, 2.05, cz - 0.4);
        roof.rotation.y = Math.PI / 4;
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.82), new THREE.MeshBasicMaterial({ color: '#2a2540' }));
        door.position.set(cx, 0.25, cz - 0.4);
        const hub = new THREE.Group();
        hub.position.set(cx, 1.15, cz + 0.08);
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.04), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
          blade.position.y = 0.55;
          const arm = new THREE.Group();
          arm.rotation.z = (i * Math.PI) / 2;
          arm.add(blade);
          hub.add(arm);
        }
        group.add(house, roof, door, hub);
        blades.push(hub);
      }
    }
  }
  return { group, map, tee, cup, blades, belts, flag, centre: new THREE.Vector3(cols / 2, 0, rows / 2), size: Math.max(cols, rows) };
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

  useArenaScene(canvasRef, () => {
    const scene = new THREE.Scene();
    scene.background = skyTexture('#4fb2ff', '#d9f1ff');
    scene.fog = new THREE.Fog(0xcfeaff, 18, 60);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.position.set(6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
    scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x3a6a8a, 1.2), sun, sun.target);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#2a8fd6', roughness: 0.3, metalness: 0.2 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -4;
    scene.add(sea);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.35, emissive: skin.id === 'neon' ? skin.color : '#000000', emissiveIntensity: 0.3 }));
    ball.castShadow = true;
    scene.add(ball);
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    scene.add(arrow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.3, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    let holeScene: HoleScene | null = null;
    let shown = -1;
    const b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, moving: false, air: false, falling: false, sunk: 0, from: [0, 0] as [number, number], time: 0, wait: 0 };
    const camTarget = new THREE.Vector3();
    const camPos = new THREE.Vector3();

    const load = (index: number) => {
      if (holeScene) {
        scene.remove(holeScene.group);
        holeScene.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      holeScene = buildHole(course.holes[index]!.map, skin.accent);
      scene.add(holeScene.group);
      shown = index;
      Object.assign(b, { x: holeScene.tee[0], z: holeScene.tee[1], y: 0, vx: 0, vz: 0, vy: 0, moving: false, air: false, falling: false, sunk: 0 });
      camTarget.copy(holeScene.centre);
      camPos.set(holeScene.centre.x, holeScene.size * 1.15 + 2, holeScene.centre.z + holeScene.size * 0.75 + 2);
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
      for (const hub of hs.blades) hub.rotation.z = -b.time * 1.6;
      for (const tex of hs.belts) tex.offset.x = (tex.offset.x - dt * 1.2) % 1;
      hs.flag.rotation.y = Math.sin(b.time * 3) * 0.25;

      if (b.sunk > 0) {
        b.sunk += dt;
        b.y = Math.max(-0.3, -b.sunk * 1.2);
      } else if (b.falling) {
        b.vy -= 14 * dt;
        b.y += b.vy * dt;
        b.x += b.vx * dt * 0.5;
        b.z += b.vz * dt * 0.5;
        if (b.y < -3.5) {
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
          if (tile === 'J' && speed > 1.2) {
            b.air = true;
            b.vy = 3 + speed * 0.3;
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
                if (vn < -1) sound.click(1.4);
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
      const ox = -hs.centre.x;
      const oz = -hs.centre.z;
      hs.group.position.set(ox, 0, oz);
      ball.position.set(b.x + ox, b.y + R, b.z + oz);
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
        (arrow.material as THREE.MeshBasicMaterial).color.setHSL(0.33 - power * 0.33, 0.9, 0.55);
      } else arrow.visible = false;
      const focus = new THREE.Vector3(b.x + ox, 0, b.z + oz).multiplyScalar(0.35);
      camTarget.lerp(focus, Math.min(1, dt * 2));
      const wanted = new THREE.Vector3(camTarget.x, hs.size * 1.05 + 2.5, camTarget.z + hs.size * 0.7 + 2);
      camPos.lerp(wanted, Math.min(1, dt * 2));
      camera.position.copy(camPos);
      camera.lookAt(camTarget.x, 0, camTarget.z - 0.5);
      sun.position.set(camTarget.x + 6, 14, camTarget.z + 8);
      sun.target.position.copy(camTarget);
    };
    return { scene, camera, update };
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
    <GameShell label={`Golfinsel · Loch ${Math.min(hole + 1, HOLES)} / ${HOLES}`} onExit={onQuit} accent="#4cc25a" className="arena-shell">
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
        <p className="arena-hint is-dark">Irgendwo tippen, zurückziehen, loslassen</p>
      </div>
    </GameShell>
  );
}
