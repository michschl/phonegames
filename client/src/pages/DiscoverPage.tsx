import { useMemo, useState } from 'react';
import { GameRow } from '../components/GameCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Page } from '../components/Layout.tsx';
import { EmptyState } from '../components/ui.tsx';
import { GAMES } from '../games/registry.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { normalize } from '../lib/util.ts';
import { useData, useLibraryIds } from '../store/data.ts';
import { toast } from '../store/ui.ts';

export function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const library = useLibraryIds();
  const addGame = useData((s) => s.addGame);
  const removeGame = useData((s) => s.removeGame);

  const tags = useMemo(() => [...new Set(GAMES.flatMap((g) => g.tags))].sort((a, b) => a.localeCompare(b)), []);

  const results = useMemo(() => {
    const q = normalize(query);
    return GAMES.filter((game) => {
      if (tag && !game.tags.includes(tag)) return false;
      if (!q) return true;
      const haystack = normalize([game.name, game.tagline, game.description, ...game.tags].join(' '));
      return q.split(/\s+/).every((word) => haystack.includes(word));
    }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'available' ? -1 : 1));
  }, [query, tag]);

  const toggle = (gameId: string, name: string, button: HTMLElement) => {
    if (library.includes(gameId)) {
      removeGame(gameId);
      haptic(10);
      toast(`${name} aus deinen Spielen entfernt.`);
    } else {
      addGame(gameId);
      sound.unlock();
      sound.pop();
      haptic([15, 30, 15]);
      const rect = button.getBoundingClientRect();
      confetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count: 70, spread: Math.PI });
      toast(`${name} ist jetzt in deinen Spielen 🎉`, { tone: 'success' });
    }
  };

  return (
    <Page title="Entdecken" subtitle="Finde das perfekte Spiel für eure Runde.">
      <div className="search">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Spiele suchen …"
          aria-label="Spiele suchen"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="search__clear" aria-label="Suche löschen" onClick={() => setQuery('')}>
            <Icon name="x" size={18} />
          </button>
        )}
      </div>

      <div className="chip-scroll" role="toolbar" aria-label="Nach Kategorie filtern">
        <button type="button" className={`chip ${tag === null ? 'is-active' : ''}`} onClick={() => setTag(null)}>
          Alle
        </button>
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip ${tag === t ? 'is-active' : ''}`}
            onClick={() => setTag(tag === t ? null : t)}
          >
            {t}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <EmptyState emoji="🔍" title="Nichts gefunden" text="Versuch es mit einem anderen Suchbegriff." />
      ) : (
        <div className="game-list">
          {results.map((game, i) => (
            <GameRow
              key={game.id}
              game={game}
              index={i}
              inLibrary={library.includes(game.id)}
              onToggle={(button) => toggle(game.id, game.name, button)}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
