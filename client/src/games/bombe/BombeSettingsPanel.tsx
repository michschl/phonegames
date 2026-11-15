import type { GameSettingsProps } from '../types.ts';
import { Segmented, Toggle } from '../../components/ui.tsx';
import { haptic } from '../../lib/device.ts';
import { DURATIONS, type BombeSettings, type DurationPreset } from './logic.ts';
import { CATEGORIES } from './questions.ts';

export function BombeSettingsPanel({ value, onChange }: GameSettingsProps<BombeSettings>) {
  const toggleCategory = (id: string) => {
    haptic(6);
    const has = value.categories.includes(id);
    // At least one category must stay selected.
    if (has && value.categories.length === 1) return;
    onChange({
      ...value,
      categories: has ? value.categories.filter((c) => c !== id) : [...value.categories, id],
    });
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel__group">
        <span className="settings-panel__label">Zünddauer</span>
        <Segmented<DurationPreset>
          label="Zünddauer"
          value={value.duration}
          onChange={(duration) => onChange({ ...value, duration })}
          options={(Object.keys(DURATIONS) as DurationPreset[]).map((key) => ({
            value: key,
            label: DURATIONS[key].label,
            hint: DURATIONS[key].hint,
          }))}
        />
        <p className="settings-panel__hint">Die genaue Zeit bleibt geheim – das ist ja der Witz.</p>
      </div>

      <Toggle
        label="Ticken wird schneller"
        description="Gegen Ende tickt die Bombe immer hektischer."
        checked={value.accelerate}
        onChange={(accelerate) => onChange({ ...value, accelerate })}
      />

      <div className="settings-panel__group">
        <span className="settings-panel__label">
          Kategorien <small>({value.categories.length}/{CATEGORIES.length})</small>
        </span>
        <div className="chip-cloud">
          {CATEGORIES.map((category) => {
            const active = value.categories.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                className={`chip ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleCategory(category.id)}
              >
                <span aria-hidden="true">{category.emoji}</span> {category.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
