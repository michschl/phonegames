import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { ChipSelect, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import type { PantomimeSettings } from './PantomimeGame.tsx';

function PantomimeSettingsPanel({ value, onChange }: GameSettingsProps<PantomimeSettings>) {
  return (
    <SettingsPanel>
      <TurnSettingsRows value={value} onChange={onChange}>
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
      </TurnSettingsRows>
    </SettingsPanel>
  );
}

export const pantomime: GameDefinition<PantomimeSettings> = {
  id: 'pantomime',
  name: 'Pantomime',
  tagline: 'Ohne Worte zum Sieg',
  description: 'Begriffe pantomimisch darstellen, das eigene Team rät gegen die Uhr. Über 300 Begriffe in drei Schwierigkeitsstufen.',
  emoji: '🎭',
  colors: ['#8b5cf6', '#ff7ae0'],
  minPlayers: 4,
  maxPlayers: 20,
  duration: '15–45 Min.',
  age: 'ab 6 J.',
  tags: ['Teams', 'Bewegung', 'Raten'],
  status: 'available',
  scored: 'points',
  rules: [
    'Die App teilt euch in zwei Teams ein.',
    'Abwechselnd stellt eine Person ihres Teams Begriffe dar – ohne Worte und ohne Geräusche.',
    'Das eigene Team rät. Jeder erratene Begriff gibt einen Punkt, überspringen kostet nichts.',
    'Wer nach einer vollen Runde zuerst das Punkteziel erreicht, gewinnt.',
  ],
  defaultSettings: { seconds: 60, target: 15, difficulties: ['1', '2', '3'] },
  Settings: PantomimeSettingsPanel,
  Play: lazy(() => import('./PantomimeGame.tsx')),
};
