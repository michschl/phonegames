import { useEffect } from 'react';

let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

/** Vibration feedback (Android). iOS Safari ignores the Vibration API silently. */
export function haptic(pattern: number | number[] = 10): void {
  if (!hapticsEnabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Keep the screen awake while `active` is true (e.g. during a game). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) void sentinel.release();
      } catch {
        /* e.g. battery saver – not critical */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

export const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

let device: string | null = null;

/** A random id of this device – it counts its own coins (see shared/coins.ts). */
export function deviceId(): string {
  if (device) return device;
  try {
    device = localStorage.getItem('phonegames-device');
    if (!device) {
      device = `d${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem('phonegames-device', device);
    }
  } catch {
    device ??= `d${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }
  return device;
}
