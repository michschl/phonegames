import { useMemo } from 'react';
import type { GameProps } from '../types.ts';
import { drawFresh } from '../shared/deck.ts';
import { PromptCard } from '../shared/GameShell.tsx';
import { TeamTurnGame } from '../shared/TeamTurnGame.tsx';
import type { TurnSettings } from '../shared/turnSettings.tsx';
import { SONGS, type Song } from './songs.ts';

export interface SummRatenSettings extends TurnSettings {
  categories: string[];
}

export const SONG_CATEGORIES: { id: Song['category']; label: string; emoji: string }[] = [
  { id: 'kinder', label: 'Kinderlieder', emoji: '🧸' },
  { id: 'schweiz', label: 'Schweiz & Mundart', emoji: '🇨🇭' },
  { id: 'weihnachten', label: 'Weihnachten', emoji: '🎄' },
  { id: 'klassiker', label: 'Evergreens', emoji: '📻' },
  { id: 'hits', label: 'Hits ab den 90ern', emoji: '🎧' },
  { id: 'film', label: 'Film & Klassik', emoji: '🎬' },
];

export default function SummRatenGame({ players, settings, onExit }: GameProps<SummRatenSettings>) {
  const pool = useMemo(() => {
    const filtered = SONGS.filter((s) => settings.categories.includes(s.category));
    return filtered.length > 0 ? filtered : SONGS;
  }, [settings.categories]);

  return (
    <TeamTurnGame<Song>
      players={players}
      onExit={onExit}
      accent="#ffd23f"
      verb="summt"
      turnSeconds={settings.seconds}
      targetScore={settings.target}
      draw={(used) => drawFresh('summ-raten', pool, (s) => s.id, { exclude: used })}
      cardLabel={(s) => s.title}
      renderCard={(s) => {
        const category = SONG_CATEGORIES.find((c) => c.id === s.category);
        return (
          <PromptCard eyebrow={`${category?.emoji ?? '🎵'} ${category?.label ?? ''}`} tone="#ffd23f">
            {s.title}
            {s.artist && <span className="song-artist">{s.artist}</span>}
          </PromptCard>
        );
      }}
      rulesHint={
        <>
          Summe die Melodie – <strong>ohne Text</strong>, nur «mmm» oder «dadada». Dein Team muss den Titel erraten.
        </>
      }
    />
  );
}
