/**
 * Tiny Web Audio engine. All sounds are synthesised at runtime – no audio
 * files are needed, which keeps the PWA small and fully offline capable.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

interface ToneOptions {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  start?: number;
  duration: number;
  gain?: number;
  attack?: number;
  /** Seconds the note stays at full volume before it decays (default: percussive). */
  hold?: number;
  /** Optional low-pass filter (Hz) – softens saw/square waves into brass-like tones. */
  lowpass?: number;
  /** Vibrato depth in Hz (rate 5.5 Hz). */
  vibrato?: number;
  destination?: AudioNode;
}

interface NoiseOptions {
  start?: number;
  duration: number;
  gain?: number;
  attack?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  destination?: AudioNode;
}

const MASTER_GAIN = 0.9;

/** Major pentatonic scale (C5 …) – every combination sounds friendly. */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private gesturesInstalled = false;
  /** Audio is released (suspended, no iOS media session) – nothing plays until it is woken. */
  private asleep = false;
  /** A game screen is open and wants sound. */
  private wanted = false;
  private sleepTimer: number | undefined;

  /**
   * Audio lifecycle:
   * - Taps bring back a context that iOS interrupted – but only while a game wants sound.
   * - When the app goes to the background or is closed, audio is released, so iOS
   *   does not keep showing a "now playing" media entry for Phonegames.
   */
  installGestureUnlock(): void {
    if (this.gesturesInstalled || typeof document === 'undefined') return;
    this.gesturesInstalled = true;
    const wake = () => {
      if (this.wanted && this.ctx && this.ctx.state !== 'running') this.unlock();
    };
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      document.addEventListener(type, wake, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.sleep();
      // Back in a running game: the next tap (or the next sound) wakes the audio again.
      else if (this.wanted) this.asleep = false;
    });
    window.addEventListener('pagehide', () => this.sleep());
  }

  private setSessionType(type: 'playback' | 'auto'): void {
    try {
      // iOS: "playback" plays even when the ring/silent switch is set to silent.
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = type;
    } catch {
      /* not supported */
    }
  }

  /** A game screen opened: keep sound available. */
  hold(): void {
    this.wanted = true;
    this.asleep = false;
    window.clearTimeout(this.sleepTimer);
  }

  /** A game screen closed: release the audio shortly after (last sounds may finish). */
  release(delayMs = 1500): void {
    this.wanted = false;
    window.clearTimeout(this.sleepTimer);
    this.sleepTimer = window.setTimeout(() => {
      if (!this.wanted) this.sleep();
    }, delayMs);
  }

  /** Suspends the audio and ends the media session (removes iOS "now playing"). */
  sleep(): void {
    window.clearTimeout(this.sleepTimer);
    this.asleep = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
    this.setSessionType('auto');
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      }
    } catch {
      /* not supported */
    }
  }

  /**
   * Creates / resumes the audio context. Browsers only allow this inside a
   * user gesture, so call it from click handlers (e.g. the start button).
   */
  unlock(): AudioContext | null {
    window.clearTimeout(this.sleepTimer);
    this.asleep = false;
    if (typeof window === 'undefined') return null;
    this.setSessionType('playback');
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : MASTER_GAIN;
      master.connect(compressor);
      compressor.connect(ctx.destination);
      // iOS only "opens" the audio output once something has been played inside the gesture.
      const silence = ctx.createBufferSource();
      silence.buffer = ctx.createBuffer(1, 1, 22050);
      silence.connect(ctx.destination);
      silence.start(0);
      this.ctx = ctx;
      this.master = master;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** The running audio context – null while asleep, so nothing piles up to play later. */
  get context(): AudioContext | null {
    return this.ctx && !this.asleep && this.ctx.state !== 'closed' ? this.ctx : null;
  }

  /** Context for decoding audio data, also while asleep. */
  get decoder(): AudioContext | null {
    return this.ctx && this.ctx.state !== 'closed' ? this.ctx : null;
  }

  get output(): AudioNode | null {
    return this.master;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, this.ctx.currentTime, 0.03);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  noiseBuffer(): AudioBuffer | null {
    const ctx = this.context;
    if (!ctx) return null;
    if (!this.noise) {
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    return this.noise;
  }

  tone({
    freq,
    freqEnd,
    type = 'sine',
    start,
    duration,
    gain = 0.3,
    attack = 0.005,
    hold = 0,
    lowpass,
    vibrato,
    destination,
  }: ToneOptions): void {
    const ctx = this.context;
    const out = destination ?? this.master;
    if (!ctx || !out) return;
    const t = start ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    if (hold > 0) amp.gain.setValueAtTime(gain, t + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let chain: AudioNode = osc;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      chain = chain.connect(filter);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + duration + 0.02);
    }
    chain.connect(amp).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  noiseBurst({
    start,
    duration,
    gain = 0.3,
    attack = 0.003,
    filter = 'bandpass',
    freq = 1000,
    freqEnd,
    q = 1,
    destination,
  }: NoiseOptions): void {
    const ctx = this.context;
    const buffer = this.noiseBuffer();
    const out = destination ?? this.master;
    if (!ctx || !buffer || !out) return;
    const t = start ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t);
    if (freqEnd) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
    biquad.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(biquad).connect(amp).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  /* ----------------------------------------------------------- UI sounds */

  blip(step = 0): void {
    this.tone({ freq: 520 + (step % 12) * 40, type: 'triangle', duration: 0.06, gain: 0.2 });
  }

  pop(): void {
    this.tone({ freq: 420, freqEnd: 900, type: 'sine', duration: 0.1, gain: 0.3 });
    this.tone({ freq: 840, freqEnd: 1800, type: 'triangle', duration: 0.06, gain: 0.08 });
  }

  /** Light tap for buttons, chips and choices. */
  tap(): void {
    this.tone({ freq: 1400, type: 'triangle', duration: 0.05, gain: 0.16 });
    this.noiseBurst({ duration: 0.02, gain: 0.25, filter: 'highpass', freq: 3500 });
  }

  /** Little fanfare for the starting player. */
  reveal(): void {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.tone({ freq, type: 'triangle', start: t + i * 0.075, duration: 0.28, gain: 0.22 });
      this.tone({ freq: freq * 2, type: 'sine', start: t + i * 0.075, duration: 0.18, gain: 0.05 });
    });
    this.noiseBurst({ start: t, duration: 0.4, gain: 0.06, filter: 'highpass', freq: 3000, freqEnd: 8000 });
  }

  /** Bright "ding-ding" for a correct answer. */
  correct(): void {
    const t = this.now;
    this.tone({ freq: 1046.5, type: 'triangle', start: t, duration: 0.16, gain: 0.22 });
    this.tone({ freq: 1568, type: 'triangle', start: t + 0.08, duration: 0.3, gain: 0.2 });
  }

  /** Short descending "bwop" for skip / wrong. */
  wrong(): void {
    const t = this.now;
    this.tone({ freq: 420, freqEnd: 180, type: 'sawtooth', start: t, duration: 0.22, gain: 0.12 });
  }

  /** Harsh buzzer for "time is up" or a foul. */
  buzzer(duration = 0.6): void {
    const t = this.now;
    this.tone({ freq: 140, type: 'square', start: t, duration, gain: 0.22, attack: 0.01 });
    this.tone({ freq: 147, type: 'sawtooth', start: t, duration, gain: 0.14, attack: 0.01 });
  }

  /** Countdown beep; the final one is higher and longer. */
  beep(final = false): void {
    this.tone({ freq: final ? 1320 : 880, type: 'sine', duration: final ? 0.4 : 0.12, gain: 0.25 });
  }

  /** Clock tick for running timers. */
  tick(): void {
    this.noiseBurst({ duration: 0.03, gain: 0.6, filter: 'bandpass', freq: 3200, q: 3 });
    this.tone({ freq: 2400, type: 'triangle', duration: 0.02, gain: 0.05 });
  }

  /** Airy swoosh for card changes. */
  whoosh(): void {
    this.noiseBurst({ duration: 0.35, gain: 0.32, attack: 0.08, filter: 'bandpass', freq: 600, freqEnd: 3500, q: 0.8 });
  }

  /**
   * Snare drum roll. Returns a stop function: by default it ends with a
   * cymbal-ish crash; `stop(false)` just cuts it (e.g. when leaving the game).
   */
  drumroll(): (finish?: boolean) => void {
    const ctx = this.context;
    if (!ctx) return () => undefined;
    let next = ctx.currentTime;
    let stopped = false;
    const timer = window.setInterval(() => {
      while (!stopped && next < ctx.currentTime + 0.1) {
        this.noiseBurst({ start: next, duration: 0.05, gain: rand(0.3, 0.42), filter: 'bandpass', freq: 1700, q: 0.7 });
        next += 0.045;
      }
    }, 25);
    return (finish = true) => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      if (!finish) return;
      this.noiseBurst({ duration: 1.2, gain: 0.4, attack: 0.002, filter: 'highpass', freq: 4000 });
      this.tone({ freq: 110, freqEnd: 55, type: 'sine', duration: 0.4, gain: 0.45 });
      this.tone({ freq: 220, freqEnd: 110, type: 'triangle', duration: 0.3, gain: 0.2 });
    };
  }

  /** Short wooden "tock" (bottle spin, wheel, counters). */
  click(pitch = 1): void {
    this.tone({ freq: 1000 * pitch, freqEnd: 700 * pitch, type: 'triangle', duration: 0.04, gain: 0.24 });
    this.noiseBurst({ duration: 0.025, gain: 0.5, filter: 'bandpass', freq: 2400 * pitch, q: 1.5 });
  }

  /** Card turned over / secret uncovered. */
  flip(): void {
    const t = this.now;
    this.noiseBurst({ start: t, duration: 0.13, gain: 0.4, attack: 0.01, filter: 'bandpass', freq: 2600, freqEnd: 900, q: 0.9 });
    this.tone({ freq: 660, freqEnd: 990, type: 'triangle', start: t + 0.03, duration: 0.09, gain: 0.14 });
  }

  /** Plucked note; consecutive indices climb a pentatonic scale (players joining, fingers, counting). */
  pluck(index = 0): void {
    const octave = Math.floor(index / PENTATONIC.length);
    const freq = PENTATONIC[index % PENTATONIC.length]! * 2 ** Math.min(octave, 1);
    const t = this.now;
    this.tone({ freq, type: 'triangle', start: t, duration: 0.4, gain: 0.28, attack: 0.003 });
    this.tone({ freq: freq * 2, type: 'sine', start: t, duration: 0.16, gain: 0.08 });
  }

  /** Something leaves / is taken back. */
  unpluck(): void {
    this.tone({ freq: 392, freqEnd: 262, type: 'triangle', duration: 0.14, gain: 0.16 });
  }

  /** Rising swirl, e.g. when something starts spinning. */
  swirl(): void {
    this.noiseBurst({ duration: 0.55, gain: 0.38, attack: 0.06, filter: 'bandpass', freq: 400, freqEnd: 3200, q: 1.4 });
    this.tone({ freq: 300, freqEnd: 900, type: 'sine', duration: 0.45, gain: 0.08 });
  }

  /** Bright bell – something landed or was chosen. */
  ding(): void {
    const t = this.now;
    this.tone({ freq: 1318.51, type: 'sine', start: t, duration: 1.3, gain: 0.26, attack: 0.002 });
    this.tone({ freq: 3640, type: 'sine', start: t, duration: 0.5, gain: 0.05, attack: 0.002 });
    this.tone({ freq: 659.25, type: 'triangle', start: t, duration: 0.9, gain: 0.1, attack: 0.002 });
  }

  /** Point scored. */
  coin(): void {
    const t = this.now;
    this.tone({ freq: 987.77, type: 'square', start: t, duration: 0.08, gain: 0.1, lowpass: 4000 });
    this.tone({ freq: 1318.51, type: 'square', start: t + 0.07, duration: 0.35, gain: 0.12, hold: 0.06, lowpass: 4000 });
  }

  /** Short rising counter tick (e.g. numbers counting up). */
  countTick(step = 0): void {
    this.tone({ freq: Math.min(2200, 600 + step * 30), type: 'triangle', duration: 0.035, gain: 0.14 });
  }

  /** Magic glitter for big reveals. */
  sparkle(): void {
    const t = this.now;
    PENTATONIC.slice(3).forEach((freq, i) => {
      this.tone({ freq: freq * 1.5, type: 'sine', start: t + i * 0.045, duration: 0.25, gain: 0.07 });
    });
    this.noiseBurst({ start: t, duration: 0.6, gain: 0.08, attack: 0.05, filter: 'highpass', freq: 6000 });
  }

  /** Winner fanfare (brass-like). */
  fanfare(): void {
    const t = this.now;
    const brass = { type: 'sawtooth' as const, lowpass: 2600, attack: 0.02 };
    [392, 523.25, 659.25].forEach((freq, i) => {
      this.tone({ ...brass, freq, start: t + i * 0.13, duration: 0.14, gain: 0.13 });
    });
    [523.25, 659.25, 783.99, 1046.5].forEach((freq) => {
      this.tone({ ...brass, freq, start: t + 0.42, duration: 1.1, hold: 0.5, gain: 0.09, vibrato: 4 });
    });
    this.noiseBurst({ start: t + 0.42, duration: 1.2, gain: 0.18, filter: 'highpass', freq: 5000 });
    this.tone({ freq: 130.81, type: 'triangle', start: t + 0.42, duration: 0.8, gain: 0.25 });
  }

  /** Sad trombone – lost, wrong guess, game over for someone. */
  fail(): void {
    const t = this.now;
    const notes: [number, number, number][] = [
      [392, 0, 0.32],
      [369.99, 0.34, 0.32],
      [349.23, 0.68, 0.32],
      [329.63, 1.02, 1],
    ];
    for (const [freq, at, length] of notes) {
      this.tone({
        freq,
        type: 'sawtooth',
        lowpass: 1300,
        start: t + at,
        duration: length,
        hold: length * 0.6,
        attack: 0.03,
        gain: 0.16,
        vibrato: at > 1 ? 7 : 0,
      });
    }
  }

  /** Dramatic hit: a sudden, dark chord (a death in the village, a big twist). */
  sting(): void {
    const t = this.now;
    this.noiseBurst({ start: t, duration: 0.6, gain: 0.5, attack: 0.002, filter: 'lowpass', freq: 900, freqEnd: 120 });
    this.tone({ freq: 110, freqEnd: 55, type: 'sine', start: t, duration: 1, gain: 0.5 });
    [220, 261.63, 311.13, 415.3].forEach((freq) => {
      this.tone({ freq, type: 'sawtooth', lowpass: 1800, start: t, duration: 1.8, hold: 0.3, gain: 0.07, attack: 0.01 });
    });
  }

  /** Deep gong, e.g. for a verdict or the end of a round. */
  gong(): void {
    const t = this.now;
    [98, 147, 196, 294].forEach((freq, i) => {
      this.tone({ freq, type: 'sine', start: t, duration: 3 - i * 0.4, gain: 0.3 / (i + 1), attack: 0.004 });
    });
    this.tone({ freq: 392, type: 'triangle', start: t, duration: 1.2, gain: 0.08, vibrato: 3 });
    this.noiseBurst({ start: t, duration: 0.5, gain: 0.2, attack: 0.002, filter: 'lowpass', freq: 600 });
  }

  /** Morning birds chirping. */
  birds(): void {
    const t = this.now;
    for (let i = 0; i < 7; i++) {
      const start = t + rand(0, 2.2);
      const freq = rand(2600, 3800);
      const chirps = Math.random() < 0.5 ? 2 : 3;
      for (let c = 0; c < chirps; c++) {
        this.tone({ freq, freqEnd: freq * rand(1.15, 1.4), type: 'sine', start: start + c * 0.09, duration: 0.07, gain: 0.07 });
      }
    }
  }

  /** Rising tension sweep for suspense before a reveal. Returns a function that fades it out early. */
  tension(duration = 2): () => void {
    const ctx = this.context;
    const out = this.master;
    if (!ctx || !out) return () => undefined;
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.connect(out);
    [110, 116.54].forEach((freq) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 4, t + duration);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(3500, t + duration);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.09, t + duration * 0.9);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.08);
      osc.connect(filter).connect(amp).connect(bus);
      osc.start(t);
      osc.stop(t + duration + 0.1);
    });
    return () => bus.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
  }

  /**
   * Heartbeat loop ("lub-dub"). Returns controls to change the tempo and to stop it.
   * The low thump gets a higher partial so phone speakers can play it.
   */
  heartbeat(bpm = 70): { stop: () => void; setBpm: (bpm: number) => void } {
    const ctx = this.context;
    if (!ctx) return { stop: () => undefined, setBpm: () => undefined };
    let interval = 60 / bpm;
    let next = ctx.currentTime + 0.05;
    let stopped = false;
    const beat = (at: number, gain: number) => {
      this.tone({ freq: 80, freqEnd: 45, type: 'sine', start: at, duration: 0.14, gain });
      this.tone({ freq: 170, freqEnd: 90, type: 'triangle', start: at, duration: 0.1, gain: gain * 0.5 });
    };
    const timer = window.setInterval(() => {
      while (!stopped && next < ctx.currentTime + 0.15) {
        beat(next, 0.55);
        beat(next + 0.2, 0.35);
        next += interval;
      }
    }, 40);
    return {
      stop: () => {
        stopped = true;
        window.clearInterval(timer);
      },
      setBpm: (value: number) => {
        interval = 60 / Math.max(30, Math.min(200, value));
      },
    };
  }

  /** Spooky wolf howl. */
  howl(): void {
    const ctx = this.context;
    const out = this.master;
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    const amp = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.linearRampToValueAtTime(560, t + 0.6);
    osc.frequency.linearRampToValueAtTime(600, t + 1.6);
    osc.frequency.linearRampToValueAtTime(420, t + 2.4);
    vibrato.frequency.value = 5.5;
    vibratoGain.gain.value = 9;
    vibrato.connect(vibratoGain).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.12, t + 0.4);
    amp.gain.setValueAtTime(0.12, t + 1.8);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(filter).connect(amp).connect(out);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 2.6);
    vibrato.stop(t + 2.6);
  }

  /** Night ambience with chirping crickets. Returns a stop function. */
  crickets(): () => void {
    const timer = window.setInterval(() => {
      if (Math.random() < 0.6) {
        const t = this.now;
        const freq = 4200 + Math.random() * 600;
        for (let i = 0; i < 3; i++) this.tone({ freq, type: 'sine', start: t + i * 0.06, duration: 0.04, gain: 0.025 });
      }
    }, 420);
    return () => window.clearInterval(timer);
  }
}

export const sound = new SoundEngine();
sound.installGestureUnlock();
