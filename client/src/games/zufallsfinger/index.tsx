import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import type { FingerSettings } from './ZufallsfingerGame.tsx';

function Settings({ value, onChange }: GameSettingsProps<FingerSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Was soll ausgelost werden?"
        value={value.mode}
        options={[
          { value: 'eins', label: 'Eine Person' },
          { value: 'teams', label: 'Zwei Teams' },
          { value: 'reihenfolge', label: 'Reihenfolge' },
        ]}
        onChange={(mode) => onChange({ ...value, mode })}
      />
    </SettingsPanel>
  );
}

export const zufallsfinger: GameDefinition<FingerSettings> = {
  id: 'zufallsfinger',
  name: 'Zufallsfinger',
  tagline: 'Alle Finger aufs Display – wen trifft’s?',
  description:
    'Wer beginnt? Wer holt die Getränke? Alle legen einen Finger aufs Handy, nach einem kurzen Trommelwirbel entscheidet der Zufall. Auch für Teams und Reihenfolgen.',
  emoji: '☝️',
  colors: ['#8b5cf6', '#ff3d8b'],
  minPlayers: 2,
  maxPlayers: 10,
  duration: '1 Min.',
  age: 'ab 4 J.',
  tags: ['Werkzeug', 'Schnell', 'Familie'],
  status: 'available',
  noGroup: true,
  rules: [
    'Alle legen gleichzeitig einen Finger auf das Display und halten still.',
    'Nach einem Trommelwirbel wählt das Handy eine Person aus – oder teilt Teams ein oder bestimmt die Reihenfolge.',
    'Finger weg und nochmals – so oft ihr wollt.',
  ],
  defaultSettings: { mode: 'eins' },
  Settings,
  Play: lazy(() => import('./ZufallsfingerGame.tsx')),
};
