import type { GameSettingsProps } from '../types.ts';
import { ChipSelect, PACK_OPTIONS, SettingsPanel } from './settings.tsx';

export interface PackSettings {
  packs: string[];
}

export const DEFAULT_PACKS: PackSettings = { packs: ['familie', 'freunde'] };

export function PackSettingsPanel({ value, onChange }: GameSettingsProps<PackSettings>) {
  return (
    <SettingsPanel>
      <ChipSelect label="Kartenpakete" options={PACK_OPTIONS} selected={value.packs} onChange={(packs) => onChange({ ...value, packs })} />
      <p className="settings-panel__hint">«Party» ist frecher – für Runden, die sich gut kennen.</p>
    </SettingsPanel>
  );
}

export function filterPacks<T extends { pack: string }>(cards: T[], packs: string[]): T[] {
  const filtered = cards.filter((c) => packs.includes(c.pack));
  return filtered.length > 0 ? filtered : cards;
}
