import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows, type TurnSettings } from '../shared/turnSettings.tsx';

function Settings({ value, onChange }: GameSettingsProps<TurnSettings>) {
  return (
    <SettingsPanel>
      <TurnSettingsRows value={value} onChange={onChange} seconds={[60, 90, 120]} />
    </SettingsPanel>
  );
}

export const verboteneWoerter: GameDefinition<TurnSettings> = {
  id: 'verbotene-woerter',
  name: 'Verbotene Wörter',
  tagline: 'Erklären, ohne die naheliegenden Wörter zu sagen',
  description:
    'Erkläre «Fondue» – aber ohne Käse, Caquelon, Brot, Gabel und Winter! Über 200 Karten mit je fünf verbotenen Wörtern.',
  emoji: '🤐',
  colors: ['#ff4d6d', '#ff8a3d'],
  minPlayers: 4,
  maxPlayers: 20,
  duration: '20–45 Min.',
  age: 'ab 10 J.',
  tags: ['Teams', 'Wörter', 'Raten'],
  status: 'available',
  rules: [
    'Zwei Teams spielen abwechselnd. Eine Person erklärt, ihr Team rät.',
    'Der Begriff und die fünf roten Wörter sind verboten – auch Teile davon und Übersetzungen.',
    'Erraten: +1 Punkt. Verbotenes Wort benutzt: −1 Punkt (das andere Team passt auf).',
    'Wer nach einer vollen Runde zuerst das Punkteziel erreicht, gewinnt.',
  ],
  defaultSettings: { seconds: 90, target: 20 },
  Settings,
  Play: lazy(() => import('./VerboteneWoerterGame.tsx')),
};
