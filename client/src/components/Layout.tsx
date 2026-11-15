import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';
import { haptic } from '../lib/device.ts';
import { dismissToast, useUi } from '../store/ui.ts';

type ShapeKind = 'star' | 'squiggle' | 'ring' | 'triangle' | 'plus' | 'dot';

const SHAPES: { kind: ShapeKind; color: string; style: Record<string, string> }[] = [
  { kind: 'star', color: '#ffd23f', style: { top: '7%', left: '-18px', '--s': '62px', '--d': '17s', '--dx': '18px', '--dy': '26px', '--r': '40deg' } },
  { kind: 'squiggle', color: '#ff4fa3', style: { top: '19%', right: '-26px', '--s': '96px', '--d': '21s', '--dx': '-14px', '--dy': '22px', '--r': '-18deg' } },
  { kind: 'ring', color: '#2ec5ff', style: { bottom: '22%', left: '-24px', '--s': '74px', '--d': '19s', '--dx': '22px', '--dy': '-18px', '--r': '60deg' } },
  { kind: 'triangle', color: '#9be15d', style: { bottom: '9%', right: '6%', '--s': '46px', '--d': '15s', '--dx': '-20px', '--dy': '-24px', '--r': '-50deg', '--delay': '-4s' } },
  { kind: 'plus', color: '#7c5cff', style: { top: '52%', right: '-6px', '--s': '38px', '--d': '14s', '--dx': '-16px', '--dy': '20px', '--r': '90deg' } },
  { kind: 'dot', color: '#ff8a3d', style: { top: '38%', left: '5%', '--s': '18px', '--d': '12s', '--dx': '14px', '--dy': '-16px' } },
];

function Shape({ kind, color }: { kind: ShapeKind; color: string }) {
  const ink = { stroke: '#1b1033', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%">
      {kind === 'star' && <path d="M30 4l7 16 17 3-12 12 3 17-15-8-15 8 3-17L6 23l17-3z" fill={color} {...ink} />}
      {kind === 'squiggle' && (
        <path d="M4 36c8-16 14 16 22 0s14 16 22 0" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      )}
      {kind === 'ring' && <circle cx="30" cy="30" r="20" fill="none" stroke={color} strokeWidth={9} />}
      {kind === 'triangle' && <path d="M30 6l24 44H6z" fill={color} {...ink} />}
      {kind === 'plus' && <path d="M24 6h12v18h18v12H36v18H24V36H6V24h18z" fill={color} {...ink} />}
      {kind === 'dot' && <circle cx="30" cy="30" r="24" fill={color} {...ink} strokeWidth={6} />}
    </svg>
  );
}

/** Playful floating shapes behind everything. */
export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      {SHAPES.map((shape, i) => (
        <span key={i} className="backdrop__shape" style={shape.style as CSSProperties}>
          <Shape kind={shape.kind} color={shape.color} />
        </span>
      ))}
    </div>
  );
}

const TABS: { to: string; label: string; icon: IconName; color: string }[] = [
  { to: '/', label: 'Spiele', icon: 'games', color: '#ff4fa3' },
  { to: '/entdecken', label: 'Entdecken', icon: 'compass', color: '#ffd23f' },
  { to: '/gruppen', label: 'Gruppen', icon: 'users', color: '#2ec5ff' },
  { to: '/konto', label: 'Konto', icon: 'user', color: '#9be15d' },
];

export function TabBar() {
  const { pathname } = useLocation();
  const active = Math.max(
    0,
    TABS.findIndex((tab) => (tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to))),
  );
  return (
    <nav
      className="tabbar"
      aria-label="Hauptnavigation"
      style={{ '--index': active, '--tab-color': TABS[active]!.color } as CSSProperties}
    >
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
