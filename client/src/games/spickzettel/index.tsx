import { lazy } from 'react';
import type { LearnMode } from '../../../../shared/types.ts';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import { modeFits } from '../../lib/learn.ts';
import { useStack } from '../../store/data.ts';
import { isSoloMode } from './modes.ts';
import { Prepare } from './Prepare.tsx';

export interface SpickzettelSettings {
  stackId: string | null;
  /**
   * kasten = Kartenkasten (allein), duell = Duell (zu zweit), blitz = Blitzrunde (Teams),
   * schaetzen = Schätzrunde (Zahlen, alle schätzen), luecke = Lückentext (allein).
   */
  mode: LearnMode;
  /** How answers are checked in the Kartenkasten. */
  check: 'self' | 'choice' | 'type';
  /** Cards per Kartenkasten session. */
  sessionSize: number;
  seconds: number;
  target: number;
  /** Questions per Duell. */
  duelQuestions: number;
  /** Questions per Schätzrunde. */
  estimateQuestions: number;
  /** Lückentext: tap words from the word bank or type them. */
  clozeInput: 'bank' | 'type';
}

function Settings({ value, onChange }: GameSettingsProps<SpickzettelSettings>) {
  if (value.mode === 'schaetzen') {
    return (
      <SettingsPanel>
        <OptionRow
          label="Fragen pro Runde"
          value={value.estimateQuestions}
          options={[5, 10, 15].map((n) => ({ value: n, label: `${n}` }))}
          onChange={(estimateQuestions) => onChange({ ...value, estimateQuestions })}
          hint="Hat der Stapel weniger Zahlen, kommt jede einmal."
        />
      </SettingsPanel>
    );
  }
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
  // Kartenkasten and Lückentext are set up on the stack page in «Lernen».
  return null;
}

function useBlocker(settings: SpickzettelSettings): string | null {
  const stack = useStack(settings.stackId);
  if (!stack) return 'Wähle zuerst einen Lernstapel';
  // Prepare offers only the modes that fit – none fits when the stack is too small.
  if (isSoloMode(settings.mode) || !modeFits(settings.mode, stack)) return 'Zu wenige Karten zum Zusammenspielen';
  return null;
}

export const spickzettel: GameDefinition<SpickzettelSettings> = {
  id: 'spickzettel',
  name: 'Spickzettel',
  tagline: 'Schulstoff spielend repetieren',
  description:
    'Fotografiere ein Wörtliblatt, einen Lückentext oder eine Heftseite – Phoni macht Lernkarten daraus. Lerne allein mit dem Kartenkasten oder dem Lückentext, zu zweit im Duell, im Team in der Blitzrunde oder schätzt gemeinsam Zahlen und Jahreszahlen.',
  emoji: '📝',
  colors: ['#4d7cff', '#2ec5ff'],
  minPlayers: 1,
  maxPlayers: 30,
  duration: '5–20 Min.',
  age: 'ab 7 J.',
  tags: ['Lernen', 'Schule', 'Allein', 'Teams'],
  status: 'available',
  // Learning alone, the stacks and who has cards due live in the «Lernen» tab.
  href: '/lernen',
  rules: [
    'Wähle einen Lernstapel. Neue Stapel erstellst du – und allein lernst du – unter «Lernen».',
    'Duell: Das Handy liegt zwischen zwei Personen. Wer zuerst richtig tippt, holt den Punkt – falsch getippt sperrt kurz.',
    'Blitzrunde: Zwei Teams. Eine Person liest vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
    'Schätzrunde: Alle schätzen Zahlen und Jahreszahlen geheim. Wer am nächsten liegt, punktet.',
  ],
  defaultSettings: {
    stackId: null,
    mode: 'duell',
    check: 'self',
    sessionSize: 20,
    seconds: 60,
    target: 15,
    duelQuestions: 10,
    estimateQuestions: 10,
    clozeInput: 'bank',
  },
  prepareKeys: ['stackId', 'mode'],
  Prepare,
  Settings,
  playersNeeded: (settings) => (settings.mode === 'blitz' ? 4 : settings.mode === 'duell' ? 2 : 1),
  useBlocker,
  Play: lazy(() => import('./SpickzettelGame.tsx')),
};
