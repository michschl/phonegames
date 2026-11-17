import { lazy } from 'react';
import type { LearnMode } from '../../../../shared/types.ts';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import { isSoloMode } from './modes.ts';

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

/** Where Lernen lives for these settings: «Wer spielt mit?» of a mode played together, else the stack. */
function pathFor(settings: SpickzettelSettings): string {
  if (!settings.stackId) return '/lernen';
  return isSoloMode(settings.mode) ? `/lernen/${settings.stackId}` : `/lernen/${settings.stackId}/${settings.mode}`;
}

export const spickzettel: GameDefinition<SpickzettelSettings> = {
  id: 'spickzettel',
  name: 'Lernen',
  tagline: 'Schulstoff spielend repetieren',
  description:
    'Fotografiere ein Wörtliblatt, einen Lückentext oder eine Heftseite – Phoni macht Lernkarten daraus. Lerne allein mit dem Kartenkasten oder dem Lückentext, zu zweit im Duell, im Team in der Blitzrunde oder schätzt gemeinsam Zahlen und Jahreszahlen. Alles im Tab «Lernen».',
  emoji: '📝',
  colors: ['#4d7cff', '#2ec5ff'],
  minPlayers: 1,
  maxPlayers: 30,
  duration: '5–20 Min.',
  age: 'ab 7 J.',
  tags: ['Lernen', 'Schule', 'Allein', 'Teams'],
  status: 'available',
  // Everything happens in the «Lernen» tab: stacks, learning alone and «Wer spielt mit?» for playing together.
  href: '/lernen',
  pathFor,
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
  Settings,
  playersNeeded: (settings) => (settings.mode === 'blitz' ? 4 : settings.mode === 'duell' ? 2 : 1),
  Play: lazy(() => import('./SpickzettelGame.tsx')),
};
