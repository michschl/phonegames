import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type HutSettings } from './logic.ts';

function Settings({ value, onChange }: GameSettingsProps<HutSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Begriffe pro Person"
        value={value.termsPerPlayer}
        options={[3, 4, 5].map((n) => ({ value: n, label: `${n}` }))}
        onChange={(termsPerPlayer) => onChange({ ...value, termsPerPlayer })}
      />
      <OptionRow
        label="Zeit pro Zug"
        value={value.seconds}
        options={[45, 60, 90].map((s) => ({ value: s, label: `${s} s` }))}
        onChange={(seconds) => onChange({ ...value, seconds })}
      />
    </SettingsPanel>
  );
}

export const hutspiel: GameDefinition<HutSettings> = {
  id: 'hutspiel',
  name: 'Hutspiel-Marathon',
  tagline: 'Eure Begriffe, drei Runden, immer schwieriger',
  description:
    'Alle tippen eigene Begriffe in den Hut. Dann wird dreimal mit denselben Begriffen gespielt: erklären, nur ein Wort, Pantomime. ' +
    'Running Gags garantiert!',
  emoji: '🎩',
  colors: ['#ff7ae0', '#8b5cf6'],
  minPlayers: 4,
  maxPlayers: 20,
  duration: '30–60 Min.',
  age: 'ab 10 J.',
  tags: ['Teams', 'Raten', 'Party'],
  status: 'available',
  scored: 'points',
  rules: [
    'Alle tippen geheim ein paar Begriffe ein – Personen, Dinge, Orte, Insider.',
    'Runde 1: frei erklären. Runde 2: nur ein Wort. Runde 3: Pantomime. Immer mit denselben Begriffen.',
    'Teams wechseln sich ab, bis der Hut leer ist. Jeder erratene Begriff gibt einen Punkt.',
    'Nach drei Runden gewinnt das Team mit den meisten Punkten.',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings,
  Play: lazy(() => import('./HutspielGame.tsx')),
};
