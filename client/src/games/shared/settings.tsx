import type { ReactNode } from 'react';
import { Segmented } from '../../components/ui.tsx';
import { haptic } from '../../lib/device.ts';

/** Labelled segmented control for settings panels. */
export function OptionRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="settings-panel__group">
      <span className="settings-panel__label">{label}</span>
      <Segmented
        label={label}
        value={String(value)}
        options={options.map((o) => ({ value: String(o.value), label: o.label, hint: o.hint }))}
        onChange={(v) => onChange(options.find((o) => String(o.value) === v)!.value)}
      />
      {hint && <p className="settings-panel__hint">{hint}</p>}
    </div>
  );
}

/** Multi-select chips (packs, categories). At least one stays selected. */
export function ChipSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string; emoji?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    haptic(6);
    const has = selected.includes(id);
    if (has && selected.length === 1) return;
    onChange(has ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="settings-panel__group">
      <span className="settings-panel__label">
        {label}{' '}
        <small>
          ({selected.length}/{options.length})
        </small>
      </span>
      <div className="chip-cloud">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              className={`chip ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              onClick={() => toggle(option.id)}
            >
              {option.emoji && <span aria-hidden="true">{option.emoji}</span>} {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPanel({ children }: { children: ReactNode }) {
  return <div className="settings-panel">{children}</div>;
}

/** Packs used by the conversation games. */
export const PACK_OPTIONS = [
  { id: 'familie', label: 'Familie', emoji: '👨‍👩‍👧' },
  { id: 'freunde', label: 'Freunde', emoji: '🙌' },
  { id: 'party', label: 'Party', emoji: '🎉' },
];
