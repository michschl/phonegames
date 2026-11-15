import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { ChipSelect, OptionRow, SettingsPanel } from '../shared/settings.tsx';
import type { ZeichnenSettings } from './ZeichnenGame.tsx';

function Settings({ value, onChange }: GameSettingsProps<ZeichnenSettings>) {
  return (
    <SettingsPanel>
      <ChipSelect
        label="Schwierigkeit"
        options={[
          { id: '1', label: 'Leicht', emoji: '★' },
          { id: '2', label: 'Mittel', emoji: '★★' },
          { id: '3', label: 'Schwer', emoji: '★★★' },
        ]}
        selected={value.difficulties}
        onChange={(difficulties) => onChange({ ...value, difficulties })}
      />
      <OptionRow
        label="Zeit zum Zeichnen"
        value={value.seconds}
        options={[60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))}
        onChange={(seconds) => onChange({ ...value, seconds })}
      />
    </SettingsPanel>
  );
}

export const zeichnen: GameDefinition<ZeichnenSettings> = {
  id: 'zeichnen',
  name: 'Zeichnen & Raten',
  tagline: 'Kritzeln, raten, lachen',
  description:
    'Eine Person zeichnet mit dem Finger direkt auf dem Handy, alle anderen rufen ihre Tipps. Wer zuerst richtig liegt, punktet – zusammen mit dem Künstler.',
  emoji: '🎨',
  colors: ['#3a86ff', '#2de2e6'],
  minPlayers: 3,
  maxPlayers: 16,
  duration: '15–40 Min.',
  age: 'ab 6 J.',
  tags: ['Kreativ', 'Raten', 'Familie'],
  status: 'available',
  rules: [
    'Wer zeichnet, sieht geheim einen Begriff und zeichnet ihn auf dem Handy – ohne Buchstaben und Zahlen.',
    'Alle anderen schauen zu und rufen ihre Tipps.',
    'Wird der Begriff erraten, tippt die zeichnende Person auf «Erraten!» und wählt, wer es war. Beide bekommen einen Punkt.',
  ],
  defaultSettings: { seconds: 90, difficulties: ['1', '2', '3'] },
  Settings,
  Play: lazy(() => import('./ZeichnenGame.tsx')),
};
