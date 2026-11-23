import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate, useNavigationType } from 'react-router';
import { Icon, type IconName } from './Icon.tsx';
import { haptic } from '../lib/device.ts';
import { nextMove } from '../lib/transition.ts';
import { useData } from '../store/data.ts';
import { useDueTotal } from '../store/learners.ts';
import { useSettings } from '../store/settings.ts';
import { dismissToast, useUi } from '../store/ui.ts';

type ShapeKind = 'star' | 'squiggle' | 'ring' | 'triangle' | 'plus' | 'dot';

/* Where each shape sits and how it drifts is in global.css (.backdrop__shape--…): in the page margins, never under the text. */
const SHAPES: { kind: ShapeKind; color: string }[] = [
  { kind: 'star', color: '#ffd23f' },
  { kind: 'squiggle', color: '#ff4fa3' },
  { kind: 'ring', color: '#2ec5ff' },
  { kind: 'triangle', color: '#9be15d' },
  { kind: 'plus', color: '#7c5cff' },
  { kind: 'dot', color: '#ff8a3d' },
];

/** The part of the app a path belongs to – it gives the page its accent colour (the colour of its tab). */
export function areaOf(pathname: string): 'spiele' | 'lernen' | 'entdecken' | 'gruppen' | 'konto' {
  if (/^\/(lernen|stapel|aufgaben|s)(\/|$)/.test(pathname)) return 'lernen';
  if (pathname.startsWith('/entdecken')) return 'entdecken';
  if (pathname.startsWith('/gruppen')) return 'gruppen';
  if (/^\/(konto|belohnungen|abo|bedingungen|impressum|agb|datenschutz)(\/|$)/.test(pathname)) return 'konto';
  return 'spiele';
}

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

/** Playful floating shapes behind everything, tinted in the colour of the area. */
export function Backdrop() {
  const { pathname } = useLocation();
  const area = areaOf(pathname);
  // On the root element, so sheets and toasts (rendered outside the page) get the accent too.
  useEffect(() => {
    document.documentElement.dataset.area = area;
  }, [area]);
  return (
    <div className="backdrop" aria-hidden="true">
      {SHAPES.map((shape) => (
        <span key={shape.kind} className={`backdrop__shape backdrop__shape--${shape.kind}`}>
          <Shape kind={shape.kind} color={shape.color} />
        </span>
      ))}
    </div>
  );
}

const TABS: { to: string; label: string; icon: IconName; color: string }[] = [
  { to: '/', label: 'Spiele', icon: 'games', color: '#ff4fa3' },
  { to: '/lernen', label: 'Lernen', icon: 'cards', color: '#ff8a3d' },
  { to: '/entdecken', label: 'Entdecken', icon: 'compass', color: '#ffd23f' },
  { to: '/gruppen', label: 'Gruppen', icon: 'users', color: '#2ec5ff' },
  { to: '/konto', label: 'Konto', icon: 'user', color: '#9be15d' },
];

