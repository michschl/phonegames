import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import {
  BALL_R,
  canPlace,
  cellY,
  CHAIN_LEVELS,
  chainScore,
  chainStars,
  createWorld,
  DOMINO_H,
  PART_KINDS,
  release,
  stepWorld,
  STEP_SECONDS,
  type PartKind,
  type Placement,
  type World,
} from '../chain.ts';
import { glowTexture, skyTexture, useArenaScene } from '../engine.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Kettenreaktion: a box seen from the front. Choose a part, tap a free field to place it (tap again: turn
 * a ramp, or take the part back), then let the ball go. The board is drawn in 3D; a grid of buttons lies
 * exactly over the board for placing.
 */

const PART_NAMES: Record<PartKind, string> = { rampe: 'Rampe', feder: 'Feder', brett: 'Brett', domino: 'Domino' };
const PART_GLYPHS: Record<PartKind, string> = { rampe: '◢', feder: '⤒', brett: '▬', domino: '▮' };
const FAILS = { out: 'Ins Leere gefallen', stuck: 'Steckt fest', time: 'Zu lange unterwegs' } as const;

function gridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f3ecff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(90, 70, 160, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);
  ctx.fillStyle = 'rgba(90, 70, 160, 0.12)';
  ctx.beginPath();
  ctx.arc(32, 32, 2.5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function stripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#2b2440';
  for (let i = -64; i < 128; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 11, 0);
    ctx.lineTo(i + 11 + 64, 64);
    ctx.lineTo(i + 64, 64);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starShape(): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.3 : 0.13;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

export default function ChainGame({ skin: skinId, option, onFinish, onQuit }: ArenaPlayProps) {
  const level = CHAIN_LEVELS[option] ?? CHAIN_LEVELS[0]!;
  const game = ARENA_GAMES.find((g) => g.id === 'kette')!;
  const skin = game.skins.find((s) => s.id === skinId) ?? game.skins[0]!;
  const rows = level.map.length;
  const cols = level.map[0]!.length;
  const kinds = PART_KINDS.filter((k) => (level.parts[k] ?? 0) > 0);
  const total = kinds.reduce((sum, k) => sum + (level.parts[k] ?? 0), 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<PartKind>(kinds[0] ?? 'rampe');
  const [phase, setPhase] = useState<'edit' | 'run' | 'done'>('edit');
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [stars, setStars] = useState(0);
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad' | 'ok'; id: number } | null>(null);

  /** The world on the board, and a counter that tells the scene to rebuild its moving parts. */
  const sim = useRef<{ world: World; version: number; hints: Placement[] }>({ world: createWorld(level, []), version: 0, hints: [] });
  const ended = useRef<(world: World) => void>(() => {});
  const show = (world: World, hintParts = sim.current.hints) => {
    sim.current = { world, version: sim.current.version + 1, hints: hintParts };
  };

  const left = (kind: PartKind) => (level.parts[kind] ?? 0) - placed.filter((p) => p.kind === kind).length;

  const setParts = (next: Placement[]) => {
    setPlaced(next);
    show(createWorld(level, next));
  };

  const tapCell = (col: number, row: number) => {
    if (phase !== 'edit') return;
    sound.unlock();
    const here = placed.find((p) => p.col === col && p.row === row);
    if (here) {
      if (here.kind === 'rampe' && here.flip) {
        setParts(placed.map((p) => (p === here ? { ...p, flip: false } : p)));
        sound.flip();
      } else {
        setParts(placed.filter((p) => p !== here));
        sound.pop();
      }
      return;
    }
    if (left(selected) <= 0) {
      setFlash({ text: `Keine ${PART_NAMES[selected]} mehr`, tone: 'bad', id: Date.now() });
      sound.wrong();
      return;
    }
    if (!canPlace(level, placed, col, row, selected)) {
      setFlash({ text: 'Braucht einen Block darunter', tone: 'bad', id: Date.now() });
      sound.wrong();
      return;
    }
    setParts([...placed, { col, row, kind: selected, flip: selected === 'rampe' ? true : undefined }]);
    sound.click(1.2);
    haptic(8);
  };

  const start = () => {
    sound.unlock();
    const world = createWorld(level, placed);
    release(world);
    show(world);
    setAttempts((a) => a + 1);
    setStars(0);
    setPhase('run');
    sound.whoosh();
  };

  const stop = () => {
    show(createWorld(level, placed));
    setPhase('edit');
  };

  const hint = () => {
    const next = hints + 1;
    setHints(next);
    sim.current.hints = level.solution.slice(0, next);
    show(phase === 'edit' ? createWorld(level, placed) : sim.current.world, level.solution.slice(0, next));
    sound.sparkle();
  };

  ended.current = (world) => {
    const collected = world.stars.filter((s) => s.taken).length;
    if (world.status === 'goal') {
      setPhase('done');
      sound.fanfare();
      haptic([20, 40, 20]);
      const tries = Math.max(1, attempts);
      window.setTimeout(
        () =>
          onFinish({
            score: chainScore(collected, total - placed.length, tries, hints),
            stars: chainStars(collected),
            summary: `Level ${option + 1}: ${collected} von 2 Sternen, ${placed.length} von ${total} Teilen, ${tries}. Versuch`,
            key: `kette:L${option + 1}`,
            records: { 'kette:level': option + 1 },
          }),
        1600,
      );
      return;
    }
    sound.wrong();
    setFlash({ text: FAILS[world.reason ?? 'stuck'], tone: 'bad', id: Date.now() });
    window.setTimeout(() => {
      show(createWorld(level, placed));
      setPhase((p) => (p === 'run' ? 'edit' : p));
    }, 1100);
  };

  const onStar = useRef<(n: number) => void>(() => {});
  onStar.current = (n) => setStars(n);

  useArenaScene(canvasRef, (renderer) => {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = skyTexture('#2a1d5c', '#7a5cd6');
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a9a, 1.3));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-5, 9, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);

    const X = (x: number) => x - cols / 2;
    const Y = (y: number) => y - rows / 2;

    // The box: back wall with a grid, frame around it.
    const gridTex = gridTexture();
    gridTex.repeat.set(cols, rows);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.MeshStandardMaterial({ map: gridTex, roughness: 0.95 }));
    back.position.z = -0.5;
    back.receiveShadow = true;
    scene.add(back);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#4a3a8c', roughness: 0.6 });
    for (const [w, h, x, y] of [
      [0.35, rows + 0.7, -cols / 2 - 0.175, 0],
      [0.35, rows + 0.7, cols / 2 + 0.175, 0],
      [cols + 0.7, 0.35, 0, rows / 2 + 0.175],
      [cols + 0.7, 0.35, 0, -rows / 2 - 0.175],
    ] as const) {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(w, h, 1.3, 2, 0.1), frameMat);
      bar.position.set(x, y, 0.1);
      bar.castShadow = true;
      bar.receiveShadow = true;
      scene.add(bar);
    }

    // Blocks (one instanced mesh), goals and buttons never change.
    const blockCells: [number, number][] = [];
    level.map.forEach((line, row) => [...line].forEach((ch, col) => ch === '#' && blockCells.push([col, row])));
    const blocks = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), blockCells.length);
    const m = new THREE.Matrix4();
    const blockColors = ['#3fc1a5', '#35ad94', '#48cfb1'];
    blockCells.forEach(([col, row], i) => {
      m.makeTranslation(X(col + 0.5), Y(cellY(rows, row) + 0.5), 0);
      blocks.setMatrixAt(i, m);
      blocks.setColorAt(i, new THREE.Color(blockColors[(col + row) % 3]!));
    });
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    scene.add(blocks);

    const goalRings: THREE.Mesh[] = [];
    const goalGlows: THREE.Sprite[] = [];
    const buttons: THREE.Mesh[] = [];
    level.map.forEach((line, row) =>
      [...line].forEach((ch, col) => {
        const x = X(col + 0.5);
        const y = Y(cellY(rows, row));
        if (ch === 'G') {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 12, 40), new THREE.MeshStandardMaterial({ color: '#9be15d', emissive: '#5cd12b', emissiveIntensity: 0.9 }));
          ring.position.set(x, y + 0.5, 0);
          ring.castShadow = true;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#b6ff7a'), transparent: true, opacity: 0.6, depthWrite: false }));
          glow.position.set(x, y + 0.5, -0.2);
          glow.scale.set(1.6, 1.6, 1);
          const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff4f6d' }));
          flag.position.set(x + 0.18, y + 1.02, 0);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
          pole.position.set(x, y + 0.98, 0);
          scene.add(ring, glow, flag, pole);
          goalRings.push(ring);
          goalGlows.push(glow);
        } else if (ch === 'b') {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.08, 24), new THREE.MeshStandardMaterial({ color: '#6b6280' }));
          base.position.set(x, y + 0.04, 0);
          const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 24), new THREE.MeshStandardMaterial({ color: '#ff4f6d', emissive: '#ff4f6d', emissiveIntensity: 0.3 }));
          top.position.set(x, y + 0.13, 0);
          top.castShadow = true;
          scene.add(base, top);
          buttons.push(top);
        }
      }),
    );

    // Shared looks of the moving parts.
    const mats = {
      ramp: new THREE.MeshStandardMaterial({ color: '#ff8a3d', roughness: 0.5 }),
      rampFixed: new THREE.MeshStandardMaterial({ color: '#b86a3a', roughness: 0.7 }),
      plank: new THREE.MeshStandardMaterial({ color: '#d9a066', roughness: 0.8 }),
      plankFixed: new THREE.MeshStandardMaterial({ color: '#9c7048', roughness: 0.8 }),
      spring: new THREE.MeshStandardMaterial({ color: '#c9d1e0', metalness: 0.7, roughness: 0.3 }),
      springTop: new THREE.MeshStandardMaterial({ color: '#ff4f6d', roughness: 0.4 }),
      springTopFixed: new THREE.MeshStandardMaterial({ color: '#a63a50', roughness: 0.6 }),
      domino: new THREE.MeshStandardMaterial({ color: '#fbfaff', roughness: 0.35 }),
      dominoFixed: new THREE.MeshStandardMaterial({ color: '#c9c3dc', roughness: 0.5 }),
      dot: new THREE.MeshStandardMaterial({ color: '#2b2440' }),
      ball: new THREE.MeshStandardMaterial({ color: skin.color, metalness: 0.35, roughness: 0.25 }),
      ball2: new THREE.MeshStandardMaterial({ color: '#3a86ff', metalness: 0.35, roughness: 0.25 }),
      gate: new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 }),
      star: new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }),
      ghost: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false }),
    };
    const geos = {
      ramp: new RoundedBoxGeometry(Math.SQRT2 + 0.04, 0.14, 0.8, 2, 0.05),
      plank: new RoundedBoxGeometry(1.02, 0.12, 0.8, 2, 0.04),
      coil: new THREE.TorusGeometry(0.2, 0.03, 8, 24).rotateX(Math.PI / 2),
      springTop: new RoundedBoxGeometry(0.62, 0.08, 0.6, 2, 0.03),
      domino: new RoundedBoxGeometry(0.18, DOMINO_H, 0.6, 2, 0.04),
      dot: new THREE.SphereGeometry(0.035, 8, 6),
      ball: new THREE.SphereGeometry(BALL_R, 32, 20),
      gate: new RoundedBoxGeometry(1, 1, 0.9, 2, 0.06),
      star: new THREE.ExtrudeGeometry(starShape(), { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).center(),
    };
    const shadowed = <T extends THREE.Object3D>(o: T) => {
      o.traverse((c) => {
        c.castShadow = true;
        c.receiveShadow = true;
      });
      return o;
    };
    const fixedAt = (col: number, row: number) => level.map[row]?.[col] !== '.';
    const partMesh = (kind: 'ramp' | 'plank' | 'spring', col: number, row: number, flip: boolean, ghost = false) => {
      const x = X(col + 0.5);
      const y = Y(cellY(rows, row));
      const fixed = !ghost && fixedAt(col, row);
      const g = new THREE.Group();
      if (kind === 'ramp') {
        const ramp = new THREE.Mesh(geos.ramp, ghost ? mats.ghost : fixed ? mats.rampFixed : mats.ramp);
        ramp.rotation.z = flip ? -Math.PI / 4 : Math.PI / 4;
        ramp.position.set(x, y + 0.5, 0);
        g.add(ramp);
      } else if (kind === 'plank') {
        const plank = new THREE.Mesh(geos.plank, ghost ? mats.ghost : fixed ? mats.plankFixed : mats.plank);
        plank.position.set(x, y + 0.04, 0);
        g.add(plank);
      } else {
        for (let i = 0; i < 3; i++) {
          const coil = new THREE.Mesh(geos.coil, ghost ? mats.ghost : mats.spring);
          coil.position.set(x, y + 0.03 + i * 0.045, 0);
          coil.name = 'coil';
          g.add(coil);
        }
        const top = new THREE.Mesh(geos.springTop, ghost ? mats.ghost : fixed ? mats.springTopFixed : mats.springTop);
        top.position.set(x, y + 0.17, 0);
        top.name = 'top';
        g.add(top);
        g.userData = { col, row, y };
      }
      return ghost ? g : shadowed(g);
    };

    let built = -1;
    let dynamic = new THREE.Group();
    scene.add(dynamic);
    let ballMeshes: THREE.Mesh[] = [];
    let dominoMeshes: THREE.Group[] = [];
    let starMeshes: THREE.Mesh[] = [];
    let gateMeshes: THREE.Mesh[] = [];
    let springGroups: THREE.Group[] = [];
    const squash = new Map<string, number>();
    let acc = 0;
    let gateDrop = 0;
    let lastBump = 0;
    let shownStars = 0;

    const rebuild = () => {
      const { world, hints: hintParts } = sim.current;
      scene.remove(dynamic);
      dynamic = new THREE.Group();
      scene.add(dynamic);
      springGroups = [];
      for (const s of world.segs) {
        const flip = s.kind === 'ramp' && s.ay > s.by;
        const g = partMesh(s.kind, s.col, s.row, flip);
        if (s.kind === 'spring') springGroups.push(g);
        dynamic.add(g);
      }
      for (const p of hintParts) {
        if (placedNow().some((q) => q.col === p.col && q.row === p.row && q.kind === p.kind && !!q.flip === !!p.flip)) continue;
        if (p.kind === 'domino') {
          const d = new THREE.Mesh(geos.domino, mats.ghost);
          d.position.set(X(p.col + 0.5), Y(cellY(rows, p.row)) + DOMINO_H / 2, 0);
          dynamic.add(d);
        } else dynamic.add(partMesh(p.kind === 'rampe' ? 'ramp' : p.kind === 'brett' ? 'plank' : 'spring', p.col, p.row, !!p.flip, true));
      }
      dominoMeshes = world.dominoes.map((d) => {
        const pivot = new THREE.Group();
        const body = new THREE.Mesh(geos.domino, d.fixed ? mats.dominoFixed : mats.domino);
        body.name = 'body';
        for (const [dy, dx] of [
          [0.35, 0],
          [-0.2, 0],
          [-0.42, 0],
        ] as const) {
          const dot = new THREE.Mesh(geos.dot, mats.dot);
          dot.position.set(dx, dy, 0.3);
          body.add(dot);
        }
        pivot.add(body);
        dynamic.add(shadowed(pivot));
        return pivot;
      });
      ballMeshes = world.balls.map((b) => {
        const ball = shadowed(new THREE.Mesh(geos.ball, b.main ? mats.ball : mats.ball2));
        dynamic.add(ball);
        return ball;
      });
      starMeshes = world.stars.map((s) => {
        const star = new THREE.Mesh(geos.star, mats.star);
        star.position.set(X(s.x), Y(s.y), 0);
        star.visible = !s.taken;
        dynamic.add(shadowed(star));
        return star;
      });
      gateMeshes = [];
      level.map.forEach((line, row) =>
        [...line].forEach((ch, col) => {
          if (ch !== 'g') return;
          const gate = new THREE.Mesh(geos.gate, mats.gate);
          gate.position.set(X(col + 0.5), Y(cellY(rows, row) + 0.5), 0);
          dynamic.add(shadowed(gate));
          gateMeshes.push(gate);
        }),
      );
      gateDrop = 0;
      shownStars = 0;
      acc = 0;
      buttons.forEach((b) => (b.position.y = b.userData.y0 ?? (b.userData.y0 = b.position.y)));
      goalRings.forEach((r) => r.scale.setScalar(1));
      built = sim.current.version;
    };

    const fit = () => {
      const fov = (camera.fov * Math.PI) / 180;
      const needH = rows + 1.4;
      const needW = cols + 1.4;
      const dist = Math.max(needH / 2 / Math.tan(fov / 2), needW / 2 / (Math.tan(fov / 2) * camera.aspect));
      camera.position.set(0, 0, dist + 0.6);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      // Lay the button grid exactly over the board.
      const grid = gridRef.current;
      const canvas = canvasRef.current;
      if (!grid || !canvas) return;
      const a = new THREE.Vector3(X(0), Y(rows), 0).project(camera);
      const b = new THREE.Vector3(X(cols), Y(0), 0).project(camera);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const left = ((a.x + 1) / 2) * w;
      const top = ((1 - a.y) / 2) * h;
      const box = [left, top, ((b.x - a.x) / 2) * w, ((a.y - b.y) / 2) * h].map((v) => `${v.toFixed(1)}px`);
      if (grid.style.left !== box[0] || grid.style.top !== box[1] || grid.style.width !== box[2] || grid.style.height !== box[3]) {
        [grid.style.left, grid.style.top, grid.style.width, grid.style.height] = box as [string, string, string, string];
      }
    };

    const update = (dt: number) => {
      fit();
      if (built !== sim.current.version) rebuild();
      const world = sim.current.world;
      if (world.status === 'run') {
        acc += dt;
        let steps = 0;
        while (acc >= STEP_SECONDS && world.status === 'run' && steps < 40) {
          acc -= STEP_SECONDS;
          steps++;
          stepWorld(world);
        }
        for (const e of world.events) {
          if (e.type === 'bump') {
            if (performance.now() - lastBump > 90) {
              sound.click(0.6 + e.strength);
              lastBump = performance.now();
            }
          } else if (e.type === 'spring') {
            squash.set(`${e.col},${e.row}`, 1);
            sound.pop();
            haptic(10);
          } else if (e.type === 'domino') sound.tap();
          else if (e.type === 'star') {
            sound.coin();
            haptic(12);
          } else if (e.type === 'button') {
            sound.ding();
            haptic([10, 30, 10]);
          } else if (e.type === 'goal') sound.sparkle();
        }
        world.events.length = 0;
        if (world.status !== 'run') ended.current(world);
      }
      // Moving parts follow the world.
      world.balls.forEach((b, i) => {
        const mesh = ballMeshes[i];
        if (!mesh) return;
        mesh.position.set(X(b.x), Y(b.y), 0);
        mesh.rotation.z = b.spin;
        mesh.visible = !b.out;
      });
      world.dominoes.forEach((d, i) => {
        const pivot = dominoMeshes[i];
        if (!pivot) return;
        pivot.position.set(X(d.x + d.dir * 0.09), Y(d.y), 0);
        pivot.rotation.z = -d.dir * d.a;
        pivot.getObjectByName('body')!.position.set(-d.dir * 0.09, DOMINO_H / 2, 0);
      });
      const taken = world.stars.filter((s) => s.taken).length;
      world.stars.forEach((s, i) => {
        const star = starMeshes[i];
        if (!star) return;
        star.rotation.y = Math.sin(performance.now() / 500 + i) * 0.7;
        if (s.taken && star.visible) {
          star.scale.multiplyScalar(1 + dt * 6);
          if (star.scale.x > 1.8) star.visible = false;
        }
      });
      if (taken !== shownStars) {
        shownStars = taken;
        onStar.current(taken);
      }
      if (world.pressed && gateDrop < 1) {
        gateDrop = Math.min(1, gateDrop + dt * 4);
        gateMeshes.forEach((g) => {
          g.scale.y = 1 - gateDrop;
          g.position.y = g.userData.y0 ?? (g.userData.y0 = g.position.y);
          g.position.y = (g.userData.y0 as number) - gateDrop * 0.5;
        });
        buttons.forEach((b) => (b.position.y = (b.userData.y0 as number) - 0.08 * gateDrop));
      }
      for (const g of springGroups) {
        const key = `${g.userData.col},${g.userData.row}`;
        const s = Math.max(0, (squash.get(key) ?? 0) - dt * 5);
        squash.set(key, s);
        const stretch = 1 + Math.sin(s * Math.PI) * 0.8;
        const y0 = g.userData.y as number;
        let i = 0;
        g.children.forEach((c) => {
          if (c.name === 'coil') c.position.y = y0 + 0.03 + i++ * 0.045 * stretch;
          if (c.name === 'top') c.position.y = y0 + 0.17 + 0.09 * (stretch - 1);
        });
      }
      world.goals.forEach((g, i) => {
        const ring = goalRings[i];
        if (!ring) return;
        ring.rotation.y = g.done ? ring.rotation.y + dt * 8 : Math.sin(performance.now() / 700) * 0.5;
        const glow = goalGlows[i]!;
        glow.material.opacity = g.done ? 1 : 0.45 + Math.sin(performance.now() / 300) * 0.15;
      });
    };
    return { scene, camera, update };
  });

  // The scene reads the placed parts for the hints without rebuilding itself.
  const placedRef = useRef(placed);
  placedRef.current = placed;
  function placedNow() {
    return placedRef.current;
  }

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1300);
    return () => window.clearTimeout(t);
  }, [flash]);

  const editing = phase === 'edit';
  return (
    <GameShell label={`Level ${option + 1}: ${level.name}`} onExit={onQuit} accent={skin.color} night className="arena-shell">
      <div className="arena-hud">
        <span>
          Versuch <strong>{Math.max(1, attempts + (editing ? 1 : 0))}</strong>
        </span>
        <span aria-label={`${stars} von 2 Sternen`}>
          {'★'.repeat(stars)}
          <span className="kette-star-off">{'★'.repeat(2 - stars)}</span>
        </span>
        <span>
          Teile <strong>{total - placed.length}</strong>/{total}
        </span>
      </div>
      <div className="arena-stage kette-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label={`Kettenreaktion, Level ${option + 1}: ${level.name}`} />
        <div ref={gridRef} className={`kette-grid${editing ? '' : ' is-off'}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {level.map.flatMap((line, row) =>
            [...line].map((ch, col) => {
              if (ch !== '.') return <span key={`${col}-${row}`} />;
              const here = placed.find((p) => p.col === col && p.row === row);
              const ok = !here && left(selected) > 0 && canPlace(level, placed, col, row, selected);
              return (
                <button
                  key={`${col}-${row}`}
                  type="button"
                  className={`kette-cell${here ? ' is-placed' : ok ? ' is-ok' : ''}`}
                  aria-label={`Feld ${col + 1}, Reihe ${row + 1}: ${here ? PART_NAMES[here.kind] : 'frei'}`}
                  tabIndex={editing ? 0 : -1}
                  onClick={() => tapCell(col, row)}
                />
              );
            }),
          )}
        </div>
        {flash && (
          <p key={flash.id} className={`arena-flash is-${flash.tone}`} aria-live="assertive">
            {flash.text}
          </p>
        )}
        {phase === 'done' && <p className="arena-finish">Kettenreaktion! 🎉</p>}
        {attempts === 0 && editing && <p className="arena-hint kette-hint">Teil wählen, Feld antippen. Nochmals tippen: drehen oder wegnehmen.</p>}
      </div>
      <div className="kette-bar">
        <div className="kette-parts" role="radiogroup" aria-label="Teil">
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected === kind}
              aria-label={`${PART_NAMES[kind]}, noch ${left(kind)}`}
              className={`kette-part${selected === kind ? ' is-on' : ''}`}
              disabled={!editing}
              onClick={() => {
                setSelected(kind);
                sound.tap();
              }}
            >
              <span className="kette-part__glyph" aria-hidden>
                {PART_GLYPHS[kind]}
              </span>
              <span>{PART_NAMES[kind]}</span>
              <strong>{left(kind)}</strong>
            </button>
          ))}
        </div>
        <div className="kette-actions">
          {attempts >= 2 && hints < level.solution.length && phase !== 'done' && (
            <Button variant="secondary" size="sm" icon="sparkles" onClick={hint}>
              Tipp
            </Button>
          )}
          <Button variant="secondary" size="sm" icon="eraser" disabled={!editing || placed.length === 0} onClick={() => setParts([])} aria-label="Alle Teile wegnehmen">
            Leeren
          </Button>
          {phase === 'run' ? (
            <Button variant="secondary" icon="undo" onClick={stop}>
              Stopp
            </Button>
          ) : (
            <Button icon="play" onClick={start} disabled={phase === 'done'}>
              Los
            </Button>
          )}
        </div>
      </div>
    </GameShell>
  );
}

