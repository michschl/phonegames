import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { ChipSelect, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import type { SummRatenSettings } from './SummRatenGame.tsx';

// Duplicated here (instead of importing from the lazy game chunk) to keep the start screen small.
const CATEGORIES = [
  { id: 'kinder', label: 'Kinderlieder', emoji: '🧸' },
  { id: 'schweiz', label: 'Schweiz & Mundart', emoji: '🇨🇭' },
  { id: 'weihnachten', label: 'Weihnachten', emoji: '🎄' },
  { id: 'klassiker', label: 'Evergreens', emoji: '📻' },
  { id: 'hits', label: 'Hits ab den 90ern', emoji: '🎧' },
  { id: 'film', label: 'Film & Klassik', emoji: '🎬' },
];

function Settings({ value, onChange }: GameSettingsProps<SummRatenSettings>) {
  return (
    <SettingsPanel>
      <TurnSettingsRows value={value} onChange={onChange}>
        <ChipSelect
          label="Kategorien"
          options={CATEGORIES}
          selected={value.categories}
          onChange={(categories) => onChange({ ...value, categories })}
        />
      </TurnSettingsRows>
    </SettingsPanel>
  );
}

export const summRaten: GameDefinition<SummRatenSettings> = {
  id: 'summ-raten',
  name: 'Summ-Raten',
  tagline: 'Mmm-mm-mmm … welches Lied ist das?',
  description: 'Summe bekannte Lieder ohne Text – von Kinderliedern über Mundart-Hits bis zu Filmmusik. Dein Team rät den Titel.',
  emoji: '🎵',
  colors: ['#ffd23f', '#ff8a3d'],
  minPlayers: 4,
  maxPlayers: 20,
  duration: '15–40 Min.',
  age: 'ab 8 J.',
  tags: ['Teams', 'Musik', 'Laut'],
  status: 'available',
  rules: [
    'Zwei Teams spielen abwechselnd. Eine Person summt, ihr Team rät den Titel.',
    'Kein Text, kein Pfeifen von Liedtext – nur summen oder «dadada».',
    'Jeder erratene Titel gibt einen Punkt.',
    'Wer nach einer vollen Runde zuerst das Punkteziel erreicht, gewinnt.',
  ],
  defaultSettings: { seconds: 60, target: 15, categories: CATEGORIES.map((c) => c.id) },
  Settings,
  Play: lazy(() => import('./SummRatenGame.tsx')),
};
