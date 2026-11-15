import { useMemo, useState } from 'react';
import { GameHero, GameRow } from '../components/GameCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Page } from '../components/Layout.tsx';
import { EmptyState } from '../components/ui.tsx';
import { GAMES } from '../games/registry.ts';
import type { GameDefinition } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { normalize } from '../lib/util.ts';
import { useData, useLibraryIds } from '../store/data.ts';
import { toast } from '../store/ui.ts';

const GROUP_SIZES = [
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5–6', value: 6 },
  { label: '7–10', value: 9 },
  { label: '11+', value: 12 },
];

function fitsGroup(game: GameDefinition, size: number | null): boolean {
  if (size === null || game.noGroup) return true;
  return game.minPlayers <= size && size <= game.maxPlayers;
}

/** Same pick for everyone on a given day. */
function gameOfTheDay(): GameDefinition {
  const available = GAMES.filter((g) => g.status === 'available');
  const day = Math.floor(Date.now() / 86_400_000);
  return available[day % available.length]!;
}

export function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const library = useLibraryIds();
  const addGame = useData((s) => s.addGame);
  const removeGame = useData((s) => s.removeGame);
  const featured = useMemo(gameOfTheDay, []);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of GAMES) for (const t of g.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, []);

  const results = useMemo(() => {
    const q = normalize(query);
    return GAMES.filter((game) => {
      if (tag && !game.tags.includes(tag)) return false;
      if (!fitsGroup(game, size)) return false;
      if (!q) return true;
      const haystack = normalize([game.name, game.tagline, game.description, ...game.tags].join(' '));
      return q.split(/\s+/).every((word) => haystack.includes(word));
    }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'available' ? -1 : 1));
  }, [query, tag, size]);

  const filtering = query !== '' || tag !== null || size !== null;

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
    <Page title="Entdecken" subtitle={`${GAMES.length} Spiele für jede Runde`}>
      <div className="search">
        <Icon name="search" size={20} strokeWidth={2.6} />
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
            <Icon name="x" size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>

      <div className="size-filter" role="radiogroup" aria-label="Wie viele seid ihr?">
        <span className="size-filter__label">
          <Icon name="users" size={18} strokeWidth={2.6} /> Wie viele seid ihr?
        </span>
        <div className="size-filter__options">
          {GROUP_SIZES.map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={size === option.value}
              className={`size-pill ${size === option.value ? 'is-active' : ''}`}
              onClick={() => {
                haptic(6);
                setSize(size === option.value ? null : option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-scroll" role="toolbar" aria-label="Nach Kategorie filtern">
        <button type="button" className={`chip ${tag === null ? 'is-active' : ''}`} onClick={() => setTag(null)}>
          Alle
        </button>
        {tags.map((t) => (
          <button key={t} type="button" className={`chip ${tag === t ? 'is-active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
            {t}
          </button>
        ))}
      </div>

      {!filtering && (
        <div className="discover-featured">
          <GameHero game={featured} eyebrow="⭐ Spiel des Tages" text={featured.tagline} />
        </div>
      )}

      {results.length === 0 ? (
        <EmptyState mascot="oops" emoji="🔍" title="Nichts gefunden" text="Versuch es mit einem anderen Suchbegriff oder Filter." />
      ) : (
        <>
          {filtering && (
            <p className="results-count">
              {results.length} {results.length === 1 ? 'Spiel' : 'Spiele'} gefunden
            </p>
          )}
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
        </>
      )}
    </Page>
  );
}
