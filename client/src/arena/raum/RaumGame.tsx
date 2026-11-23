import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { starsFor } from '../../solo/logic.ts';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useArenaScene } from '../engine.ts';
import { environmentFrom, Particles, Sky, type SkyLook } from '../fx.ts';
import { makeTask, TASKS, type Cube, type RaumTask, type View } from '../raum.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Raumdenker: buildings of cubes to turn with the finger – which view belongs to it, how many cubes are
 * there, the same building or its mirror image?
 */

const VIEW_LABEL = { oben: 'von oben', vorne: 'von vorne', rechts: 'von rechts' } as const;

function ViewGrid({ view, label }: { view: View; label: string }) {
  const n = view.length;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="raum-view" role="img" aria-label={label}>
      {view.map((row, y) =>
        row.map((on, x) => <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.12} className={on ? 'is-on' : ''} />),
      )}
    </svg>
  );
}

function textSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 24);
  ctx.fill();
  ctx.fillStyle = '#1d1b26';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

/** A building of cubes, centred, with edges so every cube can be counted. */
function building(cubes: Cube[], color: string, accent: string): THREE.Group {
  const group = new THREE.Group();
  // Rounded, glossy blocks: the light on their edges shows where one cube ends and the next begins.
  const box = new RoundedBoxGeometry(0.97, 0.97, 0.97, 3, 0.09);
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.985, 0.985, 0.985));
  const lineMat = new THREE.LineBasicMaterial({ color: '#1d1b26', transparent: true, opacity: 0.55 });
  const mats = [
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
  ];
  const center = new THREE.Vector3();
  for (const [x, y, z] of cubes) center.add(new THREE.Vector3(x, y, z));
  center.divideScalar(cubes.length);
  for (const [x, y, z] of cubes) {
    const cube = new THREE.Mesh(box, mats[(x + y + z) % 2 === 0 ? 0 : 1]);
    cube.position.set(x - center.x, y - center.y, z - center.z);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.name = 'cube';
    const line = new THREE.LineSegments(edges, lineMat);
    cube.add(line);
    group.add(cube);
  }
  return group;
}

