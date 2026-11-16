import { lazy } from 'react';
import type { LearnMode } from '../../../../shared/types.ts';
import type { GameDefinition, GameSettingsProps, SoloStart } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { TurnSettingsRows } from '../shared/turnSettings.tsx';
import { BLITZ_MIN_CARDS, canPlayChoice, clozeCards, estimateCards, MODE_MIN_CARDS } from '../../lib/learn.ts';
import { useStack } from '../../store/data.ts';
import { useDefaultLearner, useLearners } from '../../store/learners.ts';
import { isSoloMode, soloLearnPath } from './modes.ts';
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
  if (value.mode === 'luecke') {
    return (
      <SettingsPanel>
        <OptionRow
          label="Lücken füllen"
          value={value.clozeInput}
          options={[
            { value: 'bank', label: 'Wortbank', hint: 'antippen' },
            { value: 'type', label: 'Eintippen', hint: 'genau' },
          ]}
          onChange={(clozeInput) => onChange({ ...value, clozeInput })}
          hint={
            value.clozeInput === 'bank'
              ? 'Die fehlenden Wörter stehen unter dem Text – antippen und in die Lücke setzen.'
              : 'Wörter selbst eintippen. Ein kleiner Tippfehler, ein fehlender Akzent oder Artikel zählt als «fast richtig».'
          }
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
  if (settings.mode === 'schaetzen' && estimateCards(stack).length < MODE_MIN_CARDS.schaetzen) {
    return `Schätzrunde: mindestens ${MODE_MIN_CARDS.schaetzen} Karten mit Zahlen`;
  }
  if (settings.mode === 'luecke' && clozeCards(stack).length < MODE_MIN_CARDS.luecke) {
    return `Lückentext: mindestens ${MODE_MIN_CARDS.luecke} Sätze mit Lücke`;
  }
  return null;
}

/** Kartenkasten and Lückentext: one person learns, no group – «Wer lernt?» is asked in Prepare. */
function useSoloStart(settings: SpickzettelSettings): SoloStart | null {
  const learners = useLearners(settings.stackId);
  const learner = useDefaultLearner(settings.stackId, learners);
  if (!isSoloMode(settings.mode)) return null;
  if (!settings.stackId || !learner) return { path: null, label: 'Wer lernt? Name eingeben' };
  return { path: soloLearnPath(settings.stackId, settings.mode, learner), label: `Lernen · ${learner}` };
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
  rules: [
    'Erstelle einen Lernstapel: Fotos von Wörtliblatt oder Heft – oder die Karten abtippen. Prüfe die erkannten Karten kurz.',
    'Kartenkasten: Wer lernt, beantwortet die fälligen Karten. Gewusst → ein Fach weiter, nicht gewusst → zurück ins erste Fach.',
    'Karten in den hinteren Fächern kommen seltener: nach 1, 3, 7 und 14 Tagen. So bleibt der Stoff im Kopf.',
    'Duell: Das Handy liegt zwischen zwei Personen, jede hat ihre Bildschirmhälfte. Wer zuerst richtig tippt, holt den Punkt – falsch getippt sperrt kurz.',
    'Blitzrunde: Zwei Teams. Eine Person liest die Fragen vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
    'Schätzrunde: Bei Zahlen und Jahreszahlen schätzen alle geheim. Volltreffer 3 Punkte, ganz nah 2, nah dran 1 – wer am nächsten liegt, bekommt einen Bonuspunkt.',
    'Lückentext: Der Text kommt Seite für Seite. Setze die fehlenden Wörter aus der Wortbank ein oder tippe sie, dann prüfen.',
  ],
  defaultSettings: {
    stackId: null,
    mode: 'kasten',
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
  useSoloStart,
  Play: lazy(() => import('./SpickzettelGame.tsx')),
};
