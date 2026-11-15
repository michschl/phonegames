import { useEffect, useRef } from 'react';

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * iOS asks for permission before sensor data is delivered. Must be called
 * from a tap handler. Other browsers resolve immediately.
 */
export async function requestTiltPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  const api = window.DeviceOrientationEvent as unknown as PermissionApi;
  if (typeof api.requestPermission === 'function') {
    try {
      return (await api.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * How much the screen faces up: +1 = lying face up, −1 = face down, 0 = upright.
 * Independent of portrait/landscape: it is the vertical component of the
 * screen normal, cos(β)·cos(γ) in the W3C orientation convention.
 */
export function screenUpness(beta: number, gamma: number): number {
  const rad = Math.PI / 180;
  return Math.cos(beta * rad) * Math.cos(gamma * rad);
}

const NEUTRAL = 0.35;
const TRIGGER = 0.6;

/**
 * Detects a deliberate nod with the phone on the forehead:
 * screen tilted towards the floor → "down", towards the ceiling → "up".
 * After a trigger the phone has to return to upright before the next one.
 */
export function useTilt(active: boolean, onTilt: (direction: 'down' | 'up') => void): void {
  const armed = useRef(false);
  const callback = useRef(onTilt);
  callback.current = onTilt;

  useEffect(() => {
    if (!active) return;
    armed.current = false;
    const handler = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const up = screenUpness(event.beta, event.gamma);
      if (Math.abs(up) < NEUTRAL) {
        armed.current = true;
        return;
      }
      if (!armed.current) return;
      if (up < -TRIGGER) {
        armed.current = false;
        callback.current('down');
      } else if (up > TRIGGER) {
        armed.current = false;
        callback.current('up');
      }
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [active]);
}
