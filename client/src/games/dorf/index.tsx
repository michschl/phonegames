import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { Toggle } from '../../components/ui.tsx';
import { VoicePicker } from '../../components/VoicePicker.tsx';
import { speechAvailable } from '../../lib/speech.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type DorfSettings } from './logic.ts';

function DorfSettingsPanel({ value, onChange }: GameSettingsProps<DorfSettings>) {
  return (
    <SettingsPanel>
      <Toggle
        label="Erzählstimme"
        description={
          speechAvailable()
            ? 'Das Handy führt mit Sprachausgabe durch die Nacht. Aus: Eine Person liest als Spielleitung vor.'
            : 'Dein Browser unterstützt keine Sprachausgabe – eine Person liest als Spielleitung vor.'
        }
        checked={value.voice && speechAvailable()}
        onChange={(voice) => onChange({ ...value, voice })}
      />
      {value.voice && speechAvailable() && (
        <div className="settings-panel__group">
          <span className="settings-panel__label">Stimme</span>
          <VoicePicker />
        </div>
      )}
      <Toggle
        label="Seherin"
        description="Sieht jede Nacht, ob eine Person ein Werwolf ist."
        checked={value.seherin}
        onChange={(seherin) => onChange({ ...value, seherin })}
      />
      <Toggle
        label="Beschützer (ab 6 Pers.)"
        description="Schützt jede Nacht eine Person vor den Werwölfen."
        checked={value.beschuetzer}
        onChange={(beschuetzer) => onChange({ ...value, beschuetzer })}
      />
      <OptionRow
        label="Diskussion am Tag"
        value={value.discussionMinutes}
        options={[2, 3, 5].map((m) => ({ value: m, label: `${m} Min.` }))}
        onChange={(discussionMinutes) => onChange({ ...value, discussionMinutes })}
      />
    </SettingsPanel>
  );
}

export const dorf: GameDefinition<DorfSettings> = {
  id: 'dorf',
  name: 'Nachts im Dorf',
  tagline: 'Werwölfe unter uns – das Handy ist Spielleitung',
  description:
    'Der Klassiker für grosse Runden: Nachts schlagen die Werwölfe zu, tagsüber versucht das Dorf, sie zu entlarven. ' +
    'Die Erzählstimme des Handys führt durch die Nacht.',
  emoji: '🐺',
  colors: ['#4b3a8f', '#8b5cf6'],
  minPlayers: 5,
  maxPlayers: 20,
  duration: '20–60 Min.',
  age: 'ab 10 J.',
  tags: ['Bluff', 'Grosse Gruppe', 'Party'],
  status: 'available',
  rules: [
    'Alle sehen geheim ihre Rolle: Werwolf, Seherin, Beschützer oder Dorfbewohner.',
    'Nachts liegt das Handy in der Mitte. Alle schliessen die Augen; die Erzählstimme weckt nacheinander die Rollen, die aufs Handy tippen.',
    'Tagsüber diskutiert das Dorf und verbannt eine verdächtige Person.',
    'Wer stirbt oder verbannt wird, scheidet aus – die Rolle bleibt aber bis zum Spielende geheim. Bluffen ist erlaubt!',
    'Das Dorf gewinnt, wenn alle Werwölfe weg sind – die Werwölfe, sobald sie gleich viele sind wie der Rest.',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings: DorfSettingsPanel,
  Play: lazy(() => import('./DorfGame.tsx')),
};
