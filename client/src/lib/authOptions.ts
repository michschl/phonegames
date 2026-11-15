import { useEffect, useState } from 'react';
import type { AuthOptions } from '../../../shared/types.ts';
import { useUi } from '../store/ui.ts';
import { api, OfflineError } from './api.ts';

let cached: Promise<AuthOptions> | null = null;

/** Public server settings (invitation code, passkeys) – loaded once per app start. */
export function loadAuthOptions(): Promise<AuthOptions> {
  if (!cached && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new OfflineError());
  }
  cached ??= api.authOptions().catch((error: unknown) => {
    cached = null; // try again next time, e.g. when back online
    throw error;
  });
  return cached;
}

/** The server settings, or null while loading / offline (loaded as soon as the device is online). */
export function useAuthOptions(): AuthOptions | null {
  const online = useUi((s) => s.online);
  const [options, setOptions] = useState<AuthOptions | null>(null);
  useEffect(() => {
    if (options || !online) return;
    let active = true;
    loadAuthOptions()
      .then((value) => active && setOptions(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [online, options]);
  return options;
}
