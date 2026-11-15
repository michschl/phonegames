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

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  /**
   * Creates / resumes the audio context. Browsers only allow this inside a
   * user gesture, so call it from click handlers (e.g. the start button).
   */
  unlock(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctor) return null;
      try {
        // iOS: play even when the ring/silent switch is set to silent.
        const nav = navigator as AudioSessionNavigator;
        if (nav.audioSession) nav.audioSession.type = 'playback';
      } catch {
        /* not supported */
      }
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
      this.ctx = ctx;
      this.master = master;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  get context(): AudioContext | null {
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

  tone({ freq, freqEnd, type = 'sine', start, duration, gain = 0.3, attack = 0.005, destination }: ToneOptions): void {
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
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(out);
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
    this.tone({ freq: 520 + (step % 12) * 40, type: 'triangle', duration: 0.06, gain: 0.18 });
  }

  pop(): void {
    this.tone({ freq: 420, freqEnd: 880, type: 'sine', duration: 0.09, gain: 0.2 });
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

  /** Soft clock tick for running timers. */
  tick(): void {
    this.noiseBurst({ duration: 0.025, gain: 0.25, filter: 'bandpass', freq: 3000, q: 8 });
  }

  /** Airy swoosh for card changes. */
  whoosh(): void {
    this.noiseBurst({ duration: 0.35, gain: 0.12, attack: 0.08, filter: 'bandpass', freq: 600, freqEnd: 3500, q: 1.2 });
  }

  /** Snare drum roll; returns a function that ends it with a cymbal-ish crash. */
  drumroll(): () => void {
    const ctx = this.context;
    if (!ctx) return () => undefined;
    let next = ctx.currentTime;
    let stopped = false;
    const timer = window.setInterval(() => {
      while (!stopped && next < ctx.currentTime + 0.1) {
        this.noiseBurst({ start: next, duration: 0.05, gain: 0.12 + Math.random() * 0.06, filter: 'bandpass', freq: 1800, q: 0.8 });
        next += 0.045;
      }
    }, 25);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      this.noiseBurst({ duration: 1.2, gain: 0.25, attack: 0.002, filter: 'highpass', freq: 4000 });
      this.tone({ freq: 110, freqEnd: 55, type: 'sine', duration: 0.4, gain: 0.4 });
    };
  }

  /** Short wooden click (bottle spin, wheel). */
  click(pitch = 1): void {
    this.noiseBurst({ duration: 0.03, gain: 0.3, filter: 'bandpass', freq: 1800 * pitch, q: 5 });
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
