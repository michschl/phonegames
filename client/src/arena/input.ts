import { useEffect, useRef, type RefObject } from 'react';

/*
 * Steering of the Arena games: a value from −1 to 1 for each axis (x = right, y = towards the player),
 * from the finger (dragging from where it touched), the arrow keys or – if chosen – tilting the phone
 * (relative to how it was held at the start).
 */

export interface Steer {
  x: number;
  y: number;
  /** A finger is on the screen (or a key is pressed). */
  active: boolean;
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function tiltAvailable(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && navigator.maxTouchPoints > 0;
}

/**
 * The steering of a game. `area` receives the finger; `range` is how far (in CSS pixels) the finger
 * moves for a full turn.
 */
export function useSteer(area: RefObject<HTMLElement | null>, { tilt, range = 90 }: { tilt: boolean; range?: number }): RefObject<Steer> {
  const steer = useRef<Steer>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    let start: { x: number; y: number; id: number } | null = null;
    const keys = new Set<string>();
    const fromKeys = () => {
      steer.current.x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
      steer.current.y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
      steer.current.active = keys.size > 0;
    };
    const down = (event: PointerEvent) => {
      if (start) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      element.setPointerCapture?.(event.pointerId);
      steer.current.active = true;
    };
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id || tilt) return;
      steer.current.x = clamp((event.clientX - start.x) / range);
      steer.current.y = clamp((event.clientY - start.y) / range);
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      steer.current.active = false;
      if (!tilt) {
        steer.current.x = 0;
        steer.current.y = 0;
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (!/^Arrow|^[wasd]$/.test(event.key)) return;
      keys.add(event.key);
      fromKeys();
    };
    const keyup = (event: KeyboardEvent) => {
      keys.delete(event.key);
      fromKeys();
    };
    let zero: { beta: number; gamma: number } | null = null;
    const orientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      zero ??= { beta: event.beta, gamma: event.gamma };
      steer.current.x = clamp((event.gamma - zero.gamma) / 22);
      steer.current.y = clamp((event.beta - zero.beta) / 22);
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    if (tilt) window.addEventListener('deviceorientation', orientation);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('deviceorientation', orientation);
    };
  }, [area, tilt, range]);

  return steer;
}

export interface Stick {
  x: number;
  y: number;
  /** Where the stick is drawn (CSS pixels in the area), while a finger holds it. */
  origin: { x: number; y: number } | null;
  knob: { x: number; y: number } | null;
}

/**
 * Two thumb sticks: a finger on the left half is the left stick, on the right half the right stick.
 * Each stick is centred where the finger first touched. Arrow keys move the right stick, W/S/A/D the left.
 */
export function useTwinSticks(area: RefObject<HTMLElement | null>, range = 60): RefObject<{ left: Stick; right: Stick }> {
  const sticks = useRef({ left: { x: 0, y: 0, origin: null, knob: null } as Stick, right: { x: 0, y: 0, origin: null, knob: null } as Stick });

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const fingers = new Map<number, 'left' | 'right'>();
    const local = (e: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width };
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      const side = p.x < p.width / 2 ? 'left' : 'right';
      if ([...fingers.values()].includes(side)) return;
      fingers.set(e.pointerId, side);
      element.setPointerCapture?.(e.pointerId);
      const stick = sticks.current[side];
      stick.origin = { x: p.x, y: p.y };
      stick.knob = { x: p.x, y: p.y };
    };
    const move = (e: PointerEvent) => {
      const side = fingers.get(e.pointerId);
      if (!side) return;
      const stick = sticks.current[side];
      if (!stick.origin) return;
      const p = local(e);
      let dx = p.x - stick.origin.x;
      let dy = p.y - stick.origin.y;
      const d = Math.hypot(dx, dy);
      if (d > range) {
        dx = (dx / d) * range;
        dy = (dy / d) * range;
      }
      stick.x = clamp(dx / range);
      stick.y = clamp(dy / range);
      stick.knob = { x: stick.origin.x + dx, y: stick.origin.y + dy };
    };
    const up = (e: PointerEvent) => {
      const side = fingers.get(e.pointerId);
      if (!side) return;
      fingers.delete(e.pointerId);
      Object.assign(sticks.current[side], { x: 0, y: 0, origin: null, knob: null });
    };
    const keys = new Set<string>();
    const fromKeys = () => {
      const r = sticks.current.right;
      const l = sticks.current.left;
      if (!r.origin) {
        r.x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        r.y = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      }
      if (!l.origin) {
        l.x = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
        l.y = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if (!/^Arrow|^[wasd]$/.test(e.key)) return;
      keys.add(e.key);
      fromKeys();
    };
    const keyup = (e: KeyboardEvent) => {
      keys.delete(e.key);
      fromKeys();
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
    };
  }, [area, range]);

  return sticks;
}
