import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { ChipSelect, OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DECKS } from './decks.ts';
import type { WerBinIchSettings } from './WerBinIchGame.tsx';

const DEFAULTS: WerBinIchSettings = {
  decks: ['tiere', 'essen', 'berufe', 'figuren', 'schweiz'],
  seconds: 60,
  control: 'tilt',
};

function WerBinIchSettingsPanel({ value, onChange }: GameSettingsProps<WerBinIchSettings>) {
  return (
    <SettingsPanel>
      <ChipSelect
        label="Themen"
        options={DECKS.map((d) => ({ id: d.id, label: d.name, emoji: d.emoji }))}
        selected={value.decks}
        onChange={(decks) => onChange({ ...value, decks })}
      />
      <OptionRow
        label="Zeit pro Person"
        value={value.seconds}
        options={[60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))}
        onChange={(seconds) => onChange({ ...value, seconds })}
      />
      <OptionRow
        label="Steuerung"
        value={value.control}
        options={[
          { value: 'tilt', label: 'Kippen', hint: 'Bewegungssensor' },
          { value: 'tap', label: 'Tippen', hint: 'links / rechts' },
        ]}
        onChange={(control) => onChange({ ...value, control })}
      />
    </SettingsPanel>
  );
}

export const werBinIch: GameDefinition<WerBinIchSettings> = {
  id: 'wer-bin-ich',
  name: 'Wer bin ich?',
  tagline: 'Handy an die Stirn und los',
  description:
    'Halte das Handy an die Stirn, deine Freunde erklären den Begriff. Nach vorne kippen = erraten, nach hinten = passen. ' +
    'Wie viele schaffst du in 60 Sekunden?',
  emoji: '🤔',
  colors: ['#3ddc97', '#2de2e6'],
  minPlayers: 2,
  maxPlayers: 16,
  duration: '10–30 Min.',
  age: 'ab 8 J.',
  tags: ['Raten', 'Schnell', 'Bewegung'],
  status: 'available',
  rules: [
    'Wer dran ist, hält das Handy hochkant an die Stirn – das Display zeigt zu den anderen.',
    'Die anderen erklären den Begriff, ohne ihn zu nennen.',
    'Erraten: Handy nach vorne kippen. Passen: nach hinten kippen. (Oder tippen: rechts/links.)',
    'Jeder erratene Begriff gibt einen Punkt.',
  ],
  defaultSettings: DEFAULTS,
  Settings: WerBinIchSettingsPanel,
  Play: lazy(() => import('./WerBinIchGame.tsx')),
};
