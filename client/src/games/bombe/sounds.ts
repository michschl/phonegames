import { sound } from '../../lib/audio.ts';

/** Clock-like "tick" / "tock" scheduled at an exact audio time. */
export function playTick(time: number, accent: boolean, heat: number): void {
  sound.noiseBurst({
    start: time,
    duration: 0.035,
    gain: 0.55,
    filter: 'bandpass',
    freq: accent ? 3400 : 2500,
    q: 7,
  });
  sound.tone({
    freq: accent ? 1300 : 980,
    type: 'square',
    start: time,
    duration: 0.04,
    gain: 0.06 + heat * 0.05,
  });
  // A low heartbeat thump joins in when the bomb gets hot.
  if (heat > 0.35) {
    sound.tone({ freq: 75, freqEnd: 42, type: 'sine', start: time, duration: 0.14, gain: 0.35 * heat });
  }
}

/** Crackling fuse hiss in the background. Returns a stop function. */
export function startFuse(): () => void {
  const ctx = sound.context;
  const buffer = sound.noiseBuffer();
  const out = sound.output;
  if (!ctx || !buffer || !out) return () => undefined;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 5200;
  filter.Q.value = 0.8;
  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  amp.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
  src.connect(filter).connect(amp).connect(out);
  src.start();

  // Random crackles.
  const crackle = window.setInterval(() => {
    if (Math.random() < 0.55) {
      const t = ctx.currentTime + Math.random() * 0.05;
      sound.noiseBurst({ start: t, duration: 0.02 + Math.random() * 0.03, gain: 0.05 + Math.random() * 0.08, filter: 'highpass', freq: 2500 });
    }
  }, 70);

  return () => {
    window.clearInterval(crackle);
    amp.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    src.stop(ctx.currentTime + 0.2);
  };
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 2048;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/** The big one: crack + roaring blast + sub-bass boom + debris. */
export function playExplosion(): void {
  const ctx = sound.context;
  const out = sound.output;
  if (!ctx || !out) return;
  const t = ctx.currentTime + 0.01;

  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(60);
  shaper.oversample = '4x';
  const grit = ctx.createGain();
  grit.gain.value = 0.9;
  shaper.connect(grit).connect(out);

  // Initial crack.
  sound.noiseBurst({ start: t, duration: 0.25, gain: 1, attack: 0.001, filter: 'highpass', freq: 900 });
  // Roaring blast, filter closing slowly.
  sound.noiseBurst({
    start: t,
    duration: 2.6,
    gain: 1.3,
    attack: 0.004,
    filter: 'lowpass',
    freq: 6000,
    freqEnd: 120,
    q: 0.7,
    destination: shaper,
  });
  // Sub-bass boom.
  sound.tone({ freq: 150, freqEnd: 30, type: 'sine', start: t, duration: 1.6, gain: 1, attack: 0.004 });
  sound.tone({ freq: 95, freqEnd: 24, type: 'triangle', start: t, duration: 1.2, gain: 0.6, destination: shaper });
  // Long rumble tail.
  sound.noiseBurst({ start: t + 0.05, duration: 4, gain: 0.5, attack: 0.15, filter: 'lowpass', freq: 420, freqEnd: 60 });
  // Falling debris.
  for (let i = 0; i < 14; i++) {
    const at = t + 0.35 + Math.random() * 1.8;
    sound.noiseBurst({
      start: at,
      duration: 0.04 + Math.random() * 0.08,
      gain: 0.08 + Math.random() * 0.12,
      filter: 'bandpass',
      freq: 1800 + Math.random() * 3500,
      q: 3,
    });
  }
}
