import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { useSettings } from '../../store/settings.ts';
import { beatStars, judge, makeSong, midiToHz, multiplier, points, sectionAt, WINDOW, type Judgement, type Song } from '../beat.ts';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useArenaScene } from '../engine.ts';
import { Confetti, glow, GLSL_NOISE, hdr, Particles, Shake, softDot } from '../fx.ts';
import { ARENA_GAMES } from '../registry.ts';
import type { ArenaPlayProps } from '../types.ts';
import '../arena.css';

/*
 * Beat-Bahn: the app plays a song it makes itself; notes fly down a neon track and are tapped on the
 * line. Picture and judging follow the clock of the audio, so they stay in time with the music.
 */

const SPEED = 14; // units per second
const AHEAD = 3.4; // seconds a note is visible before the line
const LANE = 1.1;

/** A small synthesizer on the Web Audio clock. */
class Synth {
  private ctx: AudioContext;
  private master: GainNode;
  private noise: AudioBuffer;

  constructor(ctx: AudioContext, muted: boolean) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  mute(muted: boolean): void {
    this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  kick(t: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    osc.connect(this.env(t, 0.9, 0.003, 0.32));
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, decay: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    src.connect(filter);
    filter.connect(this.env(t, peak, 0.002, decay));
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1900, 0.45, 0.16);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 190;
    osc.connect(this.env(t, 0.25, 0.002, 0.08));
    osc.start(t);
    osc.stop(t + 0.12);
  }

  hat(t: number, open = false): void {
    this.noiseHit(t, 'highpass', 7500, open ? 0.14 : 0.1, open ? 0.14 : 0.04);
  }

  tone(t: number, midi: number, duration: number, type: OscillatorType, peak: number, cutoff = 4000): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.connect(filter);
    filter.connect(this.env(t, peak, 0.01, duration));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  stop(): void {
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.disconnect();
  }
}

/** Drums, bass and chords of one bar. */
function scheduleBar(synth: Synth, song: Song, styleIndex: number, bar: number, start: number, section: string): void {
  const beat = song.beat;
  const root = song.style.progression[bar % song.style.progression.length]!;
  const quiet = section === 'break';
  const intro = section === 'intro' && bar < 2;
  for (let i = 0; i < 4; i++) {
    const t = start + i * beat;
    if (!quiet) {
      if (styleIndex === 1 || i === 0 || i === 2) synth.kick(t);
      if (!intro && (i === 1 || i === 3)) synth.snare(t);
    } else if (i === 0) synth.kick(t);
    synth.hat(t + beat / 2, styleIndex === 1);
    if (styleIndex === 2) synth.hat(t);
    // Bass: on the beat (Pop, Chip), on the offbeat (House).
    if (!intro) synth.tone(styleIndex === 1 ? t + beat / 2 : t, root - 12, beat * 0.45, styleIndex === 2 ? 'square' : 'sawtooth', 0.22, 700);
  }
  // Chords: a pad (Pop, House) or a quick arpeggio (Chip).
  const third = styleIndex === 0 || bar % 4 === 2 ? 4 : 3;
  if (styleIndex === 2) {
    for (let i = 0; i < 8; i++) synth.tone(start + (i * beat) / 2, root + [0, third, 7, 12][i % 4]!, beat * 0.3, 'square', 0.05, 2500);
  } else {
    for (const step of [0, third, 7]) synth.tone(start, root + step, beat * 3.6, 'sawtooth', quiet ? 0.06 : 0.04, 1400);
  }
}

const LANE_COLORS = ['#ff4fa3', '#ffd23f', '#2ec5ff', '#9be15d'];

