import type { ReactNode } from 'react';
import { sound } from '../lib/audio.ts';
import { Icon, type IconName } from './Icon.tsx';

/**
 * Card that starts collapsed and opens on tap (native <details>, so it works
 * with the keyboard and screen readers). Used for rules and settings.
 */
export function Fold({
  title,
  icon,
  meta,
  className = '',
  children,
}: {
  title: string;
  icon: IconName;
  /** Short info next to the title, e.g. «4 Schritte» or «Angepasst». */
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={`fold ${className}`} onToggle={() => sound.tap()}>
      <summary>
        <Icon name={icon} size={18} />
        <span className="fold__title">{title}</span>
        {meta && <span className="fold__meta">{meta}</span>}
      </summary>
      <div className="fold__body">{children}</div>
    </details>
  );
}
