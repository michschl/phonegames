import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { useArenaScene } from '../engine.ts';
import { Confetti, environmentFrom, glow, hdr, Particles, Shake, Sky, softDot, type SkyLook } from '../fx.ts';
import { useSteer } from '../input.ts';
import { makeCourse, pisteScore, pisteStars, RUNS } from '../logic.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Pistenjagd: a run down a winding piste, seen from behind the skier. Steering turns the skis; the slope
 * pulls, carving and deep snow brake. Gates, jumps, trees and rocks; a ghost replays the best run.
 */

const SLOPE = 0.3;
const SAMPLE = 0.1;

/** The time of day of a piste: a clear morning, the last sun of the evening, a night under northern lights. */
interface Mood {
  sky: SkyLook;
  sun: [number, number, number];
  sunLight: [string, number];
  hemi: [number, number, number];
  fog: [string, number, number];
  snow: [string, string, string];
  spray: string;
  rock: string;
  bloom: { strength: number; radius: number; threshold: number };
  exposure: number;
  night: boolean;
}

const MOODS: Mood[] = [
  {
    sky: { top: '#0b55d0', horizon: '#9fd0ff', sun: { dir: [0.1, 0.13, -0.98], color: '#fff4dc', size: 0.0009 }, clouds: 0.4 },
    sun: [0.1, 0.13, -0.98],
    sunLight: ['#fff4e0', 2.6],
    hemi: [0xeaf4ff, 0x8fa5cc, 1.05],
    fog: ['#bfe0ff', 60, 260],
    snow: ['#ffffff', '#cfe0f6', '#b9cfea'],
    spray: '#ffffff',
    rock: '#7f8fae',
    bloom: { strength: 0.45, radius: 0.7, threshold: 1.25 },
    exposure: 0.95,
    night: false,
  },
  {
    sky: { top: '#2f3f93', horizon: '#ffad72', bottom: '#f2a071', sun: { dir: [-0.09, 0.1, -0.99], color: '#ffb25e', size: 0.0016, glow: 1.6 }, clouds: 0.5, cloudColor: '#ffc4b0' },
    sun: [-0.09, 0.1, -0.99],
    sunLight: ['#ffb070', 2.9],
    hemi: [0xb9c4ff, 0x8a7fb5, 0.85],
    fog: ['#f3b490', 55, 250],
    snow: ['#fff1e6', '#c9c6ee', '#b3aee0'],
    spray: '#ffe9d9',
    rock: '#7a6f98',
    bloom: { strength: 0.6, radius: 0.75, threshold: 1.2 },
    exposure: 0.95,
    night: false,
  },
  {
    sky: { top: '#03050f', horizon: '#14244f', sun: { dir: [0.11, 0.14, -0.98], color: '#e3ecff', size: 0.0005, glow: 0.45 }, stars: 1, aurora: 1 },
    sun: [0.11, 0.14, -0.98],
    sunLight: ['#9fb6ff', 1.1],
    hemi: [0x6f87d8, 0x18223f, 0.6],
    fog: ['#0e1a3a', 45, 230],
    snow: ['#cfdcff', '#8fa3d6', '#7f93c8'],
    spray: '#dfe8ff',
    rock: '#4c5878',
    bloom: { strength: 0.8, radius: 0.75, threshold: 1 },
    exposure: 1.05,
    night: true,
  },
];

