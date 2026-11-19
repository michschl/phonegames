import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { LearnSharePreview } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Icon } from '../components/Icon.tsx';
import { Button } from '../components/ui.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { subjectEmoji } from '../lib/learn.ts';
import { useAuth } from '../store/auth.ts';
import { useData } from '../store/data.ts';
import { toast, useUi } from '../store/ui.ts';

type State = { kind: 'loading' } | { kind: 'error'; message: string; gone: boolean } | { kind: 'ready'; preview: LearnSharePreview };

/**
 * A shared learning stack (`/s/:shareId`). Signed in: take over a copy.
 * Not signed in: preview and the way to an account – the link counts as invitation.
 */
export function SharePage() {
  const { shareId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const online = useUi((s) => s.online);
  const saveStack = useData((s) => s.saveStack);
  const addGame = useData((s) => s.addGame);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [importing, setImporting] = useState(false);
  const autoImported = useRef(false);

  useEffect(() => {
    if (!online) {
      setState({ kind: 'error', message: 'Für geteilte Stapel brauchst du Internet.', gone: false });
      return;
    }
    let cancelled = false;
    api
      .sharePreview(shareId)
      .then((preview) => !cancelled && setState({ kind: 'ready', preview }))
      .catch(
        (err) =>
          !cancelled &&
          setState({
            kind: 'error',
            message: errorMessage(err),
            gone: err instanceof ApiError && (err.status === 404 || err.status === 400),
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [shareId, online]);

  const takeOver = async () => {
    setImporting(true);
    try {
      const { stack } = await api.importShare(shareId);
      const saved = saveStack({ ...stack, source: 'shared' });
      addGame('spickzettel');
      sound.fanfare();
      confetti({ count: 120 });
      toast(`«${saved.title}» ist jetzt in deinen Lernstapeln 🎉`, { tone: 'success' });
      navigate(`/lernen/${saved.id}`, { replace: true, viewTransition: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setImporting(false);
    }
  };

  // Coming back from registering or signing in through the link: take it over right away.
  useEffect(() => {
    if (user && state.kind === 'ready' && params.get('uebernehmen') === '1' && !autoImported.current) {
      autoImported.current = true;
      void takeOver();
    }
  }, [user, state.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="auth share-page">
      <Link to={user ? '/' : '/willkommen'} className="icon-btn auth__back" viewTransition aria-label="Zurück">
        <Icon name="back" />
      </Link>
      <div className="auth__card">
        <span className="auth__mascot">
          <Mascot size={96} mood={state.kind === 'error' ? 'oops' : 'party'} />
        </span>

        {state.kind === 'loading' && (
          <p className="auth__subtitle" role="status">
            Einen Moment …
          </p>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="auth__title">{state.gone ? 'Link nicht mehr gültig' : 'Das hat nicht geklappt'}</h1>
            <p className="auth__subtitle">{state.message}</p>
            <Link to={user ? '/' : '/willkommen'} className="btn btn--secondary btn--lg btn--block" viewTransition>
              <span>Zu Phonegames</span>
            </Link>
          </>
        )}

        {state.kind === 'ready' && (
          <>
            <p className="share-page__eyebrow">Geteilter Lernstapel</p>
            <h1 className="auth__title">{state.preview.title}</h1>
            <p className="share-page__meta">
              <span aria-hidden="true">{subjectEmoji(state.preview.subject)}</span>
              {state.preview.subject && <span>{state.preview.subject}</span>}
              <span>
                {state.preview.cardCount} {state.preview.cardCount === 1 ? 'Karte' : 'Karten'}
              </span>
            </p>
            <ul className="share-page__sample" aria-label="Beispielkarten">
              {state.preview.sample.map((card, i) => (
                <li key={i}>
                  <strong>{card.prompt}</strong>
                  <span>{card.answer}</span>
                </li>
              ))}
              {state.preview.cardCount > state.preview.sample.length && (
                <li className="share-page__more">und {state.preview.cardCount - state.preview.sample.length} weitere …</li>
              )}
            </ul>

            {user ? (
              <div className="share-page__actions">
                <Button size="lg" block icon="plus" loading={importing} onClick={() => void takeOver()}>
                  In meine Stapel übernehmen
                </Button>
                <p className="share-page__hint">Du bekommst eine eigene Kopie – mit deinem eigenen Lernstand.</p>
              </div>
            ) : (
              <div className="share-page__actions">
                <p className="share-page__hint">
                  Lerne die Karten mit dem Kartenkasten oder in der Blitzrunde – mit einem kostenlosen Konto bei Phonegames.
                  {state.preview.invites && ' Du brauchst keinen Einladungscode.'}
                </p>
                <Link to={`/registrieren?teilen=${encodeURIComponent(shareId)}`} className="btn btn--primary btn--lg btn--block" viewTransition>
                  <span>Konto erstellen & übernehmen</span>
                </Link>
                <Link to={`/anmelden?teilen=${encodeURIComponent(shareId)}`} className="btn btn--secondary btn--lg btn--block" viewTransition>
                  <span>Ich habe schon ein Konto</span>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
