import { useEffect, useState } from 'react';
import { sound } from '../lib/audio.ts';
import { useAuthOptions } from '../lib/authOptions.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { createPasskey, deviceCanUsePasskeys, PasskeyCancelled, preparePasskey } from '../lib/passkeys.ts';
import { updateProfile } from '../lib/session.ts';
import { useAuth } from '../store/auth.ts';
import { useSettings } from '../store/settings.ts';
import { toast, useUi } from '../store/ui.ts';
import { Icon } from './Icon.tsx';
import { Button } from './ui.tsx';

/**
 * Invitation on the home screen to set up a passkey. Shown once the user is
 * signed in and the device supports Face ID / fingerprint / PIN, until a
 * passkey exists or the user dismisses it – then it stays away for good
 * (remembered on the account, so on every device).
 */
export function PasskeyHint() {
  const user = useAuth((s) => s.user)!;
  const options = useAuthOptions();
  const online = useUi((s) => s.online);
  const hintKey = `passkey:${user.id}`;
  const dismissedHere = useSettings((s) => s.dismissedHints.includes(hintKey));
  const dismissHint = useSettings((s) => s.dismissHint);
  const [capable, setCapable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    void deviceCanUsePasskeys().then(setCapable);
  }, []);

  // Dismissed while offline: tell the server as soon as possible.
  useEffect(() => {
    if (dismissedHere && user.passkeyHintDismissed === false && online) {
      void updateProfile({ passkeyHintDismissed: true }).catch(() => undefined);
    }
  }, [dismissedHere, user.passkeyHintDismissed, online]);

  const visible = capable && !!options?.passkeys && !(user.passkeys > 0) && !user.passkeyHintDismissed && !dismissedHere;

  useEffect(() => {
    if (visible && online) preparePasskey();
  }, [visible, online]);

  if (!visible) return null;

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    sound.unpluck();
    window.setTimeout(() => dismissHint(hintKey), 260);
    if (online) void updateProfile({ passkeyHintDismissed: true }).catch(() => undefined);
    toast('Alles klar – Passkeys findest du jederzeit unter Konto.');
  };

  const setup = async () => {
    setBusy(true);
    try {
      await createPasskey();
      sound.fanfare();
      haptic([20, 40, 20]);
      confetti({ count: 160 });
      toast('Passkey eingerichtet! Ab jetzt reicht dein Gesicht, Finger oder deine PIN. 🔑', { tone: 'success' });
    } catch (error) {
      if (!(error instanceof PasskeyCancelled)) toast((error as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
      preparePasskey();
    }
  };

  return (
    <section className={`passkey-hint ${leaving ? 'is-leaving' : ''}`} aria-labelledby="passkey-hint-title">
      <button type="button" className="passkey-hint__close" aria-label="Hinweis schliessen und nicht mehr anzeigen" onClick={dismiss}>
        <Icon name="x" size={18} strokeWidth={2.6} />
      </button>
      <span className="passkey-hint__badge" aria-hidden="true">
        🔑
      </span>
      <h2 id="passkey-hint-title" className="passkey-hint__title">
        Schneller rein mit Passkey
      </h2>
      <p className="passkey-hint__text">
        Melde dich mit Face ID, Fingerabdruck oder Geräte-PIN an – ganz ohne Passwort. Und sicherer ist es auch.
      </p>
      <div className="passkey-hint__actions">
        <Button icon="key" loading={busy} disabled={!online} onClick={() => void setup()}>
          Passkey einrichten
        </Button>
        <button type="button" className="passkey-hint__later" onClick={dismiss}>
          Nicht mehr anzeigen
        </button>
      </div>
      {!online && <p className="passkey-hint__offline">Zum Einrichten brauchst du Internet.</p>}
    </section>
  );
}
