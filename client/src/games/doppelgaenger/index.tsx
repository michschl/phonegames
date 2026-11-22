import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { Toggle } from '../../components/ui.tsx';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type DoppelSettings } from './logic.ts';

function DoppelSettingsPanel({ value, onChange }: GameSettingsProps<DoppelSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Doppelgänger"
        value={value.imposters}
        options={[
          { value: 1, label: '1 Person' },
          { value: 2, label: '2 Personen', hint: 'ab 7 Pers.' },
        ]}
        onChange={(imposters) => onChange({ ...value, imposters })}
      />
      <Toggle
        label="Ahnungslos-Modus"
        description="Der Doppelgänger bekommt gar kein Wort und muss komplett bluffen."
        checked={value.blank}
        onChange={(blank) => onChange({ ...value, blank })}
      />
    </SettingsPanel>
  );
}

export const doppelgaenger: GameDefinition<DoppelSettings> = {
  id: 'doppelgaenger',
  name: 'Doppelgänger',
  tagline: 'Fondue oder Raclette? Einer hat das falsche Wort',
  description:
    'Alle bekommen geheim dasselbe Wort – nur der Doppelgänger ein ähnliches und weiss nichts davon. ' +
    'Reihum sagt jede Person ein passendes Wort. Wer fällt auf?',
  emoji: '🪞',
  colors: ['#2de2e6', '#5b8cff'],
  minPlayers: 3,
  maxPlayers: 16,
  duration: '10–30 Min.',
  age: 'ab 8 J.',
  tags: ['Bluff', 'Wörter', 'Party'],
  status: 'available',
  scored: 'points',
  rules: [
    'Das Handy geht reihum: Alle sehen geheim ihr Wort. Der Doppelgänger hat ein ähnliches Wort – und weiss nicht, dass er der Doppelgänger ist.',
    'Reihum sagt jede Person ein einziges Wort, das zu ihrem Begriff passt.',
    'Danach wird abgestimmt. Erwischt ihr den Doppelgänger, bekommen alle anderen 1 Punkt – sonst bekommt er 2 Punkte.',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings: DoppelSettingsPanel,
  Play: lazy(() => import('./DoppelGame.tsx')),
};
