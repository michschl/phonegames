import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon.tsx';
import { Mascot, type Mood } from './Brand.tsx';
import { haptic } from '../lib/device.ts';
import { initials } from '../lib/util.ts';

/* ---------------------------------------------------------------- Button */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  icon,
  children,
  className = '',
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${loading ? 'is-loading' : ''} ${className}`}
      disabled={disabled || loading}
      onClick={(event) => {
        haptic(8);
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  onClick,
  ...rest
}: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      onClick={(event) => {
        haptic(6);
        onClick?.(event);
      }}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

/* ------------------------------------------------------------- TextField */

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
}

export function TextField({ label, error, hint, icon, type = 'text', className = '', ...rest }: TextFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="field__control">
        {icon && (
          <span className="field__icon">
            <Icon name={icon} size={19} />
          </span>
        )}
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="field__toggle"
            aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
            onClick={() => setVisible((v) => !v)}
          >
            <Icon name={visible ? 'eye-off' : 'eye'} size={19} />
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-msg`} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Sheet */

/** Bottom sheet dialog with enter/exit animation. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; pointerId: number } | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) setMounted(true);
    else if (mounted) {
      const t = window.setTimeout(() => setMounted(false), 260);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Swipe down on the handle / title area to close – the visible ✕ does the same.
  const onDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) setDragY(Math.max(0, event.clientY - drag.current.startY));
  };
  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragY > 90) onClose();
    setDragY(0);
  };

  if (!mounted) return null;
  return createPortal(
    <div className={`sheet ${open ? 'is-open' : 'is-closing'}`}>
      <div className="sheet__backdrop" onClick={onClose} />
      <div
        className="sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__grip"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="sheet__handle" />
          {title && (
            <h2 id={titleId} className="sheet__title">
              {title}
            </h2>
          )}
        </div>
        <button type="button" className="sheet__close" aria-label="Schliessen" onClick={onClose}>
          <Icon name="x" size={18} strokeWidth={2.6} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  danger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {message && <p className="sheet__text">{message}</p>}
      {children}
      <div className="sheet__actions">
        <Button variant={danger ? 'danger' : 'primary'} block size="lg" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          Abbrechen
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- Avatar */

export function Avatar({
  name,
  color,
  emoji,
  size = 40,
  className = '',
}: {
  name: string;
  color: string;
  emoji?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: emoji ? size * 0.52 : size * 0.38, '--c': color } as CSSProperties}
      aria-hidden="true"
    >
      {emoji ?? initials(name)}
    </span>
  );
}

export function AvatarStack({ players, max = 5 }: { players: { id: string; name: string; color: string }[]; max?: number }) {
  const shown = players.slice(0, max);
  const rest = players.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} size={30} />
      ))}
      {rest > 0 && <span className="avatar avatar--more">+{rest}</span>}
    </span>
  );
}

/* ------------------------------------------------- Toggle & Segmented */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {description && <span className="toggle-row__desc">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        onChange={(e) => {
          haptic(8);
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ '--count': options.length, '--index': index } as CSSProperties}
    >
      <span className="segmented__pill" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'is-active' : ''}
          onClick={() => {
            haptic(6);
            onChange(option.value);
          }}
        >
          <span className="segmented__label">{option.label}</span>
          {option.hint && <span className="segmented__hint">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  emoji,
  mascot,
  title,
  text,
  action,
  level = 2,
}: {
  emoji: string;
  /** Show Phoni with this mood instead of the emoji. */
  mascot?: Mood;
  title: string;
  text: string;
  action?: ReactNode;
  /** Heading level — use 1 when the empty state is the whole page. */
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="empty">
      {mascot ? (
        <Mascot size={130} mood={mascot} />
      ) : (
        <div className="empty__emoji" aria-hidden="true">
          {emoji}
        </div>
      )}
      <Heading className="empty__title">{title}</Heading>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  );
}
