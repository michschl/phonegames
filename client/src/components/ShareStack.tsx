import { useEffect, useState } from 'react';
import type { LearnShareInfo, LearnStack } from '../../../shared/types.ts';
import { api, errorMessage, shareUrl } from '../lib/api.ts';
import { haptic } from '../lib/device.ts';
import { sound } from '../lib/audio.ts';
import { toast, useUi } from '../store/ui.ts';
import { Icon } from './Icon.tsx';
import { Section } from './Layout.tsx';
import { Button, ConfirmSheet } from './ui.tsx';

/** Opens the phone's share menu, or copies the link where there is none. */
async function sendLink(stack: LearnStack, url: string): Promise<void> {
  const data = {
    title: `Lernstapel «${stack.title}»`,
    text: `${stack.cards.length} Lernkarten zum Repetieren mit Phonegames`,
    url,
  };
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // closed the share menu
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert – füge ihn in eine Nachricht ein.', { tone: 'success' });
  } catch {
    toast('Kopieren ging nicht – markiere den Link und kopiere ihn von Hand.');
  }
}

/** «Teilen» on the stack page: create the link, send it, update or end the sharing. */
export function ShareStack({ stack }: { stack: LearnStack }) {
  const online = useUi((s) => s.online);
  const [share, setShare] = useState<LearnShareInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    api
      .myShares()
      .then(({ shares }) => !cancelled && setShare(shares.find((s) => s.stackId === stack.id) ?? null))
      .catch(() => !cancelled && setShare(undefined));
    return () => {
      cancelled = true;
    };
  }, [online, stack.id]);

  const publish = async (): Promise<LearnShareInfo | null> => {
    setBusy(true);
    setError(null);
    try {
      const { share: saved } = await api.shareStack({
        stackId: stack.id,
        title: stack.title,
        subject: stack.subject,
        languages: stack.languages,
        cards: stack.cards,
        suggestedModes: stack.suggestedModes,
      });
      setShare(saved);
      return saved;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const shareNow = async () => {
    haptic(10);
    const current = share ?? (await publish());
    if (!current) return;
    sound.sparkle();
    await sendLink(stack, shareUrl(current.id));
  };

  const update = async () => {
    if (await publish()) {
      sound.coin();
      toast('Die geteilte Version ist aktuell.', { tone: 'success' });
    }
  };

  const stop = async () => {
    if (!share) return;
    try {
      await api.deleteShare(share.id);
      setShare(null);
      toast('Freigabe beendet – der Link funktioniert nicht mehr.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const outdated = !!share && stack.updatedAt > share.updatedAt;

  return (
    <Section title="Teilen">
      <div className="share-card">
        {!online ? (
          <p className="share-card__text">Zum Teilen brauchst du Internet.</p>
        ) : share === undefined ? (
          <p className="share-card__text">Einen Moment …</p>
        ) : share === null ? (
          <p className="share-card__text">
            Teile den Stapel per Link, zum Beispiel mit der Klasse. Wer den Link hat, übernimmt eine eigene Kopie – und kann
            damit auch ein Konto erstellen.
          </p>
        ) : (
          <>
            <p className="share-card__status">
              <Icon name="share" size={18} /> Geteilt
              {share.imports > 0 && ` · ${share.imports}× übernommen`}
              {share.signups > 0 && ` · ${share.signups} ${share.signups === 1 ? 'neues Konto' : 'neue Konten'}`}
            </p>
            <input className="share-card__link" readOnly value={shareUrl(share.id)} aria-label="Link zum Stapel" onFocus={(e) => e.target.select()} />
            {outdated && <p className="notice notice--warn">Du hast den Stapel seit dem Teilen geändert. Andere sehen noch die alte Version.</p>}
          </>
        )}
        {error && <p className="notice notice--error">{error}</p>}
        {online && share !== undefined && (
          <div className="share-card__actions">
            <Button icon="share" loading={busy && !share} onClick={() => void shareNow()}>
              {share ? 'Link senden' : 'Link teilen'}
            </Button>
            {outdated && (
              <Button variant="secondary" icon="refresh" loading={busy} onClick={() => void update()}>
                Geteilte Version aktualisieren
              </Button>
            )}
            {share && (
              <Button variant="ghost" icon="x" onClick={() => setConfirmStop(true)}>
                Freigabe beenden
              </Button>
            )}
          </div>
        )}
        <p className="share-card__hint">Teile nur eigene Notizen oder Inhalte, die du weitergeben darfst – keine ganzen Lehrmittelseiten.</p>
      </div>
      <ConfirmSheet
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title="Freigabe beenden?"
        message="Der Link funktioniert danach nicht mehr. Wer den Stapel schon übernommen hat, behält seine Kopie."
        confirmLabel="Beenden"
        danger
        onConfirm={() => {
          setConfirmStop(false);
          void stop();
        }}
      />
    </Section>
  );
}
