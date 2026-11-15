import { sound } from '../../lib/audio.ts';
import { heatFromInterval, tickInterval } from './logic.ts';
import { playTick } from './sounds.ts';

interface BombTimerOptions {
  /** Secret fuse length in seconds. */
  duration: number;
  accelerate: boolean;
  /** Called (on the main thread) in sync with every audible tick. */
  onTick(heat: number, accent: boolean): void;
  onExplode(): void;
}

const LOOKAHEAD = 0.12; // seconds of audio scheduled in advance
const INTERVAL_MS = 25;

/**
 * Drives the ticking bomb. Uses the "two clocks" pattern: a coarse JS timer
 * schedules ticks slightly ahead on the precise Web Audio clock, so the
 * ticking stays perfectly even even if the UI thread is busy.
 * Game time is measured with performance.now(), which keeps running even if
 * the audio context is suspended by the browser.
 */
export class BombTimer {
  private readonly opts: BombTimerOptions;
  private startedAt = 0;
  private nextTick = 0.05;
  private tickCount = 0;
  private loop: number | undefined;
  private visualTimers = new Set<number>();
  private done = false;

  constructor(opts: BombTimerOptions) {
    this.opts = opts;
  }

  start(): void {
    this.startedAt = performance.now();
    this.loop = window.setInterval(() => this.schedule(), INTERVAL_MS);
    this.schedule();
  }

  stop(): void {
    window.clearInterval(this.loop);
    this.visualTimers.forEach((id) => window.clearTimeout(id));
    this.visualTimers.clear();
    this.done = true;
  }

  private elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  private schedule(): void {
    if (this.done) return;
    const now = this.elapsed();
    if (now >= this.opts.duration) {
      this.stop();
      this.opts.onExplode();
      return;
    }

    const ctx = sound.context;
    const audioRunning = ctx?.state === 'running';
    while (this.nextTick < now + LOOKAHEAD && this.nextTick < this.opts.duration) {
      const progress = this.nextTick / this.opts.duration;
      const interval = tickInterval(progress, this.opts.accelerate);
      const heat = heatFromInterval(interval);
      const accent = this.tickCount % 2 === 0;
      const offset = Math.max(0, this.nextTick - now);

      if (audioRunning && ctx) playTick(ctx.currentTime + offset, accent, heat);

      const id = window.setTimeout(() => {
        this.visualTimers.delete(id);
        if (!this.done) this.opts.onTick(heat, accent);
      }, offset * 1000);
      this.visualTimers.add(id);

      this.nextTick += interval;
      this.tickCount++;
    }
  }
}
