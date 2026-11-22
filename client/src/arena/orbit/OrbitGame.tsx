import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { useArenaScene } from '../engine.ts';
import { Confetti, glow, GLSL_NOISE, hdr, Nebula, Particles, Shake, Trail } from '../fx.ts';
import { FLIGHT_SECONDS, H, MAX_SPEED, orbitLevel, orbitScore, orbitStars, simulate, step, STEP_SECONDS, W, type Probe } from '../orbit.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Orbit: pull back from anywhere and let go – the probe flies off and the planets pull it into curves.
 * The dotted line shows only the beginning of the path; the rest has to be judged. Reach the green portal.
 */

/** Where the light of the (unseen) sun comes from: the upper left, a little above the plane. */
const SUN = new THREE.Vector3(-0.78, 0.46, -0.42).normalize();

const NEBULAE = [
  { deep: '#03020b', a: '#5b2bd6', b: '#d6337f', c: '#2ec5ff' },
  { deep: '#02060d', a: '#0f6fd6', b: '#19c7a8', c: '#ffd27a' },
  { deep: '#0a0306', a: '#c2410c', b: '#7c2bd6', c: '#ffb13d' },
  { deep: '#02040c', a: '#2743d6', b: '#b02bd6', c: '#7df0ff' },
];

/** A planet: bands of gas or blotchy rock, lit from the side with a soft edge between day and night. */
function planetMaterial(color: string, seed: number, gas: boolean): THREE.ShaderMaterial {
  const base = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: SUN },
      uA: { value: base.clone().offsetHSL(-0.03, 0.05, -0.16) },
      uB: { value: base.clone().offsetHSL(0.02, 0, 0.12) },
      uC: { value: base.clone().offsetHSL(0.08, -0.1, 0.3) },
      uAtmo: { value: base.clone().offsetHSL(0, 0.1, 0.2) },
      uSeed: { value: seed },
      uBands: { value: gas ? 5 + (seed % 3) : 1.2 },
      uTurb: { value: gas ? 0.9 : 3.2 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      void main() {
        vP = normalize(position);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uA;
      uniform vec3 uB;
      uniform vec3 uC;
      uniform vec3 uAtmo;
      uniform float uSeed;
      uniform float uBands;
      uniform float uTurb;
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      ${GLSL_NOISE}
      void main() {
        vec3 n = normalize(vN);
        float swirl = (fbm(vP.xz * 2.6 + uSeed) - 0.5) * uTurb;
        float bands = fbm(vec2(vP.y * uBands + swirl, uSeed * 3.0 + vP.x * 0.7));
        vec3 base = mix(uA, uB, smoothstep(0.28, 0.72, bands));
        base = mix(base, uC, smoothstep(0.55, 0.85, fbm(vP.xy * 4.0 + uSeed * 2.0 + swirl)) * 0.6);
        float day = smoothstep(-0.12, 0.38, dot(n, uSun));
        vec3 col = base * (day * 1.15 + 0.025);
        float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 2.6);
        col += uAtmo * rim * (0.12 + day) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** The air around a planet: a larger shell that only glows at its edge, brightest on the day side. */
function atmosphereMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: SUN }, uColor: { value: new THREE.Color(color).offsetHSL(0, 0.15, 0.12) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        float edge = pow(max(-dot(n, normalize(vV)), 0.0), 3.2);
        float day = smoothstep(-0.55, 0.6, dot(n, uSun));
        gl_FragColor = vec4(uColor * edge * (0.2 + day) * 2.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** The inside of the portal: a swirl that turns. */
function portalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#7dff5a') }, uBoost: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uBoost;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float swirl = sin(a * 3.0 + r * 9.0 - uTime * 4.0) * 0.5 + 0.5;
        float inside = smoothstep(1.0, 0.25, r);
        vec3 col = mix(uColor, vec3(1.0), swirl * 0.35) * (0.35 + swirl * 1.5) * inside * uBoost;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** A rock with dents: every corner of an icosahedron pushed in or out a little. */
function rockGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    // The same corner always gets the same push, so the faces stay joined.
    const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    v.multiplyScalar(0.82 + (n - Math.floor(n)) * 0.3);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export default function OrbitGame({ skin: skinId, option, onFinish, onQuit }: ArenaPlayProps) {
  const level = orbitLevel(option);
  const skins = ARENA_GAMES.find((g) => g.id === 'orbit')!.skins;
  const skin = skins.find((s) => s.id === skinId) ?? skins[0]!;
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
    scene.background = new THREE.Color('#03020b');
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0x8f9cff, 0x120a26, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1d6, 3);
    sun.position.copy(SUN).multiplyScalar(40);
    scene.add(sun);

    // Deep space far below the plane – it shifts a little against the planets when the picture moves.
    const nebula = new Nebula(420, { ...NEBULAE[option % NEBULAE.length]!, seed: option + 1, scale: 1.25, stars: 1 });
    nebula.position.y = -60;
    scene.add(nebula);
    // The sun itself stays outside the picture; its glare comes in from the corner.
    const glare = glow('#ffe2b0', 40, 0.16);
    glare.position.set(-W - 9, 2, -H - 9);
    scene.add(glare);

    // Planets with their air and the rings that show their pull, asteroids.
    const spinning: THREE.Object3D[] = [];
    const pulls: { ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; r: number; phase: number }[] = [];
    level.bodies.forEach((b, i) => {
      if (b.mass === 0) {
        const rock = new THREE.Mesh(rockGeometry(b.r, i * 7.3), new THREE.MeshStandardMaterial({ color: '#9a8fa8', flatShading: true, roughness: 0.95 }));
        rock.position.set(b.x, 0, b.z);
        rock.rotation.set(i, i * 2, 0);
        rock.userData.spin = 0.25 + (i % 3) * 0.2;
        scene.add(rock);
        spinning.push(rock);
        return;
      }
      // The axis leans towards the camera, so the bands are seen from the side.
      const tilt = new THREE.Group();
      tilt.position.set(b.x, 0, b.z);
      tilt.rotation.set(1.15 + (i % 3) * 0.12, 0, (i % 2 ? 1 : -1) * 0.25);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 32), planetMaterial(b.color, i * 3.1 + option, b.r > 1.9));
      planet.userData.spin = 0.12 + (i % 3) * 0.05;
      tilt.add(planet);
      const air = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.22, 32, 24), atmosphereMaterial(b.color));
      air.position.set(b.x, 0, b.z);
      scene.add(tilt, air);
      spinning.push(planet);
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.985, 1, 72),
          new THREE.MeshBasicMaterial({ color: hdr(b.color, 1.2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(b.x, -0.4, b.z);
        scene.add(ring);
        pulls.push({ ring, r: b.r, phase: k / 3 + i * 0.17 });
      }
    });

    // The portal and the launch pad.
    const [tx, tz] = level.target;
    const gate = new THREE.Mesh(new THREE.TorusGeometry(level.targetR, 0.09, 12, 64), new THREE.MeshBasicMaterial({ color: hdr('#9bff6a', 2.4) }));
    gate.position.set(tx, 0, tz);
    gate.rotation.x = Math.PI / 2;
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(level.targetR * 0.97, 48), portalMaterial());
    swirl.position.set(tx, -0.05, tz);
    swirl.rotation.x = -Math.PI / 2;
    const beacon = glow('#8dff6a', level.targetR * 4.5, 0.55);
    beacon.position.set(tx, -0.3, tz);
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.7, 40),
      new THREE.MeshBasicMaterial({ color: hdr(skin.accent, 1.8), side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(level.start[0], -0.05, level.start[1]);
    scene.add(gate, swirl, beacon, pad);

    // The probe: nose, body and fins; its trail, the preview and the path of the last attempt.
    const probe = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: '#f4f3fa', metalness: 0.5, roughness: 0.35 });
    const paint = new THREE.MeshStandardMaterial({ color: skin.color, emissive: skin.color, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.4 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 16).rotateX(Math.PI / 2), paint);
    nose.position.z = 0.42;
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.6, 16).rotateX(Math.PI / 2), body);
    hull.position.z = -0.18;
    probe.add(nose, hull);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.34), paint);
      const a = (k / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 0.3, Math.cos(a) * 0.3, -0.4);
      fin.rotation.z = -a;
      probe.add(fin);
    }
    const flame = glow(skin.accent, 1.6, 2.2);
    scene.add(probe, flame);
    const ribbon = new Trail(46, 0.5, skin.accent, { intensity: 1.6 });
    scene.add(ribbon);
    const trailMax = 1200;
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3));
    trailGeo.setDrawRange(0, 0);
    scene.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: hdr(skin.accent, 1.3), transparent: true, opacity: 0.7 })));
    const previewGeo = new THREE.BufferGeometry();
    previewGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    previewGeo.setDrawRange(0, 0);
    scene.add(new THREE.Points(previewGeo, new THREE.PointsMaterial({ color: hdr('#ffffff', 1.8), size: 0.22, transparent: true, opacity: 0.95 })));
    const lastGeo = new THREE.BufferGeometry();
    lastGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailMax * 3), 3));
    lastGeo.setDrawRange(0, 0);
    scene.add(new THREE.Line(lastGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2 })));
    // The band of the slingshot while aiming.
    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const band = new THREE.Line(bandGeo, new THREE.LineBasicMaterial({ color: hdr(skin.accent, 2), transparent: true, opacity: 0.9 }));
    band.visible = false;
    scene.add(band);

    // Sparks, dust and the shock wave of a crash.
    const sparks = new Particles(420);
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({ color: hdr('#ffc27a', 2.5), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    wave.rotation.x = -Math.PI / 2;
    const blast = glow('#ffb13d', 1, 3);
    blast.visible = false;
    const confetti = new Confetti();
    const shake = new Shake();
    scene.add(sparks, wave, blast, confetti);
    // Dust between the camera and the planets gives the room depth; it turns slowly.
    const motes = new Float32Array(70 * 3);
    for (let i = 0; i < 70; i++) motes.set([(Math.random() - 0.5) * W * 3.4, 3 + Math.random() * 14, (Math.random() - 0.5) * H * 2.8], i * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(dust);

    const p: Probe = { x: level.start[0], z: level.start[1], vx: 0, vz: 0 };
    const f = { flying: false, time: 0, acc: 0, points: 0, reset: 0, burst: 0, wave: 0, arrive: 0, clock: 0, heading: Math.PI };
    const reset = () => {
      Object.assign(p, { x: level.start[0], z: level.start[1], vx: 0, vz: 0 });
      f.flying = false;
      f.time = 0;
      f.acc = 0;
      ribbon.reset();
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
      ribbon.reset();
      sparks.burst({ x: p.x, y: 0, z: p.z }, 26, [skin.accent, '#ffffff'], { speed: [1, 4], life: [0.3, 0.7], size: [0.15, 0.35], drag: 2.5, intensity: 2.5 });
      shake.kick(0.25);
      sound.whoosh();
      haptic(15);
    };

    const end = (outcome: 'target' | 'crash' | 'lost') => {
      f.flying = false;
      const l = live.current;
      if (outcome === 'target') {
        l.done = true;
        setFinished(true);
        f.arrive = 1;
        sparks.burst({ x: tx, y: 0.2, z: tz }, 90, ['#9bff6a', '#ffffff', '#7df0ff'], { speed: [2, 9], life: [0.6, 1.4], size: [0.15, 0.45], drag: 1.8, intensity: 3 });
        confetti.burst(camera, scene);
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
          1700,
        );
        return;
      }
      if (outcome === 'crash') {
        sound.buzzer(0.4);
        haptic([60, 40, 60]);
        f.burst = 1;
        f.wave = 1;
        blast.position.set(p.x, 0.4, p.z);
        wave.position.set(p.x, 0.3, p.z);
        sparks.burst({ x: p.x, y: 0.3, z: p.z }, 110, ['#ffd23f', '#ff8a3d', '#ff4f6d', '#ffffff'], { speed: [1, 9], life: [0.45, 1.3], size: [0.2, 0.6], drag: 2.2, intensity: 3.2 });
        shake.kick(0.85);
      } else sound.wrong();
      setFlash({ text: outcome === 'crash' ? 'Bumm!' : 'Verloren im All', tone: 'bad', id: Date.now() });
      l.attempts++;
      setAttempts(l.attempts);
      f.reset = 0.95;
    };

    const update = (dt: number) => {
      f.clock += dt;
      // Fit the whole field into the picture.
      const fov = (camera.fov * Math.PI) / 180;
      const dist = Math.max((H * 2 + 3) / (2 * Math.tan(fov / 2)), (W * 2 + 3) / (2 * Math.tan(fov / 2) * camera.aspect));
      camera.position.set(0, dist * 0.97, dist * 0.24);
      camera.lookAt(0, 0, 0.6);
      shake.apply(camera, dt, 0.9);

      nebula.tick(f.clock);
      dust.rotation.y = f.clock * 0.01;
      for (const body of spinning) body.rotation.y += dt * (body.userData.spin as number);
      // The pull of a planet: rings that close in on it again and again.
      for (const pull of pulls) {
        const s = (f.clock * 0.22 + pull.phase) % 1;
        pull.ring.scale.setScalar(pull.r * (3.1 - 1.95 * s));
        pull.ring.material.opacity = Math.sin(Math.PI * s) * 0.2;
      }
      gate.rotation.z += dt * 0.8;
      const boost = 1 + f.arrive * 3;
      (swirl.material as THREE.ShaderMaterial).uniforms.uTime!.value = f.clock;
      (swirl.material as THREE.ShaderMaterial).uniforms.uBoost!.value = boost;
      beacon.scale.setScalar(level.targetR * (4.5 + Math.sin(f.clock * 2.4) * 0.5) * (1 + f.arrive));
      if (f.arrive > 0) f.arrive = Math.max(0, f.arrive - dt * 0.9);
      // Now and then the portal draws in a spark.
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = level.targetR * (1.5 + Math.random());
        sparks.emit(tx + Math.cos(a) * r, 0, tz + Math.sin(a) * r, -Math.cos(a) * r * 1.2 - Math.sin(a) * 1.5, 0, -Math.sin(a) * r * 1.2 + Math.cos(a) * 1.5, 0.8, 0.14, '#9bff6a', { intensity: 2.2 });
      }

      if (f.burst > 0) {
        f.burst = Math.max(0, f.burst - dt * 1.6);
        blast.visible = true;
        blast.material.opacity = f.burst;
        blast.scale.setScalar(2 + (1 - f.burst) * 9);
      } else blast.visible = false;
      if (f.wave > 0) {
        f.wave = Math.max(0, f.wave - dt * 1.4);
        wave.scale.setScalar(0.5 + (1 - f.wave) * 7);
        wave.material.opacity = f.wave * 0.9;
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
          if (f.points < trailMax) (trailGeo.attributes.position as THREE.BufferAttribute).setXYZ(f.points++, p.x, 0, p.z);
          if (outcome) end(outcome);
          else if (f.time > FLIGHT_SECONDS) end('lost');
        }
        trailGeo.attributes.position!.needsUpdate = true;
        trailGeo.setDrawRange(0, f.points);
      }
      // Aiming: the band of the slingshot and the beginning of the path as dots.
      const a = aim.current;
      const aiming = !f.flying && f.reset <= 0 && !live.current.done && !!a.from && Math.hypot(a.dx, a.dy) > 14;
      band.visible = aiming;
      if (aiming) {
        const [vx, vz] = velocityOf(a.dx, a.dy);
        const { path } = simulate(level, vx, vz, level.preview, 4);
        const attr = previewGeo.attributes.position as THREE.BufferAttribute;
        path.slice(0, 400).forEach(([x, z], i) => attr.setXYZ(i, x, 0.05, z));
        attr.needsUpdate = true;
        previewGeo.setDrawRange(0, Math.min(400, path.length));
        const power = Math.hypot(vx, vz) / MAX_SPEED;
        const pos = bandGeo.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, p.x, 0.05, p.z);
        pos.setXYZ(1, p.x - (vx / MAX_SPEED) * 3.2, 0.05, p.z - (vz / MAX_SPEED) * 3.2);
        pos.needsUpdate = true;
        pad.scale.setScalar(1 + power * 0.9);
        f.heading = Math.atan2(vx, vz);
      } else {
        previewGeo.setDrawRange(0, 0);
        pad.scale.setScalar(1 + Math.sin(f.clock * 3) * 0.06);
      }

      const speed = Math.hypot(p.vx, p.vz);
      if (speed > 0.01) f.heading = Math.atan2(p.vx, p.vz);
      probe.position.set(p.x, 0.1, p.z);
      probe.rotation.y = f.heading;
      probe.rotation.z += dt * (f.flying ? 5 : 0);
      const gone = f.burst > 0.5 || (f.reset > 0 && f.burst > 0) || (live.current.done && f.arrive < 0.75);
      probe.visible = !gone;
      const tailX = p.x - Math.sin(f.heading) * 0.6;
      const tailZ = p.z - Math.cos(f.heading) * 0.6;
      flame.position.set(tailX, 0.1, tailZ);
      flame.visible = f.flying;
      flame.scale.setScalar(1.3 + Math.random() * 0.6);
      if (f.flying) {
        ribbon.follow(p.x, 0.05, p.z, dt, camera);
        for (let k = 0; k < 2; k++) {
          sparks.emit(tailX, 0.1, tailZ, -p.vx * 0.25 + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.6, -p.vz * 0.25 + (Math.random() - 0.5) * 1.6, 0.35 + Math.random() * 0.3, 0.3, k ? '#ffffff' : skin.accent, {
            intensity: 2.4,
            drag: 1.5,
          });
        }
      }
      sparks.update(dt);
      confetti.update(dt);
    };
    return { scene, camera, update, fx: { bloom: { strength: 0.9, radius: 0.75, threshold: 0.9 }, vignette: 0.5 } };
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
