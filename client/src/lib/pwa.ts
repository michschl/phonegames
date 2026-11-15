import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { toast } from '../store/ui.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  needRefresh: boolean;
  update: (() => Promise<void>) | null;
}

export const usePwa = create<PwaState>(() => ({ installEvent: null, needRefresh: false, update: null }));

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    usePwa.setState({ installEvent: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    usePwa.setState({ installEvent: null });
    toast('Plausch ist jetzt auf deinem Startbildschirm 🎉');
  });

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      usePwa.setState({ needRefresh: true, update: () => updateSW(true) });
      toast('Eine neue Version ist bereit.', {
        action: { label: 'Aktualisieren', onClick: () => void updateSW(true) },
        duration: 15_000,
      });
    },
    onOfflineReady() {
      toast('Bereit für offline – Plausch funktioniert jetzt auch ohne Internet ✈️');
    },
    onRegisteredSW(_url, registration) {
      // Check for updates every hour while the app is open.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
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