export function TabBar() {
  const { pathname } = useLocation();
  // «Lernen» opens the area used last: Karten or Aufgaben.
  const learnArea = useSettings((s) => s.learnArea);
  // «Spiele» opens the area used last: together or alone.
  const playArea = useSettings((s) => s.playArea);
  // Cards to repeat today – shown as a red badge on «Lernen».
  const due = useDueTotal();
  const active = Math.max(
    0,
    TABS.findIndex((tab) =>
      tab.to === '/' ? pathname === '/' || pathname.startsWith('/allein') || pathname.startsWith('/arena') : pathname.startsWith(tab.to),
    ),
  );
  const arenaShown = useData((s) => s.rewards?.arena !== false);
  const target = (to: string) =>
    to === '/lernen' && learnArea === 'aufgaben'
      ? '/lernen/aufgaben'
      : to === '/' && playArea === 'allein'
        ? '/allein'
        : to === '/' && playArea === 'arena' && arenaShown
          ? '/arena'
          : to;
  return (
    <nav
      className="tabbar"
      aria-label="Hauptnavigation"
      style={{ '--index': active, '--tabs': TABS.length, '--tab-color': TABS[active]!.color } as CSSProperties}
    >
      <span className="tabbar__pill" aria-hidden="true" />
      {TABS.map((tab, i) => (
        <NavLink
          key={tab.to}
          to={target(tab.to)}
          end={tab.to === '/'}
          aria-label={tab.to === '/lernen' && due > 0 ? `${tab.label}, ${due} ${due === 1 ? 'Karte' : 'Karten'} fällig` : undefined}
          className="tabbar__item"
          onClick={() => {
            haptic(6);
            // The page comes from the side of its tab.
            if (i !== active) nextMove(i > active ? 'right' : 'left');
          }}
          viewTransition
        >
          <span className="tabbar__icon">
            <Icon name={tab.icon} size={23} />
            {tab.to === '/lernen' && due > 0 && (
              <span className="tabbar__badge" aria-hidden="true">
                {due > 99 ? '99+' : due}
              </span>
            )}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/*
 * The pages visited in this tab, by their place in the browser's history. With it «Zurück» really goes back
 * when the page it leads to is the one before – and that page is where it was left (same scroll position),
 * instead of opening anew at its top.
 */
const trail: string[] = [];
const historyIndex = (): number | null => {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : null;
};

/** Keeps the trail; once, at the root of the app. */
export function useTrail(): void {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    const idx = historyIndex();
    if (idx === null) return;
    trail[idx] = location.pathname + location.search;
    // A new page replaces what lay ahead.
    if (type === 'PUSH') trail.length = idx + 1;
  }, [location, type]);
}

/** Standard page with a sticky header. */
/** Length of the longest word – a long one («Französisch», «Bruchrechnen») needs a smaller title to fit unbroken. */
function longestWord(text: string): number {
  return Math.max(0, ...text.replace(/\u00ad/g, '').split(/[\s/–-]+/).map((w) => w.length));
}

export function Page({
  title,
  subtitle,
  back,
  actions,
  nav,
  children,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  /** The switch between the areas of a tab. It sits right under the title – at the same place in every area – and the subtitle follows it. */
  nav?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const header = useRef<HTMLElement>(null);
  // Once the header (with its back button) scrolls away, a floating back button takes over.
  const [headerHidden, setHeaderHidden] = useState(false);

  useEffect(() => {
    if (!back || !header.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setHeaderHidden(!entry!.isIntersecting), { threshold: 0 });
    observer.observe(header.current);
    return () => observer.disconnect();
  }, [back]);

  const goBack = () => {
    haptic(6);
    const idx = historyIndex();
    nextMove('back');
    if (back === true || (back && idx !== null && idx > 0 && trail[idx - 1] === back)) navigate(-1);
    else if (back) navigate(back, { viewTransition: true });
  };

  return (
    <main className={`page ${className}`}>
      {back && headerHidden && (
        <button type="button" className="page__float-back" aria-label="Zurück" onClick={goBack}>
          <Icon name="back" size={20} />
          {typeof title === 'string' && <span>{title}</span>}
        </button>
      )}
      <header className="page__header" ref={header}>
        {back && (
          <button type="button" className="icon-btn page__back" aria-label="Zurück" onClick={goBack}>
            <Icon name="back" />
          </button>
        )}
        <div className="page__titles">
          <h1 className={`page__title${typeof title === 'string' && longestWord(title) > 11 ? ' is-long' : ''}`}>
            {back ? title : <span className="page__title-mark">{title}</span>}
          </h1>
          {subtitle && !nav && <p className="page__subtitle">{subtitle}</p>}
        </div>
        <div className="page__actions">
          <OfflinePill />
          {actions}
        </div>
      </header>
      {nav && <div className="page__nav">{nav}</div>}
      <div className="page__content">
        {subtitle && nav && <p className="page__subtitle page__lead">{subtitle}</p>}
        {children}
      </div>
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

/** Notices at the top; `before` shows lasting ones first (e.g. the update hint). */
export function Toaster({ before }: { before?: ReactNode }) {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {before}
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

/**
 * Action bar pinned to the bottom of the screen («Spiel starten», «Speichern»).
 * Rendered straight into <body>: inside the page, an entrance animation or a view
 * transition gives an ancestor a transform, and Safari then lets the «fixed» bar
 * scroll along with the content.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  return createPortal(<div className="start-bar">{children}</div>, document.body);
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
