import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { toast } from '../store/ui.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  /** A new version is installed and waiting – it is applied by reloading. */
  needRefresh: boolean;
  update: (() => Promise<void>) | null;
  /** The update hint was closed – the update still comes at the next safe moment. */
  hintDismissed: boolean;
  /** «Nach Updates suchen» was tapped – load the new version as soon as it is ready. */
  applyWhenReady: boolean;
}

export const usePwa = create<PwaState>(() => ({
  installEvent: null,
  needRefresh: false,
  update: null,
  hintDismissed: false,
  applyWhenReady: false,
}));

/** How often an open app looks for a new version, and how often at most. */
const CHECK_EVERY_MS = 15 * 60 * 1000;
const CHECK_GAP_MS = 60 * 1000;

let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;

/**
 * Asks the server for a new service worker (sw.js is served with no-cache). Browsers do this
 * on their own only when the app is opened – a PWA that comes back from the background would
 * otherwise keep the old version until it is closed.
 */
export async function checkForUpdate(force = false): Promise<'update' | 'current' | 'offline' | 'unsupported'> {
  if (!registration) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  if (usePwa.getState().needRefresh) return 'update';
  if (!force && Date.now() - lastCheck < CHECK_GAP_MS) return 'current';
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  return registration.installing || registration.waiting ? 'update' : 'current';
}

/** A running game, unsaved stack edits and half-filled sign-in forms would be lost by a reload. */
const UNSAFE_PAGES = /^\/(spiel\/[^/]+\/los|stapel\/.+|anmelden|registrieren)/;

export function isSafeToReload(path = window.location.pathname): boolean {
  if (UNSAFE_PAGES.test(path)) return false;
  const active = document.activeElement;
  return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
}

const FORCED_RELOAD_KEY = 'phonegames-update-reload';

function lastForcedReload(): number {
  try {
    return Number(sessionStorage.getItem(FORCED_RELOAD_KEY) ?? 0);
  } catch {
    return 0;
  }
}
let applying = false;

/** The main script of the code that is running (from index.html). */
const RUNNING_SCRIPT = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');

async function reloadPage(): Promise<void> {
  window.location.reload();
}

/**
 * A new version can take over without this page seeing it wait – e.g. when it activates just
 * after a reload. The page then still runs the old code. The service worker's index.html shows
 * which version it would serve now: if that is not ours, load it – right away while an update
 * is being applied, otherwise at the next safe moment.
 */
async function checkRunningVersion(): Promise<void> {
  if (!RUNNING_SCRIPT || !navigator.serviceWorker.controller || usePwa.getState().update === reloadPage) return;
  let html: string;
  try {
    html = await (await fetch('/index.html', { cache: 'no-store' })).text();
  } catch {
    return;
  }
  if (!html.includes('/assets/') || html.includes(RUNNING_SCRIPT)) return;
  if (Date.now() - lastForcedReload() < 30_000 && isSafeToReload()) {
    window.location.reload();
    return;
  }
  usePwa.setState({ needRefresh: true, update: reloadPage });
}

/**
 * Applies a waiting new version: it takes over and the page reloads. Now and then the old
 * version is still busy with a request and blocks the switch – then the page reloads anyway
 * after a few seconds, which ends those requests so the new version can take over. At most
 * once a minute, so a stubborn browser cannot cause a reload loop.
 */
export function applyUpdate(): void {
  const update = usePwa.getState().update;
  if (!update || applying) return;
  applying = true;
  void update();
  window.setTimeout(() => {
    const last = lastForcedReload();
    try {
      sessionStorage.setItem(FORCED_RELOAD_KEY, String(Date.now()));
    } catch {
      // Private mode: reload once anyway.
    }
    // Not when a game was started in the meantime – the hint stays and the update comes later.
    if (Date.now() - last > 60_000 && isSafeToReload()) window.location.reload();
    else applying = false;
  }, 4000);
}

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwa.setState({ installEvent: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    usePwa.setState({ installEvent: null });
    toast('Phonegames ist jetzt auf deinem Startbildschirm 🎉');
  });

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => void checkRunningVersion());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void checkRunningVersion();
    });
    // Right after an update reload the new version often takes over a moment later.
    if (Date.now() - lastForcedReload() < 30_000) {
      for (let delay = 500; delay < 20_000; delay += 2000) window.setTimeout(() => void checkRunningVersion(), delay);
    }
  }

  const updateSW = registerSW({
    onNeedRefresh() {
      // Shown as a lasting hint (UpdateHint) and applied at the next safe moment (useAutoUpdate).
      usePwa.setState({ needRefresh: true, update: () => updateSW(true) });
      if (usePwa.getState().applyWhenReady) void updateSW(true);
    },
    onOfflineReady() {
      // On the welcome and sign-in pages this would cover the hero for a first-time visitor —
      // the welcome text already says the games work offline.
      if (/^\/(willkommen|anmelden|registrieren|s\/)/.test(window.location.pathname)) return;
      toast('Bereit für offline – Phonegames funktioniert jetzt auch ohne Internet ✈️');
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      registration = reg;
      // Back in the foreground, back online, and every 15 minutes while the app is visible.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
      window.addEventListener('online', () => void checkForUpdate());
      window.setInterval(() => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      }, CHECK_EVERY_MS);
    },
  });
}

export async function promptInstall(): Promise<boolean> {
  const event = usePwa.getState().installEvent;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  usePwa.setState({ installEvent: null });
  return choice.outcome === 'accepted';
}
