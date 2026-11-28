import { sound } from '../../lib/audio.ts';

/* The sounds of «Plumps!»: wood on wood, and the deep plop of a stick that falls into the box. */

const now = (): number => sound.context?.currentTime ?? 0;

/** Dice rattling over the table for about `seconds`, getting slower. */
export function rattle(seconds = 0.85): void {
  const t = now();
  let at = 0;
  let gap = 0.055;
  while (at < seconds) {
    const pitch = 0.8 + Math.random() * 0.6;
    sound.noiseBurst({ start: t + at, duration: 0.028, gain: 0.3, filter: 'bandpass', freq: 2100 * pitch, q: 4 });
    sound.tone({ freq: 360 * pitch, freqEnd: 220 * pitch, type: 'triangle', start: t + at, duration: 0.045, gain: 0.13 });
    at += gap;
    gap *= 1.2;
  }
}

/** The dice have come to rest. */
export function land(): void {
  const t = now();
  sound.tone({ freq: 210, freqEnd: 110, type: 'triangle', start: t, duration: 0.12, gain: 0.3 });
  sound.noiseBurst({ start: t, duration: 0.05, gain: 0.28, filter: 'lowpass', freq: 1400 });
}

/** A stick goes into a free hole: a bright wooden «tok». */
export function stickIn(): void {
  const t = now();
  sound.tone({ freq: 640, freqEnd: 360, type: 'triangle', start: t, duration: 0.09, gain: 0.34 });
  sound.noiseBurst({ start: t, duration: 0.03, gain: 0.25, filter: 'bandpass', freq: 2800, q: 5 });
  sound.tone({ freq: 190, freqEnd: 140, type: 'sine', start: t + 0.01, duration: 0.1, gain: 0.2 });
}

/** A stick is pulled out again – bad luck. */
export function stickOut(): void {
  const t = now();
  sound.tone({ freq: 260, freqEnd: 620, type: 'triangle', start: t, duration: 0.13, gain: 0.24 });
  sound.tone({ freq: 330, freqEnd: 170, type: 'sawtooth', start: t + 0.2, duration: 0.26, gain: 0.16, lowpass: 900 });
}

/** The stick falls into the box: a whistle down, a deep plop, a rattle inside. */
export function plump(): void {
  const t = now();
  sound.tone({ freq: 900, freqEnd: 180, type: 'sine', start: t, duration: 0.24, gain: 0.22 });
  sound.tone({ freq: 190, freqEnd: 48, type: 'sine', start: t + 0.2, duration: 0.3, gain: 0.6 });
  sound.noiseBurst({ start: t + 0.2, duration: 0.2, gain: 0.3, filter: 'lowpass', freq: 700, freqEnd: 160 });
  for (let i = 0; i < 3; i++) {
    sound.noiseBurst({ start: t + 0.42 + i * 0.07, duration: 0.03, gain: 0.16 - i * 0.04, filter: 'bandpass', freq: 1700 + i * 300, q: 5 });
  }
}

/** Both dice name the same hole. */
export function doubleHit(): void {
  const t = now();
  [660, 880, 1100, 1320, 1760].forEach((freq, i) => sound.tone({ freq, type: 'triangle', start: t + i * 0.055, duration: 0.2, gain: 0.2 }));
  sound.noiseBurst({ start: t, duration: 0.35, gain: 0.1, filter: 'highpass', freq: 5200 });
}

/** One stick left: two soft heartbeats. */
export function lastStick(): void {
  const t = now();
  [0, 0.16].forEach((at) => sound.tone({ freq: 96, freqEnd: 54, type: 'sine', start: t + at, duration: 0.14, gain: 0.42 }));
}
