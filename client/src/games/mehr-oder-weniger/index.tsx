import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type MehrSettings } from './logic.ts';

function Settings({ value, onChange }: GameSettingsProps<MehrSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Fragen pro Person"
        value={value.rounds}
        options={[3, 5, 10].map((n) => ({ value: n, label: `${n}` }))}
        onChange={(rounds) => onChange({ ...value, rounds })}
      />
    </SettingsPanel>
  );
}

export const mehrOderWeniger: GameDefinition<MehrSettings> = {
  id: 'mehr-oder-weniger',
  name: 'Mehr oder weniger',
  tagline: 'Matterhorn oder Kilimandscharo – was ist höher?',
  description:
    'Zwei Dinge, eine Frage: Was ist höher, länger, schwerer oder älter? Reihum tippt jede Person – wer liegt am häufigsten richtig?',
  emoji: '⚖️',
  colors: ['#2de2e6', '#3ddc97'],
  minPlayers: 1,
  maxPlayers: 12,
  duration: '10–20 Min.',
  age: 'ab 8 J.',
  tags: ['Wissen', 'Schnell', 'Familie'],
  status: 'available',
  rules: [
    'Reihum bekommt jede Person zwei Dinge und eine Frage, z. B. «Welcher Berg ist höher?».',
    'Tippe auf deine Antwort – danach werden die Zahlen aufgedeckt.',
    'Jede richtige Antwort gibt einen Punkt. Drei richtige in Serie: 🔥',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings,
  Play: lazy(() => import('./MehrOderWenigerGame.tsx')),
};
