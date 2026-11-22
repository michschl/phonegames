import { useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { CountdownOverlay, useStartCountdown } from '../../games/shared/Timer.tsx';
import { useSettings } from '../../store/settings.ts';
import { beatStars, judge, makeSong, midiToHz, multiplier, points, sectionAt, WINDOW, type Judgement, type Song } from '../beat.ts';
import { glowTexture, skyTexture, useArenaScene } from '../engine.ts';
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
    scene.background = skyTexture('#07051a', '#2a0f45');
    scene.fog = new THREE.Fog(0x14082c, 20, 62);
    const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 200);
    camera.position.set(0, 4.4, 7.4);
    camera.lookAt(0, 0, -9);
    scene.add(new THREE.HemisphereLight(0x8f7cff, 0x1a0b33, 0.8));

    // The track: dark floor with a moving grid, glowing lane lines.
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 64;
    gridCanvas.height = 64;
    const g = gridCanvas.getContext('2d')!;
    g.fillStyle = '#120a26';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = skin.color;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    g.strokeRect(0, 0, 64, 64);
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.wrapS = THREE.RepeatWrapping;
    gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(6, 50);
    gridTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 4 + 14, 120), new THREE.MeshBasicMaterial({ map: gridTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -50;
    scene.add(floor);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 4, 120), new THREE.MeshBasicMaterial({ color: '#0b0618', transparent: true, opacity: 0.85 }));
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.01, -50);
    scene.add(track);
    const lineMat = new THREE.MeshBasicMaterial({ color: skin.color });
    for (let i = 0; i <= 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 120), lineMat);
      line.position.set((i - 2) * LANE, 0.02, -50);
      scene.add(line);
    }
    const hitLine = new THREE.Mesh(new THREE.BoxGeometry(LANE * 4 + 0.3, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: skin.accent }));
    hitLine.position.set(0, 0.04, 0);
    scene.add(hitLine);

    // Pads on the line that light up on a tap.
    const glow = glowTexture('#ffffff');
    const pads = LANE_COLORS.map((color, lane) => {
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((lane - 1.5) * LANE, 0.05, 0);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      flash.position.set((lane - 1.5) * LANE, 0.4, 0);
      flash.scale.set(2.2, 2.2, 1);
      scene.add(pad, flash);
      return { pad, flash };
    });

    // Notes: a pool of glowing gems reused while the song runs.
    const noteGeo = new THREE.BoxGeometry(LANE * 0.78, 0.22, 0.42);
    const laneMats = LANE_COLORS.map((color) => new THREE.MeshBasicMaterial({ color }));
    const pool = Array.from({ length: 40 }, () => {
      const mesh = new THREE.Mesh(noteGeo, laneMats[0]);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(1.8, 1, 1);
      mesh.add(halo);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, halo };
    });

    // Neon pillars along the track, pulsing with the beat.
    const pillarMat = new THREE.MeshBasicMaterial({ color: skin.accent });
    const pillars = Array.from({ length: 20 }, (_, i) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3 + (i % 3), 0.16), pillarMat);
      pillar.position.set(i % 2 === 0 ? -LANE * 2 - 2.5 : LANE * 2 + 2.5, 1.5, -Math.floor(i / 2) * 7);
      scene.add(pillar);
      return pillar;
    });
    const stars = new THREE.BufferGeometry();
    const sp = new Float32Array(400 * 3);
    for (let i = 0; i < 400; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 120;
      sp[i * 3 + 1] = 6 + Math.random() * 40;
      sp[i * 3 + 2] = -20 - Math.random() * 100;
    }
    stars.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 0.3, transparent: true, opacity: 0.7 })));

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
        (halo.material as THREE.SpriteMaterial).color.set(LANE_COLORS[note.lane]!);
        mesh.position.set((note.lane - 1.5) * LANE, 0.16, -ahead * SPEED);
      }
      for (let i = used; i < pool.length; i++) pool[i]!.mesh.visible = false;
      // Light show: pads flash on taps, pillars and grid pulse on the beat.
      pads.forEach(({ flash }, lane) => {
        l.flashes[lane] = Math.max(0, l.flashes[lane]! - dt * 4);
        (flash.material as THREE.SpriteMaterial).opacity = l.flashes[lane]!;
      });
      const phase = t > 0 ? (t / song.beat) % 1 : 0;
      const pulse = Math.max(0, 1 - phase * 3);
      const section = sectionAt(song, Math.max(0, t));
      const energy = section === 'chorus' ? 1 : section === 'break' ? 0.35 : 0.7;
      pillarMat.color.set(skin.accent).multiplyScalar(0.4 + pulse * energy);
      for (const pillar of pillars) {
        pillar.position.z += SPEED * dt;
        if (pillar.position.z > 6) pillar.position.z -= 70;
      }
      gridTex.offset.y += (SPEED * dt) / 2.4;
      camera.position.y = 4.4 + pulse * 0.06 * energy;
      hudIn -= dt;
      if (hudIn <= 0) {
        hudIn = 0.15;
        setHud({ score: l.score, combo: l.combo });
      }
      if (!l.done && l.ctx && t > song.length) {
        l.done = true;
        setFinished(true);
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
    return { scene, camera, update };
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
