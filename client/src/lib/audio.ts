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
}

export const sound = new SoundEngine();