/** Glitter on the snow: a few bright grains, repeated over the piste. They show only close to the camera. */
function glitterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 30; i++) {
    const v = 120 + Math.floor(Math.random() * 135);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(Math.random() * 128), Math.floor(Math.random() * 128), 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

interface Ghost {
  time: number;
  samples: [number, number, number][]; // t, d, x
}

const ghostKey = (run: number, player: string) => `phonegames-ghost-piste-${run}-${player.toLowerCase()}`;

function loadGhost(run: number, player: string): Ghost | null {
  try {
    const raw = localStorage.getItem(ghostKey(run, player));
    return raw ? (JSON.parse(raw) as Ghost) : null;
  } catch {
    return null;
  }
}

function saveGhost(run: number, player: string, ghost: Ghost): void {
  try {
    localStorage.setItem(ghostKey(run, player), JSON.stringify(ghost));
  } catch {
    // Full or blocked storage: no ghost next time.
  }
}

/** A skier made of simple shapes, facing −z. */
function makeSkier(color: string, accent: string, ghost = false): THREE.Group {
  const group = new THREE.Group();
  const mat = (c: string) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true, transparent: ghost, opacity: ghost ? 0.38 : 1, depthWrite: !ghost });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 8), mat(color));
  body.position.y = 1.05;
  body.rotation.x = -0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(accent));
  head.position.set(0, 1.72, -0.22);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), mat('#2ec5ff'));
  goggles.position.set(0, 1.72, -0.45);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), mat('#2a2540'));
  legs.position.set(0, 0.45, 0.05);
  legs.rotation.x = 0.25;
  const skiGeo = new THREE.BoxGeometry(0.12, 0.05, 1.9);
  const skiL = new THREE.Mesh(skiGeo, mat(accent));
  skiL.position.set(-0.18, 0.04, -0.15);
  const skiR = skiL.clone();
  skiR.position.x = 0.18;
  const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.25, 5);
  const poleL = new THREE.Mesh(poleGeo, mat('#e6e6ee'));
  poleL.position.set(-0.5, 0.75, 0.15);
  poleL.rotation.x = 0.5;
  const poleR = poleL.clone();
  poleR.position.x = 0.5;
  group.add(body, head, goggles, legs, skiL, skiR, poleL, poleR);
  if (!ghost) group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return group;
}

function makeTreeGeometry(): { foliage: THREE.BufferGeometry; trunk: THREE.BufferGeometry } {
  const parts = [
    new THREE.ConeGeometry(1.6, 2.4, 7).translate(0, 2.2, 0),
    new THREE.ConeGeometry(1.25, 2.0, 7).translate(0, 3.4, 0),
    new THREE.ConeGeometry(0.85, 1.6, 7).translate(0, 4.5, 0),
  ];
  // Snow lies on the tips: every cone runs from green at its rim to white at its point.
  const green = new THREE.Color('#1f6b4a');
  const white = new THREE.Color('#f4f9ff');
  for (const part of parts) {
    part.computeBoundingBox();
    const { min, max } = part.boundingBox!;
    const position = part.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const c = (position.getY(i) - min.y) / (max.y - min.y) > 0.5 ? white : green;
      colors.push(c.r, c.g, c.b);
    }
    part.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  return { foliage: mergeGeometries(parts)!, trunk: new THREE.CylinderGeometry(0.22, 0.28, 1.4, 6).translate(0, 0.7, 0) };
}

