import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import { useStack } from '../../store/data.ts';
import { Prepare } from './Prepare.tsx';

export interface SpickzettelSettings {
  stackId: string | null;
  /** kasten = Kartenkasten (allein), blitz = Blitzrunde (Teams). */
  mode: 'kasten' | 'blitz';
  /** How answers are checked in the Kartenkasten. */
  check: 'self' | 'choice';
  /** Cards per Kartenkasten session. */
  sessionSize: number;
  seconds: number;
  target: number;
}

/** Cards needed for a Blitzrunde – otherwise the same cards come round all the time. */
export const BLITZ_MIN_CARDS = 4;

function Settings({ value, onChange }: GameSettingsProps<SpickzettelSettings>) {
  if (value.mode === 'blitz') {
    return (
      <SettingsPanel>
        <TurnSettingsRows value={value} onChange={onChange} seconds={[45, 60, 90]} />
      </SettingsPanel>
    );
  }
  return (
    <SettingsPanel>
      <OptionRow
        label="Antworten"
        value={value.check}
        options={[
          { value: 'self', label: 'Selbst prüfen', hint: 'aufdecken' },
          { value: 'choice', label: 'Auswahl', hint: 'aus vier' },
        ]}
        onChange={(check) => onChange({ ...value, check })}
        hint={value.check === 'self' ? 'Antwort im Kopf oder laut sagen, aufdecken und ehrlich bewerten.' : 'Vier Antworten zur Auswahl – die App prüft.'}
      />
      <OptionRow
        label="Karten pro Runde"
        value={value.sessionSize}
        options={[10, 20, 30].map((n) => ({ value: n, label: `${n}` }))}
        onChange={(sessionSize) => onChange({ ...value, sessionSize })}
      />
    </SettingsPanel>
  );
}

function useBlocker(settings: SpickzettelSettings): string | null {
  const stack = useStack(settings.stackId);
  if (!stack) return 'Wähle zuerst einen Lernstapel';
  if (stack.cards.length === 0) return 'Der Stapel hat noch keine Karten';
  if (settings.mode === 'blitz' && stack.cards.length < BLITZ_MIN_CARDS) return `Blitzrunde: mindestens ${BLITZ_MIN_CARDS} Karten`;
  return null;
}

export const spickzettel: GameDefinition<SpickzettelSettings> = {
  id: 'spickzettel',
  name: 'Spickzettel',
  tagline: 'Schulstoff spielend repetieren',
  description:
    'Fotografiere ein Wörtliblatt oder eine Heftseite – Phoni macht Lernkarten daraus. Lerne allein mit dem Kartenkasten oder tritt in der Blitzrunde im Team an.',
  emoji: '📝',
  colors: ['#4d7cff', '#2ec5ff'],
  minPlayers: 1,
  maxPlayers: 30,
  duration: '5–20 Min.',
  age: 'ab 7 J.',
  tags: ['Lernen', 'Schule', 'Allein', 'Teams'],
  status: 'available',
  rules: [
    'Erstelle einen Lernstapel: Fotos von Wörtliblatt oder Heft – oder die Karten abtippen. Prüfe die erkannten Karten kurz.',
    'Kartenkasten: Wer lernt, beantwortet die fälligen Karten. Gewusst → ein Fach weiter, nicht gewusst → zurück ins erste Fach.',
    'Karten in den hinteren Fächern kommen seltener: nach 1, 3, 7 und 14 Tagen. So bleibt der Stoff im Kopf.',
    'Blitzrunde: Zwei Teams. Eine Person liest die Fragen vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
  ],
  defaultSettings: { stackId: null, mode: 'kasten', check: 'self', sessionSize: 20, seconds: 60, target: 15 },
  prepareKeys: ['stackId', 'mode'],
  Prepare,
  Settings,
  playersNeeded: (settings) => (settings.mode === 'blitz' ? 4 : 1),
  useBlocker,
  Play: lazy(() => import('./SpickzettelGame.tsx')),
};
