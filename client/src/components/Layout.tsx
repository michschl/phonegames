import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';
import { haptic } from '../lib/device.ts';
import { dismissToast, useUi } from '../store/ui.ts';

/** Animated colour blobs behind everything. */
export function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora__blob aurora__blob--1" />
      <span className="aurora__blob aurora__blob--2" />
      <span className="aurora__blob aurora__blob--3" />
      <span className="aurora__noise" />
    </div>
  );
}

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Spiele', icon: 'games' },
  { to: '/entdecken', label: 'Entdecken', icon: 'compass' },
  { to: '/gruppen', label: 'Gruppen', icon: 'users' },
  { to: '/konto', label: 'Konto', icon: 'user' },
];

export function TabBar() {
  const { pathname } = useLocation();
  const active = Math.max(
    0,
    TABS.findIndex((tab) => (tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to))),
  );
  return (
    <nav className="tabbar" aria-label="Hauptnavigation" style={{ '--index': active } as CSSProperties}>
      <span className="tabbar__pill" aria-hidden="true" />
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className="tabbar__item"
          onClick={() => haptic(6)}
          viewTransition
        >
          <Icon name={tab.icon} size={23} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Standard page with a sticky header. */
export function Page({
  title,
  subtitle,
  back,
  actions,
  children,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <main className={`page ${className}`}>
      <header className="page__header">
        {back && (
          <button
            type="button"
            className="icon-btn page__back"
            aria-label="Zurück"
            onClick={() => {
              haptic(6);
              if (back === true) navigate(-1);
              else navigate(back, { viewTransition: true });
            }}
          >
            <Icon name="back" />
          </button>
        )}
        <div className="page__titles">
          <h1 className="page__title">{title}</h1>
          {subtitle && <p className="page__subtitle">{subtitle}</p>}
        </div>
        <div className="page__actions">
          <OfflinePill />
          {actions}
        </div>
      </header>
      <div className="page__content">{children}</div>
    </main>
  );
}

export function OfflinePill() {
  const online = useUi((s) => s.online);
  if (online) return null;
  return (
    <span className="offline-pill" title="Du bist offline – alles wird lokal gespeichert und später synchronisiert.">
      <Icon name="offline" size={15} /> Offline
    </span>
  );
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span className="toast__message">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast__close" aria-label="Schliessen" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <h2 className="section__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
