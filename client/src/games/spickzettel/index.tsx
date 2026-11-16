import { lazy } from 'react';
import type { Player } from '../../../../shared/types.ts';
import type { GameDefinition, GameSettingsProps, PlayerStatusInfo } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import { canPlayChoice } from '../../lib/learn.ts';
import { useStack } from '../../store/data.ts';
import { Prepare } from './Prepare.tsx';
import { KASTEN_LEGEND, useKastenTiles } from './status.ts';

export interface SpickzettelSettings {
  stackId: string | null;
  /** kasten = Kartenkasten (allein), duell = Duell (zu zweit), blitz = Blitzrunde (Teams). */
  mode: 'kasten' | 'duell' | 'blitz';
  /** How answers are checked in the Kartenkasten. */
  check: 'self' | 'choice' | 'type';
  /** Cards per Kartenkasten session. */
  sessionSize: number;
  seconds: number;
  target: number;
  /** Questions per Duell. */
  duelQuestions: number;
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
  if (value.mode === 'duell') {
    return (
      <SettingsPanel>
        <OptionRow
          label="Fragen pro Duell"
          value={value.duelQuestions}
          options={[10, 15, 20].map((n) => ({ value: n, label: `${n}` }))}
          onChange={(duelQuestions) => onChange({ ...value, duelQuestions })}
          hint="Hat der Stapel weniger Karten, kommt jede Karte einmal."
        />
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
          { value: 'type', label: 'Eintippen', hint: 'genau' },
        ]}
        onChange={(check) => onChange({ ...value, check })}
        hint={
          value.check === 'self'
            ? 'Antwort im Kopf oder laut sagen, aufdecken und ehrlich bewerten.'
            : value.check === 'choice'
              ? 'Vier Antworten zur Auswahl – die App prüft.'
              : 'Antwort eintippen. Ein kleiner Tippfehler, ein fehlender Akzent oder Artikel zählt als «fast richtig».'
        }
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
  if (settings.mode === 'duell' && !canPlayChoice(stack)) return 'Duell: mindestens 4 Karten';
  return null;
}

/** Setup screen: the name tiles of the group show where everyone stands in the Kartenkasten. */
function usePlayerStatus(settings: SpickzettelSettings, players: Player[]): PlayerStatusInfo | null {
  const stack = useStack(settings.stackId);
  const tiles = useKastenTiles(settings.stackId, players);
  if (settings.mode !== 'kasten' || !stack || !tiles) return null;
  return { caption: `Kartenkasten «${stack.title}»`, legend: KASTEN_LEGEND, players: tiles };
}

export const spickzettel: GameDefinition<SpickzettelSettings> = {
  id: 'spickzettel',
  name: 'Spickzettel',
  tagline: 'Schulstoff spielend repetieren',
  description:
    'Fotografiere ein Wörtliblatt oder eine Heftseite – Phoni macht Lernkarten daraus. Lerne allein mit dem Kartenkasten, zu zweit im Duell oder in der Blitzrunde im Team.',
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
    'Duell: Das Handy liegt zwischen zwei Personen, jede hat ihre Bildschirmhälfte. Wer zuerst richtig tippt, holt den Punkt – falsch getippt sperrt kurz.',
    'Blitzrunde: Zwei Teams. Eine Person liest die Fragen vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
  ],
  defaultSettings: { stackId: null, mode: 'kasten', check: 'self', sessionSize: 20, seconds: 60, target: 15, duelQuestions: 10 },
  prepareKeys: ['stackId', 'mode'],
  Prepare,
  Settings,
  playersNeeded: (settings) => (settings.mode === 'blitz' ? 4 : settings.mode === 'duell' ? 2 : 1),
  useBlocker,
  usePlayerStatus,
  Play: lazy(() => import('./SpickzettelGame.tsx')),
};
