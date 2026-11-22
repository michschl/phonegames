import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { glowTexture, skyTexture, useArenaScene } from '../engine.ts';
import { FLIGHT_SECONDS, H, MAX_SPEED, orbitLevel, orbitScore, orbitStars, simulate, step, STEP_SECONDS, W, type Probe } from '../orbit.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Orbit: pull back from anywhere and let go – the probe flies off and the planets pull it into curves.
 * The dotted line shows only the beginning of the path; the rest has to be judged. Reach the green ring.
 */

/** A planet surface: soft bands of its colour. */
function planetTexture(color: string, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  for (let y = 0; y < 64; y += 4) {
    const shade = base.clone().offsetHSL(0, 0, Math.sin(y * 0.4 + seed) * 0.08 + Math.sin(y * 0.13 + seed * 2) * 0.05);
    ctx.fillStyle = `#${shade.getHexString()}`;
    ctx.fillRect(0, y, 64, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function OrbitGame({ skin: skinId, option, onFinish, onQuit }: ArenaPlayProps) {
  const level = orbitLevel(option);
  const skin = ARENA_GAMES.find((g) => g.id === 'orbit')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES.find((g) => g.id === 'orbit')!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [attempts, setAttempts] = useState(1);
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad'; id: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const aim = useRef<{ from: { x: number; y: number } | null; dx: number; dy: number }>({ from: null, dx: 0, dy: 0 });
  const launch = useRef<((vx: number, vz: number) => void) | null>(null);
  const live = useRef({ attempts: 1, done: false });

  const velocityOf = (dx: number, dy: number): [number, number] => {
    const length = Math.hypot(dx, dy);
    const speed = Math.min(1, length / 150) * MAX_SPEED;
    return length < 1 ? [0, 0] : [(-dx / length) * speed, (-dy / length) * speed];
  };

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
      if (!from || Math.hypot(dx, dy) < 14) return;
      launch.current?.(...velocityOf(dx, dy));
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
    scene.background = skyTexture('#05030f', '#1b1140');
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0xb9b2ff, 0x120a26, 0.7));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(-20, 30, 10);
    scene.add(sun);

    // Stars and nebulae far below the plane.
    const starGeo = new THREE.BufferGeometry();
    const stars = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      stars[i * 3] = (Math.random() - 0.5) * 140;
      stars[i * 3 + 1] = -10 - Math.random() * 60;
      stars[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0.85 })));
    for (const [x, z, color, size] of [
      [-8, -10, '#ff4fa3', 40],
      [10, 8, '#2ec5ff', 46],
      [0, 20, '#8b5cf6', 36],
    ] as const) {
      const nebula = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      nebula.position.set(x, -30, z);
      nebula.scale.set(size, size, 1);
      scene.add(nebula);
    }

    // Planets with their glow and pull rings, asteroids.
    const spinning: THREE.Mesh[] = [];
    level.bodies.forEach((b, i) => {
      if (b.mass === 0) {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 0), new THREE.MeshStandardMaterial({ color: b.color, flatShading: true, roughness: 1 }));
        rock.position.set(b.x, 0, b.z);
        rock.rotation.set(i, i * 2, 0);
        scene.add(rock);
        spinning.push(rock);
        return;
      }
      const planet = new THREE.Mesh(new THREE.SphereGeometry(b.r, 32, 24), new THREE.MeshStandardMaterial({ map: planetTexture(b.color, i * 3.1), roughness: 0.8 }));
      planet.position.set(b.x, 0, b.z);
      // Tilt the axis towards the camera, so the bands are seen from the side and not as rings around the pole.
      planet.rotation.x = 1.2 + (i % 3) * 0.12;
      scene.add(planet);
      spinning.push(planet);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(b.color), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(b.x, -0.5, b.z);
      halo.scale.set(b.r * 3.6, b.r * 3.6, 1);
      scene.add(halo);
      for (const k of [1.9, 2.8]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * k, b.r * k + 0.05, 64), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(b.x, -0.4, b.z);
        scene.add(ring);
      }
    });

    // The target ring and the launch pad.
    const target = new THREE.Mesh(new THREE.TorusGeometry(level.targetR, 0.12, 12, 48), new THREE.MeshStandardMaterial({ color: '#9be15d', emissive: '#5cd12b', emissiveIntensity: 1.5 }));
    target.position.set(level.target[0], 0, level.target[1]);
    target.rotation.x = Math.PI / 2;
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#b6ff7a'), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.position.copy(target.position);
    beacon.scale.set(level.targetR * 3, level.targetR * 3, 1);
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: skin.accent, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(level.start[0], -0.05, level.start[1]);
    scene.add(target, beacon, pad);

    // The probe, its trail, the preview and the last path.
    const probe = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: skin.color, emissive: skin.color, emissiveIntensity: 0.5, metalness: 0.4 }));
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(skin.accent), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.scale.set(1.2, 1.2, 1);
    scene.add(probe, flame);
    const trailMax = 1200;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: skin.accent, transparent: true, opacity: 0.8 }));
    scene.add(trail);
    const previewGeo = new THREE.BufferGeometry();
    previewGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    previewGeo.setDrawRange(0, 0);
    const preview = new THREE.Points(previewGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.9 }));
    scene.add(preview);
    const lastGeo = new THREE.BufferGeometry();
    lastGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3));
    lastGeo.setDrawRange(0, 0);
    const last = new THREE.Line(lastGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18 }));
    scene.add(last);
    // A burst when it crashes.
    const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffb13d'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(burst);

    const p: Probe = { x: level.start[0], z: level.start[1], vx: 0, vz: 0 };
    const f = { flying: false, time: 0, acc: 0, points: 0, reset: 0, burst: 0 };
    const reset = () => {
      Object.assign(p, { x: level.start[0], z: level.start[1], vx: 0, vz: 0 });
      f.flying = false;
      f.time = 0;
      f.acc = 0;
    };

    launch.current = (vx, vz) => {
      if (f.flying || f.reset > 0 || live.current.done) return;
      sound.unlock();
      // Keep the last path to compare.
      (lastGeo.attributes.position as THREE.BufferAttribute).array.set((trailGeo.attributes.position as THREE.BufferAttribute).array);
      lastGeo.attributes.position!.needsUpdate = true;
      lastGeo.setDrawRange(0, f.points);
      Object.assign(p, { x: level.start[0], z: level.start[1], vx, vz });
      f.flying = true;
      f.time = 0;
      f.points = 0;
      sound.whoosh();
      haptic(15);
    };

    const end = (outcome: 'target' | 'crash' | 'lost') => {
      f.flying = false;
      const l = live.current;
      if (outcome === 'target') {
        l.done = true;
        setFinished(true);
        sound.fanfare();
        haptic([20, 40, 20]);
        const time = Math.round(f.time * 10) / 10;
        window.setTimeout(
          () =>
            onFinish({
              score: orbitScore(l.attempts, time),
              stars: orbitStars(l.attempts),
              summary: `Level ${option + 1} im ${l.attempts}. Versuch, ${time.toFixed(1)} s Flug`,
              key: `orbit:L${option + 1}`,
              records: { 'orbit:level': option + 1 },
            }),
          1400,
        );
        return;
      }
      if (outcome === 'crash') {
        sound.buzzer(0.4);
        haptic([60, 40, 60]);
        f.burst = 1;
        burst.position.set(p.x, 0.2, p.z);
      } else sound.wrong();
      setFlash({ text: outcome === 'crash' ? 'Bumm!' : 'Verloren im All', tone: 'bad', id: Date.now() });
      l.attempts++;
      setAttempts(l.attempts);
      f.reset = 0.9;
    };

    const update = (dt: number) => {
      // Fit the whole field into the picture.
      const fov = (camera.fov * Math.PI) / 180;
      const dist = Math.max((H * 2 + 3) / (2 * Math.tan(fov / 2)), (W * 2 + 3) / (2 * Math.tan(fov / 2) * camera.aspect));
      camera.position.set(0, dist * 0.97, dist * 0.24);
      camera.lookAt(0, 0, 0.6);

      for (const body of spinning) body.rotation.y += dt * 0.3;
      target.rotation.z += dt * 0.8;
      if (f.burst > 0) {
        f.burst = Math.max(0, f.burst - dt * 1.5);
        (burst.material as THREE.SpriteMaterial).opacity = f.burst;
        burst.scale.setScalar(1 + (1 - f.burst) * 4);
      }
      if (f.reset > 0) {
        f.reset -= dt;
        if (f.reset <= 0) reset();
      }
      if (f.flying) {
        f.acc += dt;
        while (f.acc >= STEP_SECONDS && f.flying) {
          f.acc -= STEP_SECONDS;
          f.time += STEP_SECONDS;
          const outcome = step(level, p);
          if (f.points < trailMax) {
            (trailGeo.attributes.position as THREE.BufferAttribute).setXYZ(f.points++, p.x, 0, p.z);
          }
          if (outcome) end(outcome);
          else if (f.time > FLIGHT_SECONDS) end('lost');
        }
        trailGeo.attributes.position!.needsUpdate = true;
        trailGeo.setDrawRange(0, f.points);
      }
      // Aiming: the beginning of the path as dots.
      const a = aim.current;
      if (!f.flying && f.reset <= 0 && a.from && Math.hypot(a.dx, a.dy) > 14) {
        const [vx, vz] = velocityOf(a.dx, a.dy);
        const { path } = simulate(level, vx, vz, level.preview, 4);
        const attr = previewGeo.attributes.position as THREE.BufferAttribute;
        path.slice(0, 400).forEach(([x, z], i) => attr.setXYZ(i, x, 0.05, z));
        attr.needsUpdate = true;
        previewGeo.setDrawRange(0, Math.min(400, path.length));
      } else previewGeo.setDrawRange(0, 0);
      probe.position.set(p.x, 0.1, p.z);
      const speed = Math.hypot(p.vx, p.vz);
      if (speed > 0.01) probe.rotation.y = Math.atan2(p.vx, p.vz);
      flame.position.set(p.x - (p.vx / (speed || 1)) * 0.5, 0.1, p.z - (p.vz / (speed || 1)) * 0.5);
      flame.visible = f.flying;
      probe.visible = f.burst < 0.6 || f.reset <= 0;
    };
    return { scene, camera, update };
  });

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1100);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <GameShell label={`Orbit · Level ${option + 1}`} onExit={onQuit} accent={skin.color} night className="arena-shell">
      <div className="arena-hud">
        <span>
          Versuch <strong>{attempts}</strong>
        </span>
      </div>
      <div ref={areaRef} className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Orbit – zurückziehen und loslassen, um die Sonde zu starten" />
        {flash && (
          <p key={flash.id} className={`arena-flash is-${flash.tone}`} aria-live="assertive">
            {flash.text}
          </p>
        )}
        {finished && <p className="arena-finish">Angekommen! 🛰️</p>}
        <p className="arena-hint">Zurückziehen und loslassen – die Punkte zeigen den Anfang der Bahn</p>
      </div>
    </GameShell>
  );
}
