import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { collide, droneScore, droneStars, makeDroneCourse, throughGate, type DroneCourse, type Vec } from '../drone.ts';
import { skyTexture, useArenaScene } from '../engine.ts';
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
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.04), mat(accent, { emissive: accent, emissiveIntensity: 2 }));
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

function buildWorld(scene: THREE.Scene, course: DroneCourse): void {
  if (course.indoor) {
    scene.background = new THREE.Color('#1d1832');
    scene.fog = new THREE.Fog(0x1d1832, 30, 90);
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 64;
    floorCanvas.height = 64;
    const g = floorCanvas.getContext('2d')!;
    g.fillStyle = '#3a3358';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#463e6a';
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(floorCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(course.size / 2, course.size / 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(course.size * 2, course.size * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#4a4180', roughness: 0.9, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(course.size * 2, course.ceiling, course.size * 2), wallMat);
    room.position.y = course.ceiling / 2;
    scene.add(room);
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff6d8' });
    for (let x = -course.size + 8; x < course.size; x += 16) {
      for (let z = -course.size + 8; z < course.size; z += 16) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1), lampMat);
        lamp.position.set(x, course.ceiling - 0.2, z);
        scene.add(lamp);
      }
    }
  } else {
    scene.background = skyTexture(course.name === 'Wald' ? '#7ec8ff' : '#5aa9ff', '#e6f4ff');
    scene.fog = new THREE.Fog(course.name === 'Wald' ? 0xcfe8d6 : 0xdcecff, 40, 170);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(course.size * 4, course.size * 4),
      new THREE.MeshStandardMaterial({ color: course.name === 'Wald' ? '#6fbf5a' : '#8d93a6', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  const m = new THREE.Matrix4();
  const boxes = course.obstacles.filter((o) => o.kind === 'box');
  if (boxes.length > 0) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), boxes.length);
    const color = new THREE.Color();
    boxes.forEach((o, i) => {
      if (o.kind !== 'box') return;
      const size = new THREE.Vector3(o.max[0] - o.min[0], o.max[1] - o.min[1], o.max[2] - o.min[2]);
      m.compose(new THREE.Vector3((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2, (o.min[2] + o.max[2]) / 2), new THREE.Quaternion(), size);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(o.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const trees = course.obstacles.filter((o) => o.kind === 'tree');
  if (trees.length > 0) {
    const crown = mergeGeometries([new THREE.ConeGeometry(1, 0.55, 7).translate(0, 0.5, 0), new THREE.ConeGeometry(0.75, 0.45, 7).translate(0, 0.8, 0)])!;
    const foliage = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#1f6b4a', flatShading: true }), trees.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#6b4a32' }), trees.length);
    trees.forEach((o, i) => {
      if (o.kind !== 'tree') return;
      m.compose(new THREE.Vector3(o.x, 0, o.z), new THREE.Quaternion(), new THREE.Vector3(o.r * 1.9, o.h, o.r * 1.9));
      foliage.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(o.x, 0, o.z), new THREE.Quaternion(), new THREE.Vector3(o.r * 1.2, o.h * 0.4, o.r * 1.2));
      trunks.setMatrixAt(i, m);
    });
    foliage.castShadow = true;
    scene.add(foliage, trunks);
  }
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

  useArenaScene(canvasRef, () => {
    const course = makeDroneCourse(option, 3100 + option * 17);
    total.current = course.gates.length;
    const scene = new THREE.Scene();
    buildWorld(scene, course);
    const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 400);
    const sun = new THREE.DirectionalLight(0xffffff, course.indoor ? 1.2 : 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 });
    scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x556070, course.indoor ? 2 : 1.3), sun, sun.target);

    // Gates: the next one glows, passed ones fade.
    const gateMeshes = course.gates.map((gate) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(gate.radius, 0.16, 10, 40),
        new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.3 }),
      );
      ring.position.set(...gate.pos);
      ring.rotation.y = gate.yaw;
      scene.add(ring);
      return ring;
    });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 12), new THREE.MeshBasicMaterial({ color: skin.color }));
    scene.add(arrow);

    const { group: drone, rotors } = makeDrone(skin.color, skin.accent);
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
          sound.click(0.7);
          haptic([30, 30, 30]);
          setFlash({ text: 'Bumm!', id: Date.now() });
        }
        const gate = course.gates[s.next];
        if (gate && throughGate(gate, from, s.pos)) {
          (gateMeshes[s.next]!.material as THREE.MeshStandardMaterial).color.set('#9be15d');
          (gateMeshes[s.next]!.material as THREE.MeshStandardMaterial).emissive.set('#2f7a12');
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
          mat.emissiveIntensity = 0.6 + Math.sin(performance.now() / 160) * 0.3;
        }
      });
      const fx = Math.sin(s.yaw);
      const fz = Math.cos(s.yaw);
      const speedFwd = s.vel[0] * fx + s.vel[2] * fz;
      const speedSide = s.vel[0] * -fz + s.vel[2] * fx;
      drone.position.set(...s.pos);
      drone.rotation.set(Math.min(0.4, speedFwd * 0.025), s.yaw, -Math.max(-0.5, Math.min(0.5, speedSide * 0.04 + yawRate * 0.12)), 'YXZ');
      for (const rotor of rotors) rotor.rotation.y += dt * 40;
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
      sun.position.set(s.pos[0] + 15, s.pos[1] + 30, s.pos[2] + 10);
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
    return { scene, camera, update };
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
    <GameShell label={`Drohnen-Parcours · ${['Stadt', 'Wald', 'Halle'][option] ?? ''}`} onExit={onQuit} accent={skin.color} className="arena-shell">
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
        <p className={`arena-hint ${option === 2 ? '' : 'is-dark'}`}>{hint}</p>
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