function finishBanner(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff4f6d';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ZIEL', 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function PisteGame({ player, skin: skinId, option, tilt, onFinish, onQuit }: ArenaPlayProps) {
  const run = RUNS[option] ?? RUNS[0]!;
  const skin = ARENA_GAMES.find((g) => g.id === 'piste')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES[0]!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const steer = useSteer(areaRef, { tilt, range: 80 });
  const [hud, setHud] = useState({ time: 0, speed: 0, gates: 0, missed: 0 });
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad'; id: number } | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const live = useRef({ running: false, done: false });
  // The same course for each piste every time – the ghost and the family leaderboard compare like with like.
  const seed = 2026 + option * 101;
  const countdown = useStartCountdown(() => {
    live.current.running = true;
  });

  useEffect(() => {
    countdown.begin();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useArenaScene(canvasRef, (renderer) => {
    const course = makeCourse(option, seed);
    const mood = MOODS[option % MOODS.length]!;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(mood.fog[0], mood.fog[1], mood.fog[2]);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
    const sky = new Sky(mood.sky);
    scene.add(sky);
    environmentFrom(renderer, scene, mood.sky, mood.night ? 0.35 : 0.5);

    // The sun (at night: the moon) stands ahead over the valley; shadows fall towards the camera.
    const hemi = new THREE.HemisphereLight(mood.hemi[0], mood.hemi[1], mood.hemi[2]);
    const sun = new THREE.DirectionalLight(mood.sunLight[0], mood.sunLight[1]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0008;
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 140 });
    scene.add(hemi, sun, sun.target);
    // At night a lamp on the helmet lights the snow ahead.
    const lamp = new THREE.PointLight(0xfff0d0, 16, 60, 1.2);
    if (mood.night) scene.add(lamp);

    const heightAt = (x: number, d: number) => {
      const off = Math.abs(x - course.center(d)) - course.run.halfWidth;
      const bumps = off > 0 ? Math.min(1, off / 8) * (Math.sin(x * 0.35 + d * 0.21) * Math.cos(d * 0.13 - x * 0.2) * 1.3 + 0.6) : 0;
      return -d * SLOPE + bumps;
    };

    // The mountain: a long strip of snow with the groomed piste in the middle.
    const length = course.run.length + 240;
    const terrain = new THREE.PlaneGeometry(150, length, 60, Math.ceil(length / 4));
    terrain.rotateX(-Math.PI / 2);
    const pos = terrain.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const piste = new THREE.Color(mood.snow[0]);
    const powder = new THREE.Color(mood.snow[1]);
    const edge = new THREE.Color(mood.snow[2]);
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const d = -pos.getZ(i) + length / 2 - 60;
      const cx = course.center(d);
      const x = pos.getX(i) + cx * 0.85;
      pos.setX(i, x);
      pos.setZ(i, -d);
      pos.setY(i, heightAt(x, d));
      const off = Math.abs(x - cx) - course.run.halfWidth;
      color.copy(off < -0.5 ? piste : off < 1.5 ? edge : powder);
      if (off < -0.5 && Math.floor(x * 1.2) % 2 === 0) color.multiplyScalar(0.985); // groomed lines
      colors.push(color.r, color.g, color.b);
    }
    terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    const glitter = glitterTexture();
    glitter.repeat.set(150 / 5, length / 5);
    const ground = new THREE.Mesh(
      terrain,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.6, emissive: mood.sunLight[0], emissiveMap: glitter, emissiveIntensity: mood.night ? 1.8 : 2.4 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    // Forest and rocks.
    const { foliage, trunk } = makeTreeGeometry();
    const trees = course.obstacles.filter((o) => o.kind === 'tree');
    const rocks = course.obstacles.filter((o) => o.kind === 'rock');
    const foliageMesh = new THREE.InstancedMesh(foliage, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), trees.length);
    const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: '#6b4a32', flatShading: true }), trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    trees.forEach((t, i) => {
      const s = 0.8 + ((t.z * 13.7 + t.x) % 1 + 1) % 1 * 0.7;
      scale.set(s, s, s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.z);
      m.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.2, -t.z), q, scale);
      foliageMesh.setMatrixAt(i, m);
      trunkMesh.setMatrixAt(i, m);
    });
    foliageMesh.castShadow = true;
    const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshStandardMaterial({ color: '#7d8798', roughness: 0.9, flatShading: true }), rocks.length);
    rocks.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(r.z, r.x, 0));
      m.compose(new THREE.Vector3(r.x, heightAt(r.x, r.z) + 0.2, -r.z), q, new THREE.Vector3(1, 0.7, 1));
      rockMesh.setMatrixAt(i, m);
    });
    rockMesh.castShadow = true;
    scene.add(foliageMesh, trunkMesh, rockMesh);

    // Gates: two poles with flags.
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    const flagGeo = new THREE.PlaneGeometry(0.9, 0.7);
    const lit = mood.night ? 1.8 : 0.35;
    const red = new THREE.MeshStandardMaterial({ color: '#ff3b5c', side: THREE.DoubleSide, emissive: '#ff2848', emissiveIntensity: lit });
    const blue = new THREE.MeshStandardMaterial({ color: '#2e7dff', side: THREE.DoubleSide, emissive: '#2e7dff', emissiveIntensity: lit });
    const gateFlags: THREE.Mesh[][] = [];
    for (const gate of course.gates) {
      const mat = gate.color === 'red' ? red : blue;
      const flags: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const x = gate.x + (side * course.run.gateWidth) / 2;
        const y = heightAt(x, gate.z);
        const pole = new THREE.Mesh(poleGeo, mat);
        pole.position.set(x, y + 1.1, -gate.z);
        const flag = new THREE.Mesh(flagGeo, mat.clone());
        flag.position.set(x - side * 0.45, y + 1.75, -gate.z);
        scene.add(pole, flag);
        flags.push(flag);
      }
      gateFlags.push(flags);
    }

    // Jumps: ramps across the piste.
    for (const jump of course.jumps) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(jump.halfWidth * 2, 0.9, 5), new THREE.MeshStandardMaterial({ color: '#f2f7ff', flatShading: true }));
      ramp.position.set(jump.x, heightAt(jump.x, jump.z) + 0.1, -jump.z + 1.5);
      ramp.rotation.x = -0.32;
      ramp.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(jump.halfWidth * 2, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: '#ff8a3d' }));
      stripe.position.set(jump.x, heightAt(jump.x, jump.z) + 0.9, -jump.z - 0.6);
      scene.add(ramp, stripe);
    }

    // Edge markers along the piste.
    const markerGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5);
    const markers = new THREE.InstancedMesh(markerGeo, new THREE.MeshStandardMaterial({ color: '#ff8a3d', emissive: '#ff6a00', emissiveIntensity: mood.night ? 2.6 : 0.3 }), Math.ceil(course.run.length / 20) * 2 + 4);
    let mi = 0;
    for (let d = 0; d <= course.run.length; d += 20) {
      for (const side of [-1, 1]) {
        const x = course.center(d) + side * (course.run.halfWidth + 0.8);
        m.compose(new THREE.Vector3(x, heightAt(x, d) + 0.8, -d), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        markers.setMatrixAt(mi++, m);
      }
    }
    markers.count = mi;
    scene.add(markers);

    // The finish.
    const fz = course.run.length;
    const fx = course.center(fz);
    const fy = heightAt(fx, fz);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(course.run.halfWidth * 2, course.run.halfWidth / 2), new THREE.MeshStandardMaterial({ map: finishBanner(), side: THREE.DoubleSide }));
    banner.position.set(fx, fy + 6, -fz);
    const pillarGeo = new THREE.BoxGeometry(0.8, 7, 0.8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: '#1d1b26' });
    const p1 = new THREE.Mesh(pillarGeo, pillarMat);
    p1.position.set(fx - course.run.halfWidth, fy + 3.5, -fz);
    const p2 = p1.clone();
    p2.position.x = fx + course.run.halfWidth;
    scene.add(banner, p1, p2);
    for (const side of [-1, 1]) {
      const light = glow('#ffd98a', 9, mood.night ? 1.1 : 0.35);
      light.position.set(fx + side * course.run.halfWidth, fy + 7.4, -fz);
      scene.add(light);
    }

    // Mountains far away, moved along with the camera.
    const mountains = new THREE.Group();
    // (No fog on them: the haze of the distance is mixed into their colours, so they keep their light and shade.)
    const haze = new THREE.Color(mood.fog[0]);
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mood.rock).lerp(haze, 0.5), flatShading: true, roughness: 1, fog: false });
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(mood.snow[0]).lerp(haze, 0.3), flatShading: true, roughness: 1, fog: false });
    for (let i = 0; i < 13; i++) {
      const near = i % 2 === 0;
      const radius = (near ? 60 : 90) + (i % 3) * 26;
      const height = (near ? 90 : 130) + (i % 4) * 26;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), rockMat);
      peak.position.set(-400 + i * 66, -78, near ? -340 : -470);
      peak.rotation.y = i * 1.3;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.46, height * 0.46, 7), capMat);
      cap.position.set(peak.position.x, peak.position.y + height * 0.27 + 0.5, peak.position.z);
      cap.rotation.y = peak.rotation.y;
      mountains.add(peak, cap);
    }
    scene.add(mountains);

    // Snow dust from the skis, sparks at the gates, paper snippets at the finish, a jolt on a crash.
    const dust = new Particles(340, { additive: false, sharp: 0.9 });
    const sparks = new Particles(260);
    const confetti = new Confetti();
    const shake = new Shake();
    scene.add(dust, sparks, confetti);


    // Falling snow around the camera.
    const flakes = 500;
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(flakes * 3);
    for (let i = 0; i < flakes; i++) {
      snowPos[i * 3] = (Math.random() - 0.5) * 60;
      snowPos[i * 3 + 1] = Math.random() * 30;
      snowPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: softDot(), color: mood.night ? hdr('#dfe8ff', 1.1) : '#ffffff', size: 0.3, transparent: true, opacity: mood.night ? 0.9 : 0.6, depthWrite: false }));
    scene.add(snow);

    const skier = makeSkier(skin.color, skin.accent);
    scene.add(skier);
    const best = loadGhost(option, player);
    const ghost = best ? makeSkier('#9fe3ff', '#ffffff', true) : null;
    if (ghost) scene.add(ghost);

    // The run.
    const state = { d: 0, x: course.center(0), v: 0, heading: 0, h: 0, vy: 0, crash: 0, time: 0, gate: 0, passed: 0, missed: 0, obstacle: 0 };
    const samples: [number, number, number][] = [];
    let sampleIn = 0;
    let hudIn = 0;
    const camPos = new THREE.Vector3(state.x, 8, 10);
    let clock = 0;
    const lookAt = new THREE.Vector3();
    const sorted = [...course.obstacles].sort((a, b) => a.z - b.z);

    const update = (dt: number) => {
      const s = state;
      const go = live.current.running && !live.current.done;
      if (go) {
        s.time += dt;
        if (s.crash > 0) s.crash -= dt;
        const target = s.crash > 0 ? 0 : steer.current.x * 1.05;
        s.heading += (target - s.heading) * Math.min(1, dt * 5);
        const off = Math.abs(s.x - course.center(s.d)) > course.run.halfWidth + 0.5;
        const pull = 7.5 * Math.cos(s.heading);
        const drag = (7.5 / (course.run.maxSpeed * course.run.maxSpeed)) * s.v * s.v + (off ? 1.1 * s.v : 0) + Math.abs(Math.sin(s.heading)) * 1.6;
        s.v = Math.max(s.d < 2 ? 4 : 1.5, s.v + (pull - drag) * dt);
        s.d += s.v * Math.cos(s.heading) * dt;
        s.x += s.v * Math.sin(s.heading) * dt;
        const cx = course.center(s.d);
        s.x = Math.max(cx - course.run.halfWidth - 20, Math.min(cx + course.run.halfWidth + 20, s.x));
        // In the air after a jump.
        if (s.h > 0 || s.vy > 0) {
          s.vy -= 20 * dt;
          s.h = Math.max(0, s.h + s.vy * dt);
          if (s.h === 0) {
            s.vy = 0;
            dust.burst({ x: s.x, y: heightAt(s.x, s.d) + 0.2, z: -s.d }, 34, [mood.spray], { speed: [1, 6], up: 2.5, life: [0.4, 0.9], size: [0.5, 1.3], gravity: 6, alpha: 0.7 });
            shake.kick(0.3);
            sound.pop();
            haptic(15);
          }
        }
        for (const jump of course.jumps) {
          if (s.h === 0 && s.d - s.v * dt < jump.z && s.d >= jump.z && Math.abs(s.x - jump.x) < jump.halfWidth) {
            s.vy = 5 + s.v * 0.18;
            dust.burst({ x: s.x, y: heightAt(s.x, s.d) + 0.6, z: -s.d }, 22, [mood.spray], { speed: [1, 5], up: 3, life: [0.4, 0.8], size: [0.4, 1], gravity: 5, alpha: 0.7 });
            sound.whoosh();
          }
        }
        // Gates.
        while (s.gate < course.gates.length && course.gates[s.gate]!.z <= s.d) {
          const gate = course.gates[s.gate]!;
          const ok = Math.abs(s.x - gate.x) <= course.run.gateWidth / 2 + 0.3;
          if (ok) {
            s.passed++;
            sound.ding();
            for (const flag of gateFlags[s.gate]!) {
              const cloth = flag.material as THREE.MeshStandardMaterial;
              cloth.emissive.set('#ffffff');
              cloth.emissiveIntensity = 1.6;
              sparks.burst(flag.position, 12, [gate.color === 'red' ? '#ff5a78' : '#5aa2ff', '#ffffff'], { speed: [1, 4], up: 2, life: [0.3, 0.7], size: [0.12, 0.3], gravity: 5, intensity: 2.6 });
            }
          } else {
            s.missed++;
            sound.wrong();
            haptic([20, 30, 20]);
            setFlash({ text: '+3 s', tone: 'bad', id: s.gate });
          }
          s.gate++;
        }
        // Trees and rocks (not in the air).
        while (s.obstacle < sorted.length && sorted[s.obstacle]!.z < s.d - 3) s.obstacle++;
        if (s.h < 1 && s.crash <= 0) {
          for (let i = s.obstacle; i < sorted.length && sorted[i]!.z < s.d + 2; i++) {
            const o = sorted[i]!;
            if (Math.hypot(o.x - s.x, o.z - s.d) < o.r + 0.45) {
              s.crash = 0.9;
              s.v *= 0.25;
              dust.burst({ x: s.x, y: heightAt(s.x, s.d) + 0.8, z: -s.d }, 70, [mood.spray], { speed: [1, 8], up: 3, life: [0.5, 1.2], size: [0.5, 1.6], gravity: 7, alpha: 0.8 });
              shake.kick(0.8);
              sound.buzzer(0.35);
              haptic([60, 40, 60]);
              setFlash({ text: 'Autsch!', tone: 'bad', id: 1000 + i });
              break;
            }
          }
        }
        sampleIn -= dt;
        if (sampleIn <= 0) {
          sampleIn = SAMPLE;
          samples.push([Math.round(s.time * 100) / 100, Math.round(s.d * 10) / 10, Math.round(s.x * 10) / 10]);
        }
        if (s.d >= course.run.length) {
          live.current.done = true;
          const seconds = Math.round(s.time * 10) / 10;
          const score = pisteScore(course.run, seconds, s.missed);
          if (!best || seconds + s.missed * 3 < best.time) saveGhost(option, player, { time: seconds + s.missed * 3, samples });
          setFinished(`${seconds.toFixed(1)} s`);
          confetti.burst(camera, scene);
          for (const side of [-1, 1]) {
            sparks.burst({ x: fx + side * course.run.halfWidth, y: fy + 7, z: -fz }, 60, ['#ffd23f', '#ff4f6d', '#2ec5ff', '#ffffff'], { speed: [3, 12], up: 5, life: [0.7, 1.6], size: [0.2, 0.5], gravity: 6, intensity: 3 });
          }
          sound.fanfare();
          window.setTimeout(
            () =>
              onFinish({
                score,
                stars: pisteStars(course.run, seconds, s.missed),
                summary: `${course.run.name}: ${seconds.toFixed(1)} s · ${s.passed} von ${course.gates.length} Toren${s.missed ? ` (+${s.missed * 3} s)` : ''}`,
              }),
            1600,
          );
        }
        hudIn -= dt;
        if (hudIn <= 0) {
          hudIn = 0.1;
          setHud({ time: s.time, speed: Math.round(s.v * 3.6), gates: s.passed, missed: s.missed });
        }
      }

      // Skier, ghost, camera, light, snow.
      const y = heightAt(s.x, s.d) + s.h;
      skier.position.set(s.x, y, -s.d);
      skier.rotation.set(s.crash > 0 ? s.crash * 7 : -SLOPE * 0.8, -s.heading, -s.heading * 0.55);
      if (ghost && best) {
        const t = s.time;
        const list = best.samples;
        let k = Math.min(list.length - 1, Math.floor(t / SAMPLE));
        while (k > 0 && list[k]![0] > t) k--;
        const [, gd, gx] = list[k] ?? list[list.length - 1]!;
        ghost.position.set(gx, heightAt(gx, gd), -gd);
        ghost.rotation.x = -SLOPE * 0.8;
        ghost.visible = go || s.time > 0;
      }
      // Snow dust: more of it the faster the skier goes and the harder the skis carve.
      const carve = Math.abs(Math.sin(s.heading));
      if (go && s.h === 0 && s.crash <= 0 && s.v > 4) {
        const amount = (0.35 + carve * 2.4) * (s.v / course.run.maxSpeed);
        for (let k = 0; k < 3; k++) {
          if (Math.random() > amount) continue;
          const side = s.heading > 0 ? -1 : 1;
          dust.emit(
            s.x + (Math.random() - 0.5) * 0.7,
            y + 0.15,
            -s.d + 0.4,
            side * carve * (2 + Math.random() * 4) + (Math.random() - 0.5) * 1.5,
            0.8 + Math.random() * 1.8 + carve * 1.5,
            1 + Math.random() * 2,
            0.45 + Math.random() * 0.4,
            0.35,
            mood.spray,
            { endSize: 1.1 + carve, gravity: 3, alpha: 0.55 },
          );
        }
      }
      dust.update(dt);
      sparks.update(dt);
      confetti.update(dt);
      sky.tick(s.time + clock);
      clock += dt * 0.2;
      // The faster, the wider the view.
      const rush = Math.min(1, s.v / course.run.maxSpeed);
      const fov = 60 + rush * rush * 12;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
      const wanted = new THREE.Vector3(s.x * 0.88 + course.center(s.d) * 0.12, y + 7.5, -s.d + 9.5);
      camPos.lerp(wanted, Math.min(1, dt * 4));
      camera.position.copy(camPos);
      // Look down the slope, a bit ahead of the skier – the piste fills the picture.
      const ahead = s.d + 14;
      lookAt.set(s.x * 0.7 + course.center(ahead) * 0.3, heightAt(course.center(ahead), ahead) + 1, -ahead);
      camera.lookAt(lookAt);
      shake.apply(camera, dt, 0.6);
      sun.position.set(s.x + mood.sun[0] * 60, y + mood.sun[1] * 60 + 8, -s.d + mood.sun[2] * 60);
      sun.target.position.set(s.x, y, -s.d - 6);
      lamp.position.set(s.x, y + 6, -s.d - 8);
      mountains.position.set(camPos.x * 0.6, camPos.y, camPos.z);
      const sp = snowGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < flakes; i++) {
        let fy2 = sp.getY(i) - dt * 3;
        if (fy2 < -5) fy2 = 28;
        sp.setY(i, fy2);
      }
      sp.needsUpdate = true;
      snow.position.set(camPos.x, camPos.y - 12, camPos.z - 18);
    };

    return { scene, camera, update, fx: { bloom: mood.bloom, vignette: mood.night ? 0.5 : 0.3, exposure: mood.exposure } };
  });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <GameShell label={`Pistenjagd · ${run.name}`} onExit={onQuit} accent="#3a86ff" night={option === 2} className="arena-shell">
      <div className="arena-hud">
        <span>
          <strong>{hud.time.toFixed(1)}</strong> s
        </span>
        <span>
          <strong>{hud.speed}</strong> km/h
        </span>
        <span>
          Tore <strong>{hud.gates}</strong>
          {hud.missed > 0 && <em> −{hud.missed}</em>}
        </span>
      </div>
      <div ref={areaRef} className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Piste – mit dem Finger nach links oder rechts ziehen" />
        {flash && (
          <p key={flash.id} className={`arena-flash is-${flash.tone}`} aria-live="assertive">
            {flash.text}
          </p>
        )}
        {finished && <p className="arena-finish">Ziel! {finished}</p>}
        {!tilt && <p className={`arena-hint ${option === 2 ? '' : 'is-dark'}`}>Finger nach links oder rechts ziehen</p>}
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
