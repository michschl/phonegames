import { api, ApiError, OfflineError } from './api.ts';
import { useAuth } from '../store/auth.ts';
import { useData } from '../store/data.ts';
import { toast, useUi } from '../store/ui.ts';

let timer: number | undefined;
let running: Promise<boolean> | null = null;
let again = false;

/** Debounced sync – called after every local change. */
export function scheduleSync(delay = 1200): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delay);
}

/** Push local changes and pull the merged state from the server. */
export function syncNow(): Promise<boolean> {
  if (!useAuth.getState().user) return Promise.resolve(false);
  if (!navigator.onLine) {
    useUi.setState({ syncStatus: 'offline' });
    return Promise.resolve(false);
  }
  if (running) {
    again = true;
    return running;
  }

  running = (async () => {
    useUi.setState({ syncStatus: 'syncing' });
    const state = useData.getState();
    const sentRevision = state.revision;
    try {
      const response = await api.sync({
        library: Object.values(state.library),
        groups: Object.values(state.groups),
      });
      // The user might have logged out while the request was running.
      if (useAuth.getState().user?.id !== useData.getState().ownerId) return false;
      useData.getState().applyRemote(response, sentRevision);
      useUi.setState({ syncStatus: 'idle' });
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired();
      } else {
        useUi.setState({ syncStatus: error instanceof OfflineError ? 'offline' : 'error' });
      }
      return false;
    } finally {
      running = null;
      if (again) {
        again = false;
        scheduleSync(300);
      }
    }
  })();
  return running;
}

/**
 * The server no longer accepts the session. Local data is kept on purpose:
 * when the same person logs in again, unsynced offline changes are merged.
 * (Logging in with another account resets the local data, see session.ts.)
 */
export function handleSessionExpired(): void {
  if (!useAuth.getState().user) return;
  useAuth.setState({ user: null });
  toast('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.', { tone: 'error' });
}

let started = false;

export function startSyncEngine(): void {
  if (started) return;
  started = true;

  useData.subscribe((state, prev) => {
    if (state.revision !== prev.revision) scheduleSync();
  });

  window.addEventListener('online', () => {
    useUi.setState({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => useUi.setState({ online: false, syncStatus: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  window.setInterval(() => void syncNow(), 5 * 60 * 1000);
}
