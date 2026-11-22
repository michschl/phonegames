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
