import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type SpionSettings } from './logic.ts';

function SpionSettingsPanel({ value, onChange }: GameSettingsProps<SpionSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Zeit pro Runde"
        value={value.minutes}
        options={[5, 8, 10].map((m) => ({ value: m, label: `${m} Min.` }))}
        onChange={(minutes) => onChange({ ...value, minutes })}
      />
      <OptionRow
        label="Anzahl Spione"
        value={value.spies}
        options={[
          { value: 1, label: '1 Spion' },
          { value: 2, label: '2 Spione', hint: 'ab 6 Pers.' },
        ]}
        onChange={(spies) => onChange({ ...value, spies })}
      />
    </SettingsPanel>
  );
}

export const spion: GameDefinition<SpionSettings> = {
  id: 'spion',
  name: 'Spion unter uns',
  tagline: 'Alle kennen den Ort – nur einer nicht',
  description:
    'Alle erfahren geheim denselben Ort, nur der Spion nicht. Mit cleveren Fragen versucht ihr, ihn zu entlarven – ' +
    'bevor er herausfindet, wo ihr seid.',
  emoji: '🕵️',
  colors: ['#5b8cff', '#8b5cf6'],
  minPlayers: 3,
  maxPlayers: 12,
  duration: '10–40 Min.',
  age: 'ab 10 J.',
  tags: ['Bluff', 'Raten', 'Party'],
  status: 'available',
  rules: [
    'Das Handy geht reihum: Alle sehen geheim denselben Ort und eine Rolle – der Spion sieht nur «Du bist der Spion».',
    'Reihum stellt ihr einander Fragen zum Ort. Antwortet so, dass die anderen merken, dass ihr Bescheid wisst – aber der Spion nichts lernt.',
    'Jederzeit kann abgestimmt werden. Wird der Spion erwischt, darf er noch einmal den Ort raten. Er kann sich auch selbst outen und den Ort tippen.',
    'Bürger bekommen je 1 Punkt, ein erfolgreicher Spion 2 Punkte.',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings: SpionSettingsPanel,
  Play: lazy(() => import('./SpionGame.tsx')),
};
