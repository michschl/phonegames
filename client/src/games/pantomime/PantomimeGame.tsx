import { useMemo } from 'react';
import type { GameProps } from '../types.ts';
import { drawFresh } from '../shared/deck.ts';
import { PromptCard } from '../shared/GameShell.tsx';
import { TeamTurnGame } from '../shared/TeamTurnGame.tsx';
import type { TurnSettings } from '../shared/turnSettings.tsx';
import { PANTOMIME_TERMS, type Term } from './terms.ts';

export interface PantomimeSettings extends TurnSettings {
  difficulties: string[];
}

export const STARS: Record<number, string> = { 1: '★', 2: '★★', 3: '★★★' };

export default function PantomimeGame({ players, settings, onExit }: GameProps<PantomimeSettings>) {
  const pool = useMemo(() => {
    const filtered = PANTOMIME_TERMS.filter((t) => settings.difficulties.includes(String(t.difficulty)));
    return filtered.length > 0 ? filtered : PANTOMIME_TERMS;
  }, [settings.difficulties]);

  return (
    <TeamTurnGame<Term>
      players={players}
      onExit={onExit}
      accent="#8b5cf6"
      verb="stellt dar"
      turnSeconds={settings.seconds}
      targetScore={settings.target}
      draw={(used) => drawFresh('pantomime', pool, (t) => t.id, { exclude: used })}
      cardLabel={(t) => t.text}
      renderCard={(t) => (
        <PromptCard eyebrow={`${t.category} · ${STARS[t.difficulty]}`} tone="#8b5cf6">
          {t.text}
        </PromptCard>
      )}
      rulesHint={
        <>
          Nur mit Händen, Füssen und Gesicht – <strong>keine Wörter, keine Geräusche</strong>, nicht auf Dinge zeigen.
        </>
      }
    />
  );
}
