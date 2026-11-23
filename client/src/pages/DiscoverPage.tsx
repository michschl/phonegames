import { useMemo, useState } from 'react';
import { ARENA_GAMES } from '../arena/registry.ts';
import type { ArenaGame } from '../arena/types.ts';
import { GameHero, GameRow, PlayRow } from '../components/GameCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Page } from '../components/Layout.tsx';
import { EmptyState } from '../components/ui.tsx';
import { GAMES } from '../games/registry.ts';
import type { GameDefinition } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { normalize } from '../lib/util.ts';
import { SOLO_GAMES } from '../solo/registry.ts';
import type { SoloGame } from '../solo/types.ts';
import { useData, useLibraryIds, useRewards } from '../store/data.ts';
import { toast } from '../store/ui.ts';

const GROUP_SIZES = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5–6', value: 6 },
  { label: '7–10', value: 9 },
  { label: '11+', value: 12 },
];

/*
 * The catalogue holds every game: those for a group on one phone («Zusammen»), the short rounds of
 * «Allein» for children and the 3D games of the «Arena» (from 13, hidden when the parents switched it off).
 * Only the group games can be added to «Meine Spiele»; the others open their page.
 */
type Entry =
  | { kind: 'zusammen'; game: GameDefinition; tags: string[]; haystack: string }
  | { kind: 'allein'; game: SoloGame; tags: string[]; haystack: string }
  | { kind: 'arena'; game: ArenaGame; tags: string[]; haystack: string };

const SOLO_TAGS = ['Allein', 'Kinder'];
const ARENA_TAGS = ['Allein', 'Arena'];

const search = (...parts: string[]) => normalize(parts.join(' '));

const ENTRIES: Entry[] = [
  ...GAMES.map((game): Entry => ({
    kind: 'zusammen',
    game,
    tags: game.tags,
    haystack: search(game.name, game.tagline, game.description, ...game.tags, 'zusammen gruppe'),
  })),
  ...SOLO_GAMES.map((game): Entry => ({
    kind: 'allein',
    game,
    tags: SOLO_TAGS,
    haystack: search(game.name, game.tagline, game.description, ...game.skills, ...SOLO_TAGS),
  })),
  ...ARENA_GAMES.map((game): Entry => ({
    kind: 'arena',
    game,
    tags: ARENA_TAGS,
    haystack: search(game.name, game.tagline, game.description, ...game.skills, ...ARENA_TAGS, '3D jugendliche'),
  })),
];

/** Alone (1) only the games of «Allein» and the Arena – and the few group games that also work with one person. */
function fitsGroup(entry: Entry, size: number | null): boolean {
  if (size === null) return true;
  if (entry.kind !== 'zusammen') return size === 1;
  const game = entry.game;
  if (game.noGroup) return size > 1;
  return game.minPlayers <= size && size <= game.maxPlayers;
}

/** Group games that can be played first, then «Allein», the Arena and what comes soon. */
function rank(entry: Entry): number {
  if (entry.kind === 'allein') return 1;
  if (entry.kind === 'arena') return 2;
  return entry.game.status === 'available' ? 0 : 3;
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
  const arenaShown = useRewards().arena;
  const entries = useMemo(() => (arenaShown ? ENTRIES : ENTRIES.filter((e) => e.kind !== 'arena')), [arenaShown]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [entries]);

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return entries
      .filter((entry) => {
        if (tag && !entry.tags.includes(tag)) return false;
        if (!fitsGroup(entry, size)) return false;
        return words.every((word) => entry.haystack.includes(word));
      })
      .sort((a, b) => rank(a) - rank(b));
  }, [entries, query, tag, size]);

  const filtering = query !== '' || tag !== null || size !== null;

  const toggle = (gameId: string, name: string, button: HTMLElement) => {
    if (library.includes(gameId)) {
      removeGame(gameId);
      haptic(10);
      toast(`${name} aus deinen Spielen entfernt.`, {
        duration: 6500,
        action: { label: 'Rückgängig', onClick: () => addGame(gameId) },
      });
    } else {
      addGame(gameId);
      sound.unlock();
      sound.pop();
      sound.release();
      haptic([15, 30, 15]);
      const rect = button.getBoundingClientRect();
      confetti({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, count: 70, spread: Math.PI });
      toast(`${name} ist jetzt in deinen Spielen 🎉`, { tone: 'success' });
    }
  };

  const row = (entry: Entry, index: number) => {
    if (entry.kind === 'zusammen') {
      const game = entry.game;
      return (
        <GameRow
          key={game.id}
          game={game}
          index={index}
          inLibrary={library.includes(game.id)}
          onToggle={(button) => toggle(game.id, game.name, button)}
        />
      );
    }
    const game = entry.game;
    const solo = entry.kind === 'allein';
    return (
      <PlayRow
        key={`${entry.kind}-${game.id}`}
        to={`/${solo ? 'allein' : 'arena'}/${game.id}`}
        name={game.name}
        tagline={game.tagline}
        cover={`/covers/${solo ? 'solo' : 'arena'}-${game.id}.webp`}
        emoji={game.emoji}
        colors={game.colors}
        tags={solo ? ['Allein', '6–12 Jahre', game.duration] : ['3D', 'ab 13', game.duration]}
        index={index}
      />
    );
  };

  const total = entries.length;
  const sections = [
    {
      kind: 'zusammen',
      title: 'Zusammen spielen',
      lead: 'Ein Handy für die ganze Runde. Mit + kommt ein Spiel zu «Meine Spiele».',
    },
    { kind: 'allein', title: 'Allein spielen', lead: 'Kurze Runden für Kinder von 6 bis 12 – mit Sternen und Münzen.' },
    { kind: 'arena', title: 'Arena', lead: '3D-Spiele ab 13 – mit Bestzeiten und Familien-Rangliste.' },
  ] as const;

  return (
    <Page title="Entdecken" subtitle={`${total} Spiele – ${arenaShown ? 'zusammen, allein und in 3D' : 'zusammen und allein'}`}>
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
          <GameHero game={featured} eyebrow="⭐ Tagestipp" text={featured.tagline} />
        </div>
      )}

      {results.length === 0 ? (
        <EmptyState mascot="oops" emoji="🔍" title="Nichts gefunden" text="Versuch es mit einem anderen Suchbegriff oder Filter." />
      ) : filtering ? (
        <>
          <h2 className="results-count" aria-live="polite">
            {`${results.length} ${results.length === 1 ? 'Spiel' : 'Spiele'} gefunden`}
          </h2>
          <div className="game-list">{results.map(row)}</div>
        </>
      ) : (
        sections.map((section) => {
          const list = results.filter((e) => e.kind === section.kind);
          if (list.length === 0) return null;
          return (
            <section key={section.kind} className="section discover-section" aria-labelledby={`entdecken-${section.kind}`}>
              <h2 className="section__title" id={`entdecken-${section.kind}`}>
                {section.title} <span className="discover-section__count">{list.length}</span>
              </h2>
              <p className="section__lead">{section.lead}</p>
              <div className="game-list">{list.map(row)}</div>
            </section>
          );
        })
      )}
    </Page>
  );
}
