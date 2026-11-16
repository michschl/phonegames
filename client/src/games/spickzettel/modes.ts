import type { LearnMode } from '../../../../shared/types.ts';

/** Who plays: the modes are offered by situation, not as one long list. */
export type Situation = 'allein' | 'zuzweit' | 'mehrere';

export const SITUATIONS: { value: Situation; label: string }[] = [
  { value: 'allein', label: 'Allein' },
  { value: 'zuzweit', label: 'Zu zweit' },
  { value: 'mehrere', label: 'Mit mehreren' },
];

export interface ModeInfo {
  value: LearnMode;
  situation: Situation;
  emoji: string;
  label: string;
  /** Short line on the tile. */
  hint: string;
  /** One sentence that explains the mode. */
  text: string;
}

export const MODES: ModeInfo[] = [
  {
    value: 'kasten',
    situation: 'allein',
    emoji: '🗂️',
    label: 'Kartenkasten',
    hint: 'eigener Kasten',
    text: 'Fällige Karten beantworten – gewusste kommen seltener, vergessene gleich wieder.',
  },
  {
    value: 'luecke',
    situation: 'allein',
    emoji: '🧩',
    label: 'Lückentext',
    hint: 'Seite für Seite',
    text: 'Die fehlenden Wörter einsetzen – aus der Wortbank oder selbst getippt.',
  },
  {
    value: 'duell',
    situation: 'zuzweit',
    emoji: '⚔️',
    label: 'Duell',
    hint: 'geteilter Bildschirm',
    text: 'Das Handy liegt zwischen euch – wer zuerst richtig tippt, punktet.',
  },
  {
    value: 'blitz',
    situation: 'mehrere',
    emoji: '⚡',
    label: 'Blitzrunde',
    hint: 'Teams, ab 4',
    text: 'Eine Person liest vor und sieht die Antwort, ihr Team antwortet gegen die Zeit.',
  },
  {
    value: 'schaetzen',
    situation: 'mehrere',
    emoji: '🎯',
    label: 'Schätzrunde',
    hint: 'Zahlen und Jahre',
    text: 'Alle schätzen geheim, dann zählt die App hoch – wer am nächsten liegt, punktet.',
  },
];

/** Modes one person plays without a group – started from «Wer lernt?». */
export const SOLO_MODES = ['kasten', 'luecke'] as const;
export type SoloMode = (typeof SOLO_MODES)[number];

export function isSoloMode(mode: string | null | undefined): mode is SoloMode {
  return (SOLO_MODES as readonly string[]).includes(mode ?? '');
}

/** Straight into learning: Kartenkasten or Lückentext of a stack for one person. */
export function soloLearnPath(stackId: string, mode: SoloMode, person: string): string {
  return `/lernen/${stackId}/${mode}?person=${encodeURIComponent(person)}`;
}
