import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { Mascot } from '../components/Brand.tsx';
import { Page, Section } from '../components/Layout.tsx';
import { PlayerEditor } from '../components/PlayerEditor.tsx';
import { Button, EmptyState } from '../components/ui.tsx';
import { getGame } from '../games/registry.ts';
import type { GameDefinition } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { breakableName } from '../lib/util.ts';
import { useData, useGroup, useGroups, useLibraryIds } from '../store/data.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';
import { toast } from '../store/ui.ts';
import { GroupPicker } from './GroupsPage.tsx';

/** Pick the group to preselect: last used for this game, else the first one. */
function useSelectedGroup(gameId: string) {
  const groups = useGroups();
  const lastGroupId = useSettings((s) => s.lastGroupByGame[gameId]);
  const setLastGroup = useSettings((s) => s.setLastGroup);
  const fallback = groups.find((g) => g.id === lastGroupId)?.id ?? groups[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(fallback);
  const valid = groups.some((g) => g.id === selectedId) ? selectedId : fallback;
  return {
    selectedId: valid,
    select: (id: string) => {
      setSelectedId(id);
      setLastGroup(gameId, id);
    },
  };
}

export function GameSetupPage() {
  const { gameId } = useParams();
  const game = getGame(gameId);
  if (!game || game.status !== 'available') {
    return (
      <Page title="Spiel" back="/">
        <EmptyState emoji="🧐" title="Spiel nicht gefunden" text="Dieses Spiel gibt es (noch) nicht." />
      </Page>
    );
  }
  return <GameSetup key={game.id} game={game} />;
}

function GameSetup({ game }: { game: GameDefinition }) {
  const navigate = useNavigate();
  const library = useLibraryIds();
  const addGame = useData((s) => s.addGame);
  const createGroup = useData((s) => s.createGroup);
  const setLastGroup = useSettings((s) => s.setLastGroup);
  const setLastPlayed = useSettings((s) => s.setLastPlayed);
  const { selectedId, select } = useSelectedGroup(game.id);
  const group = useGroup(selectedId);
  const [settings, setSettings] = useGameSettings(game.id, game.defaultSettings ?? {});
  const inLibrary = library.includes(game.id);
  const customised = useMemo(() => {
    const defaults = (game.defaultSettings ?? {}) as Record<string, unknown>;
    const current = settings as Record<string, unknown>;
    const prepared = (game.prepareKeys ?? []) as string[];
    return Object.keys(defaults)
      .filter((key) => !prepared.includes(key))
      .some((key) => JSON.stringify(current[key]) !== JSON.stringify(defaults[key]));
  }, [game.defaultSettings, game.prepareKeys, settings]);

  const playerCount = group?.players.length ?? 0;
  const needed = game.playersNeeded?.(settings) ?? game.minPlayers;
  const missing = game.noGroup ? 0 : Math.max(0, needed - playerCount);
  // The component is keyed by game, so the hook order never changes.
  const blocker = game.useBlocker?.(settings) ?? null;
  const canStart = !blocker && (game.noGroup || (!!group && missing === 0));

  const start = () => {
    if (!canStart) return;
    sound.unlock(); // must happen inside the tap for iOS
    haptic(20);
    if (group) setLastGroup(game.id, group.id);
    setLastPlayed(game.id, game.noGroup ? undefined : group?.id);
    navigate(`/spiel/${game.id}/los`, { viewTransition: true });
  };

  return (
    <Page title={breakableName(game.name)} back={inLibrary ? '/' : '/entdecken'} className="setup">
      <div className="setup-hero" style={{ '--g1': game.colors[0], '--g2': game.colors[1] } as CSSProperties}>
        <div className="setup-hero__art">{game.Art ? <game.Art size={130} /> : <span>{game.emoji}</span>}</div>
        <div className="setup-hero__text">
          <p className="setup-hero__tagline">{game.tagline}</p>
          <div className="setup-hero__meta">
            <span>
              <Icon name="users" size={15} /> {game.minPlayers}–{game.maxPlayers}
            </span>
            <span>
              <Icon name="clock" size={15} /> {game.duration}
            </span>
            <span>{game.age}</span>
          </div>
        </div>
        {!inLibrary && (
          <button
            type="button"
            className="setup-hero__add"
            onClick={() => {
              addGame(game.id);
              haptic(12);
              toast(`${game.name} ist jetzt in deinen Spielen 🎉`, { tone: 'success' });
            }}
          >
            <Icon name="plus" size={18} /> Zu meinen Spielen
          </button>
        )}
      </div>

      {game.rules && (
        <Fold title="So geht’s" icon="sparkles" meta={`${game.rules.length} Schritte`}>
          <ol className="rules">
            {game.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </Fold>
      )}

      {game.Prepare && <game.Prepare value={settings} onChange={setSettings} />}

      {!game.noGroup && (
      <Section title="Spielgruppe">
        {selectedId ? (
          <>
            <GroupPicker selectedId={selectedId} onSelect={select} />
            {group && <PlayerEditor group={group} />}
          </>
        ) : (
          <div className="setup-nogroup">
            <p>Wer spielt mit? Erstelle eine Gruppe und füge die Namen hinzu.</p>
            <Button
              icon="plus"
              onClick={() => {
                const created = createGroup({ name: 'Meine Runde' });
                select(created.id);
              }}
            >
              Gruppe erstellen
            </Button>
          </div>
        )}
      </Section>
      )}

      {game.Settings && (
        <Fold
          title="Einstellungen"
          icon="settings"
          meta={<span className={`fold__tag ${customised ? 'is-custom' : ''}`}>{customised ? 'Angepasst' : 'Standard'}</span>}
          className="fold--settings"
        >
          <game.Settings value={settings} onChange={setSettings} />
        </Fold>
      )}

      <div className="start-bar">
        <Button size="lg" block icon="play" onClick={start} disabled={!canStart}>
          {blocker
            ? blocker
            : game.noGroup
            ? 'Spiel starten'
            : missing > 0
              ? `Noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} hinzufügen`
              : `Spiel starten · ${playerCount} ${playerCount === 1 ? 'Person' : 'Personen'}`}
        </Button>
      </div>
    </Page>
  );
}

export function GamePlayPage() {
  const { gameId } = useParams();
  const game = getGame(gameId);
  const navigate = useNavigate();
  const groupId = useSettings((s) => (gameId ? s.lastGroupByGame[gameId] : undefined));
  const group = useGroup(groupId);
  const [settings] = useGameSettings(game?.id ?? '', game?.defaultSettings ?? {});

  // Freeze the players for the running game.
  const players = useMemo(() => group?.players ?? [], [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.add('is-playing');
    // Sound is wanted while the game is open and released afterwards (no lingering iOS media session).
    sound.hold();
    return () => {
      document.documentElement.classList.remove('is-playing');
      sound.release();
    };
  }, []);

  if (!game?.Play || game.status !== 'available') return <Navigate to="/" replace />;
  const needed = game.playersNeeded?.(settings) ?? game.minPlayers;
  if (!game.noGroup && (!group || players.length < needed)) return <Navigate to={`/spiel/${game.id}`} replace />;

  const Play = game.Play;
  return (
    <div className="play-screen">
      <Suspense
        fallback={
          <div className="play-loading">
            <Mascot size={110} mood="wink" />
            Gleich geht’s los …
          </div>
        }
      >
        <Play
          players={players}
          settings={settings}
          onExit={() => navigate(`/spiel/${game.id}`, { replace: true, viewTransition: true })}
        />
      </Suspense>
    </div>
  );
}
