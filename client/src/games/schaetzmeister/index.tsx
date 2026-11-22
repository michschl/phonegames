import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { ChipSelect, OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { CATEGORY_OPTIONS, DEFAULT_SETTINGS, type SchaetzSettings } from './logic.ts';

function Settings({ value, onChange }: GameSettingsProps<SchaetzSettings>) {
  return (
    <SettingsPanel>
      <ChipSelect
        label="Themen"
        options={CATEGORY_OPTIONS}
        selected={value.categories}
        onChange={(categories) => onChange({ ...value, categories })}
      />
      <OptionRow
        label="Anzahl Fragen"
        value={value.rounds}
        options={[5, 10, 15].map((n) => ({ value: n, label: `${n}` }))}
        onChange={(rounds) => onChange({ ...value, rounds })}
      />
    </SettingsPanel>
  );
}

export const schaetzmeister: GameDefinition<SchaetzSettings> = {
  id: 'schaetzmeister',
  name: 'Schätzmeister',
  tagline: 'Wer liegt am nächsten?',
  description:
    'Wie hoch spritzt der Jet d’Eau? Wie viele Knochen hat ein Mensch? Alle schätzen geheim – wer am nächsten liegt, sahnt ab.',
  emoji: '🎯',
  colors: ['#ffd23f', '#ff8a3d'],
  minPlayers: 2,
  maxPlayers: 12,
  duration: '15–30 Min.',
  age: 'ab 10 J.',
  tags: ['Wissen', 'Ruhig', 'Familie'],
  status: 'available',
  scored: 'points',
  rules: [
    'Eine Schätzfrage erscheint. Alle tippen nacheinander geheim ihre Zahl ein.',
    'Dann wird die Antwort spannend aufgelöst.',
    'Am nächsten dran: 3 Punkte, Zweite: 2, Dritte: 1. Volltreffer (±1 %): 2 Bonuspunkte!',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings,
  Play: lazy(() => import('./SchaetzmeisterGame.tsx')),
};