export default function BeatGame({ skin: skinId, option, onFinish, onQuit }: ArenaPlayProps) {
  const skin = ARENA_GAMES.find((g) => g.id === 'beat')!.skins.find((s) => s.id === skinId) ?? ARENA_GAMES[2]!.skins[0]!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [song] = useState(() => makeSong(option, Math.floor(Math.random() * 1e9)));
  const [hud, setHud] = useState({ score: 0, combo: 0 });
  const [call, setCall] = useState<{ text: Judgement | 'Daneben'; id: number } | null>(null);
  const [finished, setFinished] = useState(false);
  const soundOn = useSettings((s) => s.sound);
  const live = useRef({
    ctx: null as AudioContext | null,
    synth: null as Synth | null,
    start: 0,
    latency: 0,
    next: 0, // next note to judge
    bar: 0, // next bar to schedule
    lead: 0, // next melody note to schedule
    score: 0,
    combo: 0,
    best: 0,
    perfect: 0,
    good: 0,
    missed: 0,
    judged: new Set<number>(),
    flashes: [0, 0, 0, 0],
    /** Hits the picture has not shown yet. */
    hits: [] as { lane: number; perfect: boolean }[],
    done: false,
  });
  const countdown = useStartCountdown(() => {
    const ctx = sound.unlock();
    if (!ctx) return;
    const l = live.current;
    l.ctx = ctx;
    l.synth = new Synth(ctx, !useSettings.getState().sound);
    l.latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    l.start = ctx.currentTime + 0.15;
  });

  useEffect(() => {
    countdown.begin();
    return () => live.current.synth?.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => live.current.synth?.mute(!soundOn), [soundOn]);

  // Schedule the music a little ahead.
  useEffect(() => {
    const barLength = song.beat * 4;
    const lead = 1.5 + song.beat * 4;
    const timer = window.setInterval(() => {
      const l = live.current;
      if (!l.ctx || !l.synth || l.done) return;
      const now = l.ctx.currentTime;
      // Count-in clicks.
      while (l.bar < song.bars && l.start + lead + l.bar * barLength < now + 0.4) {
        const t = l.start + lead + l.bar * barLength;
        scheduleBar(l.synth, song, option, l.bar, t, sectionAt(song, lead + l.bar * barLength + 0.01));
        l.bar++;
      }
      while (l.lead < song.notes.length && l.start + song.notes[l.lead]!.time < now + 0.4) {
        const note = song.notes[l.lead]!;
        l.synth.tone(l.start + note.time, note.pitch, song.beat * 0.4, song.style.lead, 0.14, 3500);
        l.lead++;
      }
    }, 30);
    return () => window.clearInterval(timer);
  }, [song, option]);

  const songTime = () => {
    const l = live.current;
    return l.ctx ? l.ctx.currentTime - l.start - l.latency : -10;
  };

  const tap = (lane: number) => {
    const l = live.current;
    if (!l.ctx || l.done) return;
    l.flashes[lane] = 1;
    const t = songTime();
    let target = -1;
    for (let i = l.next; i < song.notes.length && song.notes[i]!.time < t + WINDOW; i++) {
      const note = song.notes[i]!;
      if (note.lane === lane && !l.judged.has(i) && Math.abs(note.time - t) <= WINDOW) {
        target = i;
        break;
      }
    }
    if (target < 0) return;
    const result = judge(song.notes[target]!.time - t);
    l.judged.add(target);
    l.combo++;
    l.best = Math.max(l.best, l.combo);
    l.score += points(result, l.combo);
    if (result === 'perfekt') l.perfect++;
    else l.good++;
    haptic(result === 'perfekt' ? 12 : 6);
    l.hits.push({ lane, perfect: result === 'perfekt' });
    setCall({ text: result, id: target });
    setHud({ score: l.score, combo: l.combo });
  };

  useEffect(() => {
    const keys: Record<string, number> = { d: 0, f: 1, j: 2, k: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
    const down = (event: KeyboardEvent) => {
      if (event.repeat || keys[event.key] === undefined) return;
      tap(keys[event.key]!);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });

  useArenaScene(canvasRef, () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07051a');
    scene.fog = new THREE.Fog(0x1a0a36, 24, 80);
    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 300);
    camera.position.set(0, 4.4, 7.4);
    camera.lookAt(0, 0, -9);
    scene.add(new THREE.HemisphereLight(0x8f7cff, 0x1a0b33, 0.8));
    const main = new THREE.Color(skin.color);
    const second = new THREE.Color(skin.accent);

    // The backdrop: a night sky fading into the glow of a striped sun on the horizon.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 150),
      new THREE.ShaderMaterial({
        depthWrite: false,
        fog: false,
        uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uA: { value: new THREE.Color('#ffd23f') }, uB: { value: main }, uGlow: { value: second } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uPulse;
          uniform vec3 uA;
          uniform vec3 uB;
          uniform vec3 uGlow;
          varying vec2 vUv;
          ${GLSL_NOISE}
          void main() {
            vec2 p = (vUv - vec2(0.5, 0.43)) * vec2(2.0, 1.0);
            float r = length(p);
            vec3 col = mix(vec3(0.02, 0.01, 0.07), vec3(0.16, 0.03, 0.26), smoothstep(0.75, 0.3, vUv.y));
            col += uB * 0.22 * smoothstep(0.52, 0.3, vUv.y);
            // Stars above.
            vec2 cell = vUv * vec2(180.0, 90.0);
            float n = hash12(floor(cell));
            float star = step(0.992, n) * smoothstep(0.42, 0.0, length(fract(cell) - 0.5)) * smoothstep(0.42, 0.6, vUv.y);
            col += star * (0.8 + 0.6 * sin(uTime * 2.0 + n * 60.0)) * 2.0;
            // The sun: yellow above, the colour of the track below, cut into stripes that drift down.
            float size = 0.125 + uPulse * 0.004;
            float disc = smoothstep(size, size - 0.003, r);
            float stripes = p.y > 0.035 ? 1.0 : step(0.3 + (0.035 - p.y) * 3.4, fract(p.y * 44.0 + uTime * 0.3));
            vec3 sun = mix(uB, uA, smoothstep(-0.1, 0.11, p.y)) * (1.0 + uPulse * 0.25);
            col = mix(col, sun, disc * stripes);
            col += mix(uB, uGlow, 0.35) * (0.16 + uPulse * 0.08) * smoothstep(0.45, 0.0, r) * (1.0 - disc);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    backdrop.position.set(0, 26, -120);
    backdrop.renderOrder = -10;
    scene.add(backdrop);
    // Mountains of glowing lines on both sides of the sun.
    const ridge = new THREE.LineBasicMaterial({ color: hdr(skin.accent, 1.5), fog: false });
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const height = 9 + (i % 5) * 4;
      const cone = new THREE.ConeGeometry(9 + (i % 3) * 4, height, 4, 1, true);
      const peak = new THREE.LineSegments(new THREE.EdgesGeometry(cone), ridge);
      const body = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: '#0c0620', fog: false }));
      const x = side * (26 + Math.floor(i / 2) * 13);
      peak.position.set(x, height / 2 - 1, -96 - (i % 3) * 5);
      peak.rotation.y = i;
      body.position.copy(peak.position);
      body.rotation.y = i;
      scene.add(body, peak);
    }

    // The ground: a grid of light that rushes towards the camera and flashes on the beat.
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uScroll: { value: 0 }, uPulse: { value: 0 }, uColor: { value: main }, uFog: { value: new THREE.Color('#1a0a36') }, uHalf: { value: LANE * 2 } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uScroll;
        uniform float uPulse;
        uniform vec3 uColor;
        uniform vec3 uFog;
        uniform float uHalf;
        varying vec3 vWorld;
        void main() {
          vec2 g = vec2(vWorld.x / 2.2, (vWorld.z + uScroll) / 2.2);
          vec2 w = fwidth(g) * 1.2;
          vec2 a = abs(fract(g - 0.5) - 0.5);
          float line = max(1.0 - smoothstep(0.0, w.x + 0.012, a.x), 1.0 - smoothstep(0.0, w.y + 0.012, a.y));
          float halo = max(1.0 - smoothstep(0.0, 0.16, a.x), 1.0 - smoothstep(0.0, 0.16, a.y));
          float track = 1.0 - smoothstep(uHalf, uHalf + 0.4, abs(vWorld.x));
          vec3 col = vec3(0.03, 0.015, 0.07) + uColor * (line * (0.6 + uPulse * 0.7) + halo * 0.07) * (1.0 - track * 0.75);
          float far = smoothstep(18.0, 78.0, -vWorld.z);
          gl_FragColor = vec4(mix(col, uFog, far), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 150), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -62;
    scene.add(floor);
    // The track: four lanes, each with a breath of its colour, between lines of light.
    LANE_COLORS.forEach((color, lane) => {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE - 0.06, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.07), transparent: true, opacity: 0.9 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set((lane - 1.5) * LANE, 0.01, -50);
      scene.add(strip);
    });
    const lineMat = new THREE.MeshBasicMaterial({ color: hdr(skin.color, 1.3) });
    for (let i = 0; i <= 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(i === 0 || i === 4 ? 0.07 : 0.035, 0.02, 120), lineMat);
      line.position.set((i - 2) * LANE, 0.02, -50);
      scene.add(line);
    }
    const hitMat = new THREE.MeshBasicMaterial({ color: hdr(skin.accent, 2.4) });
    const hitLine = new THREE.Mesh(new THREE.BoxGeometry(LANE * 4 + 0.3, 0.05, 0.12), hitMat);
    hitLine.position.set(0, 0.04, 0);
    scene.add(hitLine);

    // Pads on the line that light up on a tap.
    const pads = LANE_COLORS.map((color, lane) => {
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 32), new THREE.MeshBasicMaterial({ color: hdr(color, 1.5), transparent: true, opacity: 0.7 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((lane - 1.5) * LANE, 0.05, 0);
      const flash = glow(color, 2.6, 2);
      flash.material.opacity = 0;
      flash.position.set((lane - 1.5) * LANE, 0.4, 0);
      // A ring that runs outwards on a perfect hit.
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: hdr(color, 2.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set((lane - 1.5) * LANE, 0.06, 0);
      scene.add(pad, flash, ring);
      return { pad, flash, ring, wave: 0 };
    });

    // Notes: a pool of glowing gems reused while the song runs.
    const noteGeo = new RoundedBoxGeometry(LANE * 0.78, 0.24, 0.44, 2, 0.08);
    const laneMats = LANE_COLORS.map((color) => new THREE.MeshBasicMaterial({ color: hdr(color, 1.9) }));
    const dot = softDot();
    const pool = Array.from({ length: 40 }, () => {
      const mesh = new THREE.Mesh(noteGeo, laneMats[0]);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(2.2, 1.3, 1);
      mesh.add(halo);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, halo };
    });

    // Along the track: columns of light that jump with the music, and arcs that fly past overhead.
    const pillarMat = new THREE.MeshBasicMaterial({ color: skin.accent });
    const pillars = Array.from({ length: 24 }, (_, i) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, 0.5, 0), pillarMat);
      pillar.position.set(i % 2 === 0 ? -LANE * 2 - 2.5 : LANE * 2 + 2.5, 0, -Math.floor(i / 2) * 6);
      pillar.userData.phase = (i * 2.399) % 6.28;
      scene.add(pillar);
      return pillar;
    });
    const arcMats = LANE_COLORS.map((color) => new THREE.MeshBasicMaterial({ color: hdr(color, 1.6) }));
    const arcGeo = new THREE.TorusGeometry(LANE * 2 + 1.6, 0.05, 6, 40, Math.PI);
    const arcs = Array.from({ length: 6 }, (_, i) => {
      const arc = new THREE.Mesh(arcGeo, arcMats[i % 4]);
      arc.position.set(0, 0, -i * 13);
      scene.add(arc);
      return arc;
    });
    const stars = new THREE.BufferGeometry();
    const sp = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 90;
      sp[i * 3 + 1] = 5 + Math.random() * 30;
      sp[i * 3 + 2] = -10 - Math.random() * 80;
    }
    stars.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const starField = new THREE.Points(stars, new THREE.PointsMaterial({ map: softDot(), color: hdr('#ffffff', 1.5), size: 0.5, transparent: true, opacity: 0.8, depthWrite: false }));
    scene.add(starField);

    // Sparks on a hit, paper snippets at the end, a nudge of the camera on a perfect one.
    const sparks = new Particles(420);
    const confetti = new Confetti();
    const shake = new Shake();
    scene.add(sparks, confetti);
    const fx = { bloom: { strength: 0.6, radius: 0.75, threshold: 1 }, vignette: 0.5 };
    let heat = 0;
    let milestone = 0;

    let hudIn = 0;
    const update = (dt: number) => {
      const l = live.current;
      const t = songTime();
      // Missed notes.
      while (l.next < song.notes.length && song.notes[l.next]!.time < t - WINDOW) {
        if (!l.judged.has(l.next)) {
          l.judged.add(l.next);
          l.missed++;
          if (l.combo >= 5) setCall({ text: 'Daneben', id: -l.next - 1 });
          l.combo = 0;
          hudIn = 0;
        }
        l.next++;
      }
      // Notes on the track.
      let used = 0;
      for (let i = l.next; i < song.notes.length && used < pool.length; i++) {
        const note = song.notes[i]!;
        const ahead = note.time - t;
        if (ahead > AHEAD) break;
        if (l.judged.has(i)) continue;
        const { mesh, halo } = pool[used++]!;
        mesh.visible = true;
        mesh.material = laneMats[note.lane]!;
        (halo.material as THREE.SpriteMaterial).color.set(LANE_COLORS[note.lane]!).multiplyScalar(1.2);
        mesh.position.set((note.lane - 1.5) * LANE, 0.16, -ahead * SPEED);
      }
      for (let i = used; i < pool.length; i++) pool[i]!.mesh.visible = false;
      // Light show: pads flash on taps, everything pulses on the beat – and glows more the longer the streak.
      for (const hit of l.hits.splice(0)) {
        const x = (hit.lane - 1.5) * LANE;
        const color = LANE_COLORS[hit.lane]!;
        sparks.burst({ x, y: 0.25, z: 0 }, hit.perfect ? 30 : 14, [color, '#ffffff'], { speed: [1.5, hit.perfect ? 7 : 4.5], up: 2.5, life: [0.3, 0.75], size: [0.1, 0.3], gravity: 9, intensity: 3 });
        if (hit.perfect) {
          pads[hit.lane]!.wave = 1;
          shake.kick(0.12);
        }
      }
      pads.forEach((p, lane) => {
        l.flashes[lane] = Math.max(0, l.flashes[lane]! - dt * 4);
        p.flash.material.opacity = l.flashes[lane]!;
        p.pad.scale.setScalar(1 + l.flashes[lane]! * 0.25);
        if (p.wave > 0) {
          p.wave = Math.max(0, p.wave - dt * 2.6);
          p.ring.scale.setScalar(1 + (1 - p.wave) * 3.2);
          p.ring.material.opacity = p.wave;
        }
      });
      const phase = t > 0 ? (t / song.beat) % 1 : 0;
      const pulse = Math.max(0, 1 - phase * 3);
      const section = sectionAt(song, Math.max(0, t));
      const energy = section === 'chorus' ? 1 : section === 'break' ? 0.35 : 0.7;
      heat += (Math.min(1, l.combo / 40) - heat) * Math.min(1, dt * 2);
      // Every tenth hit in a row: fireworks from both sides.
      const step = Math.floor(l.combo / 10);
      if (step > milestone) {
        for (const side of [-1, 1]) {
          sparks.burst({ x: side * (LANE * 2 + 1.2), y: 0.3, z: -2 }, 40, [skin.color, skin.accent, '#ffffff'], { speed: [3, 9], up: 6, life: [0.6, 1.3], size: [0.12, 0.34], gravity: 8, intensity: 3 });
        }
      }
      milestone = step;
      pillarMat.color.set(skin.accent).multiplyScalar(0.6 + pulse * energy * 1.6 + heat * 0.6);
      pillars.forEach((pillar) => {
        pillar.position.z += SPEED * dt;
        if (pillar.position.z > 6) pillar.position.z -= 72;
        const wanted = 1.2 + (0.5 + 0.5 * Math.sin(t * 5 + (pillar.userData.phase as number))) * 3.4 * energy + pulse * 1.6 * energy;
        pillar.scale.y += (wanted - pillar.scale.y) * Math.min(1, dt * 12);
      });
      for (const arc of arcs) {
        arc.position.z += SPEED * dt;
        // (Gone before it reaches the camera – from close up an arc would fill the picture.)
        if (arc.position.z > 0.5) arc.position.z -= 78;
      }
      floorMat.uniforms.uScroll!.value = (floorMat.uniforms.uScroll!.value + SPEED * dt) % 2.2;
      floorMat.uniforms.uPulse!.value = pulse * energy;
      const sky = backdrop.material.uniforms;
      sky.uTime!.value = t > 0 ? t : 0;
      sky.uPulse!.value = pulse * energy;
      hitMat.color.copy(second).multiplyScalar(1.8 + pulse * 1.4);
      starField.rotation.z += dt * 0.004;
      fx.bloom.strength = 0.6 + heat * 0.45 + pulse * energy * 0.15;
      const fov = 64 + heat * 5 + pulse * energy * 0.8;
      if (Math.abs(camera.fov - fov) > 0.03) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 4.4 + pulse * 0.07 * energy, 7.4);
      camera.lookAt(0, 0, -9);
      shake.apply(camera, dt, 0.3);
      sparks.update(dt);
      confetti.update(dt);
      hudIn -= dt;
      if (hudIn <= 0) {
        hudIn = 0.15;
        setHud({ score: l.score, combo: l.combo });
      }
      if (!l.done && l.ctx && t > song.length) {
        l.done = true;
        setFinished(true);
        confetti.burst(camera, scene);
        const total = song.notes.length;
        window.setTimeout(
          () =>
            onFinish({
              score: l.score,
              stars: beatStars(l.perfect, l.good, total),
              summary: `Perfekt ${l.perfect} · Gut ${l.good} · Verpasst ${total - l.perfect - l.good} · beste Serie ${l.best}`,
            }),
          1200,
        );
      }
    };
    return { scene, camera, update, fx };
  });

  useEffect(() => {
    if (!call) return;
    const t = window.setTimeout(() => setCall(null), 500);
    return () => window.clearTimeout(t);
  }, [call]);

  return (
    <GameShell label={`Beat-Bahn · ${song.style.name}`} onExit={onQuit} accent={skin.color} night className="arena-shell">
      <div className="arena-hud">
        <span>
          <strong>{hud.score.toLocaleString('de-CH')}</strong>
        </span>
        <span>
          Serie <strong>{hud.combo}</strong>
          {multiplier(hud.combo) > 1 && <em className="beat-mult"> ×{multiplier(hud.combo)}</em>}
        </span>
      </div>
      <div className="arena-stage">
        <canvas ref={canvasRef} className="arena-canvas" role="img" aria-label="Beat-Bahn – tippe die Spur, wenn die Note die Linie erreicht" />
        <div className="beat-lanes">
          {LANE_COLORS.map((color, lane) => (
            <button
              key={color}
              type="button"
              className="beat-lane"
              style={{ '--lane': color } as CSSProperties}
              aria-label={`Spur ${lane + 1}`}
              onPointerDown={(e) => {
                e.preventDefault();
                tap(lane);
              }}
            />
          ))}
        </div>
        {call && (
          <p key={call.id} className={`arena-flash beat-call is-${call.text === 'perfekt' ? 'good' : call.text === 'gut' ? 'ok' : 'bad'}`}>
            {call.text === 'perfekt' ? 'Perfekt!' : call.text === 'gut' ? 'Gut' : 'Daneben'}
          </p>
        )}
        {finished && <p className="arena-finish">Applaus! 👏</p>}
        <CountdownOverlay count={countdown.count} />
      </div>
    </GameShell>
  );
}