export default function RaumGame({ skin: skinId, onFinish, onQuit }: ArenaPlayProps) {
  const skin = ARENA_GAMES.find((g) => g.id === 'raum')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES[3]!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [task, setTask] = useState<RaumTask>(() => makeTask(0));
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [right, setRight] = useState(0);
  /** The last answer, for the picture: sparks or a shudder. */
  const feedback = useRef({ ok: true, at: -1e9, id: 0 });
  const shownAt = useRef(Date.now());
  const shown = useRef<{ task: RaumTask | null; groups: THREE.Group[] }>({ task: null, groups: [] });
  const turn = useRef<{ yaw: number[]; pitch: number[] }>({ yaw: [0.45, 0.45], pitch: [0.5, 0.5] });

  // Turning with the finger: the left or right building (mirror tasks), otherwise the one in the middle.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let drag: { x: number; y: number; which: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      const which = shown.current.task?.kind === 'spiegel' && e.clientX - rect.left > rect.width / 2 ? 1 : 0;
      drag = { x: e.clientX, y: e.clientY, which, id: e.pointerId };
      stage.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const t = turn.current;
      t.yaw[drag.which]! += (e.clientX - drag.x) * 0.012;
      t.pitch[drag.which] = Math.max(-1.2, Math.min(1.4, t.pitch[drag.which]! + (e.clientY - drag.y) * 0.012));
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = () => (drag = null);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    return () => {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
    };
  }, []);

  const taskRef = useRef(task);
  taskRef.current = task;

  useArenaScene(canvasRef, (renderer) => {
    const scene = new THREE.Scene();
    // A bright studio: its soft light also shows as reflections on the blocks.
    const studio: SkyLook = { top: '#eef4ff', horizon: '#a9c2dc', bottom: '#4f6880', sun: { dir: [0.4, 0.8, 0.45], color: '#fff6e6', size: 0.012, glow: 0.6 } };
    scene.add(new Sky({ top: '#8fc6ee', horizon: '#d9f1e6', bottom: '#b7dcc8' }));
    environmentFrom(renderer, scene, studio, 0.5);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.6, 11);
    camera.lookAt(0, 0, 0);
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.4);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb4c8, 0.45), sun);
    const sparks = new Particles(200, { additive: false, sharp: 1.2 });
    scene.add(sparks);
    let clock = 0;
    let born = 0;
    let seen = 0;

    const update = (dt: number) => {
      clock += dt;
      const current = taskRef.current;
      const s = shown.current;
      if (s.task !== current) {
        for (const group of s.groups) {
          scene.remove(group);
          group.traverse((o) => {
            (o as THREE.Mesh).geometry?.dispose();
          });
        }
        s.groups = [];
        s.task = current;
        turn.current = { yaw: [0.45, 0.45], pitch: [0.5, 0.5] };
        if (current.kind === 'spiegel') {
          const left = building(current.left, skin.color, skin.accent);
          const rightGroup = building(current.right, skin.color, skin.accent);
          left.position.x = -2.6;
          rightGroup.position.x = 2.6;
          left.scale.setScalar(0.72);
          rightGroup.scale.setScalar(0.72);
          s.groups = [left, rightGroup];
        } else {
          const group = building(current.cubes, skin.color, skin.accent);
          // Where «vorne» and «rechts» are – needed for the views.
          const span = Math.max(...current.cubes.map((c) => Math.max(c[0], c[2]))) + 1;
          const front = textSprite('VORNE');
          front.position.set(0, -span / 2 - 0.1, span / 2 + 0.75);
          const side = textSprite('RECHTS');
          side.position.set(span / 2 + 0.95, -span / 2 - 0.1, 0);
          const plate = new THREE.Mesh(new RoundedBoxGeometry(span + 0.7, 0.14, span + 0.7, 2, 0.06), new THREE.MeshStandardMaterial({ color: '#e9edf3', roughness: 0.6 }));
          plate.receiveShadow = true;
          const minY = Math.min(...current.cubes.map((c) => c[1]));
          const avgY = current.cubes.reduce((sum, c) => sum + c[1], 0) / current.cubes.length;
          plate.position.y = minY - avgY - 0.56;
          front.position.y = plate.position.y;
          side.position.y = plate.position.y;
          group.add(plate, front, side);
          s.groups = [group];
        }
        for (const group of s.groups) scene.add(group);
        const size = current.kind === 'spiegel' ? 10 : Math.max(...current.cubes.flat()) + 10;
        camera.position.set(0, 0.6, size);
        born = clock;
      }
      // A new building is put together cube by cube.
      s.groups.forEach((group, i) => {
        const t = turn.current;
        group.rotation.set(t.pitch[i]!, t.yaw[i]!, 0, 'XYZ');
        let n = 0;
        for (const child of group.children) {
          if (child.name !== 'cube') continue;
          const age = (clock - born - n++ * 0.035) / 0.32;
          const grow = age <= 0 ? 0.001 : age >= 1 ? 1 : 1 + 0.18 * Math.sin(age * Math.PI) - (1 - age) ** 3;
          child.scale.setScalar(Math.max(0.001, grow));
        }
      });
      // The answer: sparks for a right one, a shudder for a wrong one.
      const f = feedback.current;
      if (f.id !== seen) {
        seen = f.id;
        if (f.ok) {
          sparks.burst({ x: 0, y: 0.4, z: 1.5 }, 70, ['#34c759', '#ffd23f', skin.color, '#ffffff'], { speed: [2, 8], up: 2.5, life: [0.6, 1.3], size: [0.14, 0.36], gravity: 7 });
        }
      }
      const since = (performance.now() - f.at) / 1000;
      const jolt = !f.ok && since < 0.45 ? Math.sin(since * 46) * (0.45 - since) * 0.5 : 0;
      const cheer = f.ok && since < 0.5 ? 1 + Math.sin((since / 0.5) * Math.PI) * 0.09 : 1;
      s.groups.forEach((group, i) => {
        const base = current.kind === 'spiegel' ? 0.72 : 1;
        group.scale.setScalar(base * cheer);
        group.position.x = (current.kind === 'spiegel' ? (i === 0 ? -2.6 : 2.6) : 0) + jolt;
        group.position.y = Math.sin(clock * 1.3 + i) * 0.05;
      });
      sparks.update(dt);
    };
    return { scene, camera, update, fx: { bloom: { strength: 0.22, radius: 0.5, threshold: 1.5 }, vignette: 0.22 } };
  });

  const correct = (choice: number) => {
    if (task.kind === 'spiegel') return (choice === 1) === task.mirrored;
    if (task.kind === 'zaehlen') return task.options[choice] === task.answer;
    return choice === task.answer;
  };

  const answer = (choice: number) => {
    if (chosen !== null) return;
    sound.unlock();
    setChosen(choice);
    const ok = correct(choice);
    const seconds = (Date.now() - shownAt.current) / 1000;
    const nextScore = ok ? score + 100 + Math.max(0, Math.round(60 - seconds * 3)) : score;
    const nextRight = ok ? right + 1 : right;
    feedback.current = { ok, at: performance.now(), id: feedback.current.id + 1 };
    if (ok) {
      sound.correct();
      haptic(10);
    } else {
      sound.wrong();
      haptic([25, 30, 25]);
    }
    setScore(nextScore);
    setRight(nextRight);
    window.setTimeout(
      () => {
        if (index + 1 >= TASKS) {
          onFinish({ score: nextScore, stars: starsFor(nextRight / TASKS), summary: `${nextRight} von ${TASKS} Aufgaben richtig` });
          return;
        }
        setIndex(index + 1);
        setTask(makeTask(index + 1));
        setChosen(null);
        shownAt.current = Date.now();
      },
      ok ? 900 : 1700,
    );
  };

  const state = (choice: number) => (chosen === null ? '' : correct(choice) ? 'is-right' : chosen === choice ? 'is-wrong' : '');

  return (
    <GameShell label={`Aufgabe ${index + 1} von ${TASKS}`} onExit={onQuit} accent={skin.color} className="arena-shell raum">
      <div className="arena-hud">
        <span>
          Richtig <strong>{right}</strong>
        </span>
        <span>
          Punkte <strong>{score}</strong>
        </span>
      </div>
      <p className="raum-ask">
        {task.kind === 'ansicht'
          ? `Wie sieht der Bau ${VIEW_LABEL[task.view]} aus?`
          : task.kind === 'zaehlen'
            ? 'Aus wie vielen Würfeln besteht der Bau? Versteckte zählen mit – kein Würfel schwebt.'
            : 'Ist der rechte Bau derselbe wie der linke – nur gedreht – oder sein Spiegelbild?'}
      </p>
      <div ref={stageRef} className="arena-stage raum-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Würfelbau – mit dem Finger drehen" />
        <p className="arena-hint raum-hint">Mit dem Finger drehen</p>
      </div>
      <div className={`raum-options is-${task.kind}`} role="group" aria-label="Antworten">
        {task.kind === 'ansicht' &&
          task.options.map((view, i) => (
            <button key={i} type="button" className={`raum-option ${state(i)}`} disabled={chosen !== null} onClick={() => answer(i)}>
              <ViewGrid view={view} label={`Ansicht ${String.fromCharCode(65 + i)}`} />
            </button>
          ))}
        {task.kind === 'zaehlen' &&
          task.options.map((n, i) => (
            <button key={n} type="button" className={`raum-option is-number ${state(i)}`} disabled={chosen !== null} onClick={() => answer(i)}>
              {n}
            </button>
          ))}
        {task.kind === 'spiegel' &&
          ['Gleich, nur gedreht', 'Spiegelbild'].map((label, i) => (
            <button key={label} type="button" className={`raum-option is-text ${state(i)}`} disabled={chosen !== null} onClick={() => answer(i)}>
              {label}
            </button>
          ))}
      </div>
    </GameShell>
  );
}
