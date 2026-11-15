import { useCallback, useEffect, useState } from 'react';
import type { PasskeyInfo } from '../../../shared/types.ts';
import { api, errorMessage } from '../lib/api.ts';
import { sound } from '../lib/audio.ts';
import { useAuthOptions } from '../lib/authOptions.ts';
import { confetti } from '../lib/confetti.ts';
import { createPasskey, deletePasskey, PasskeyCancelled, passkeysSupported, preparePasskey } from '../lib/passkeys.ts';
import { toast, useUi } from '../store/ui.ts';
import { Icon } from './Icon.tsx';
import { Section } from './Layout.tsx';
import { ConfirmSheet } from './ui.tsx';

const DATE = new Intl.DateTimeFormat('de-CH', { day: 'numeric', month: 'short', year: 'numeric' });

function describe(passkey: PasskeyInfo): string {
  const parts = [passkey.synced ? 'Synchronisiert' : 'Nur dieses Gerät', `seit ${DATE.format(passkey.createdAt)}`];
  if (passkey.lastUsedAt) parts.push(`zuletzt ${DATE.format(passkey.lastUsedAt)}`);
  return parts.join(' · ');
}

/** «Passkeys» section on the account page: list, add and delete passkeys. */
export function PasskeySettings() {
  const options = useAuthOptions();
  const online = useUi((s) => s.online);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [userHandle, setUserHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PasskeyInfo | null>(null);

  const load = useCallback(() => {
    api
      .passkeys()
      .then((res) => {
        setPasskeys(res.passkeys);
        setUserHandle(res.userHandle);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!options?.passkeys || !online) return;
    load();
    if (passkeysSupported()) preparePasskey();
  }, [options?.passkeys, online, load]);

  if (!options?.passkeys) return null;

  const add = async () => {
    setBusy(true);
    try {
      const passkey = await createPasskey();
      setPasskeys((list) => [...(list ?? []), passkey]);
      sound.fanfare();
      confetti({ count: 120 });
      toast('Passkey eingerichtet! 🔑', { tone: 'success' });
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
      preparePasskey();
    }
  };

  const remove = async (passkey: PasskeyInfo) => {
    setToDelete(null);
    try {
      await deletePasskey(passkey.id, userHandle);
      setPasskeys((list) => (list ?? []).filter((p) => p.id !== passkey.id));
      sound.unpluck();
      toast('Passkey gelöscht.');
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  return (
    <Section title="Passkeys">
      <p className="section-note">
        Mit einem Passkey meldest du dich per Face ID, Fingerabdruck oder Geräte-PIN an – ohne Passwort. Dein Passwort
        funktioniert weiterhin.
      </p>
      <div className="list">
        {passkeys?.map((passkey) => (
          <div key={passkey.id} className="list__item passkey-row">
            <span className="passkey-row__icon" aria-hidden="true">
              <Icon name="key" size={20} />
            </span>
            <span className="list__label passkey-row__text">
              <strong>{passkey.name}</strong>
              <small>{describe(passkey)}</small>
            </span>
            <button
              type="button"
              className="passkey-row__delete"
              aria-label={`${passkey.name} löschen`}
              disabled={!online}
              onClick={() => setToDelete(passkey)}
            >
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
        {passkeys?.length === 0 && <p className="list__item list__empty">Noch kein Passkey eingerichtet.</p>}
        {!online && passkeys === null && <p className="list__item list__empty">Offline – Passkeys werden geladen, sobald du online bist.</p>}
        {error && <p className="list__item list__empty">{error}</p>}
        {passkeysSupported() ? (
          <button type="button" className="list__item" disabled={!online || busy} onClick={() => void add()}>
            <Icon name={busy ? 'refresh' : 'plus'} />
            <span className="list__label">{busy ? 'Einen Moment …' : 'Passkey hinzufügen'}</span>
            <Icon name="next" size={18} />
          </button>
        ) : (
          <p className="list__item list__empty">Dieser Browser unterstützt keine Passkeys.</p>
        )}
      </div>
      <ConfirmSheet
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
        title="Passkey löschen?"
        message={`«${toDelete?.name ?? ''}» kann danach nicht mehr zum Anmelden verwendet werden. Du kannst jederzeit einen neuen einrichten.`}
        confirmLabel="Löschen"
        danger
      />
    </Section>
  );
}
