import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { applyUpdate, isSafeToReload, usePwa } from '../lib/pwa.ts';
import { Icon } from './Icon.tsx';

const IN_GAME = /^\/spiel\/[^/]+\/los/;

/**
 * Loads a waiting new version at the next safe moment – after a page change or when the app
 * comes back to the foreground – so nobody has to close and reopen the app for it.
 */
export function useAutoUpdate(): void {
  const { pathname } = useLocation();
  const needRefresh = usePwa((s) => s.needRefresh);
  const firstPage = useRef(true);

  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    if (usePwa.getState().needRefresh && isSafeToReload(pathname)) applyUpdate();
  }, [pathname]);

  useEffect(() => {
    if (!needRefresh) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isSafeToReload(window.location.pathname)) applyUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [needRefresh]);
}

/** Lasting hint at the top while a new version waits (not during a game). */
export function UpdateHint() {
  const show = usePwa((s) => s.needRefresh && !s.hintDismissed);
  const { pathname } = useLocation();
  if (!show || IN_GAME.test(pathname)) return null;
  return (
    <div className="toast toast--info toast--update">
      <span className="toast__message">✨ Neue Version ist da</span>
      <button type="button" className="toast__action" onClick={applyUpdate}>
        Jetzt laden
      </button>
      <button type="button" className="toast__close" aria-label="Später laden" onClick={() => usePwa.setState({ hintDismissed: true })}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
