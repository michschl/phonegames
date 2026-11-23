import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { Mascot } from '../components/Brand.tsx';
import { BottomBar, cameFrom, Page, Section } from '../components/Layout.tsx';
import { PlayerEditor } from '../components/PlayerEditor.tsx';
import { Button, EmptyState } from '../components/ui.tsx';
import { getGame } from '../games/registry.ts';
import type { GameDefinition } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { launch } from '../lib/launch.ts';
import { breakableName } from '../lib/util.ts';
import { useData, useGroup, useGroups, useLibraryIds } from '../store/data.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';
import { toast } from '../store/ui.ts';
import { GroupPicker } from './GroupsPage.tsx';
import { FamilyTotals } from '../components/FamilyRanking.tsx';
import { endSession, startSession } from '../games/shared/results.ts';

/** Pick the group to preselect: one asked for (?gruppe=…), the last used for this game, else the first one. */
export function useSelectedGroup(gameId: string) {
  const groups = useGroups();
  const [params] = useSearchParams();
  const lastGroupId = useSettings((s) => s.lastGroupByGame[gameId]);
  const setLastGroup = useSettings((s) => s.setLastGroup);
  const fallback = groups.find((g) => g.id === lastGroupId)?.id ?? groups[0]?.id;
  const [selectedId, setSelectedId] = useState<string | undefined>(() => groups.find((g) => g.id === params.get('gruppe'))?.id ?? fallback);
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
  if (game.pathFor) return <GameElsewhere game={game} />;
  return <GameSetup key={game.id} game={game} />;
}

/** A game with its own pages (Lernen): the setup screen leads there. */
function GameElsewhere({ game }: { game: GameDefinition }) {
  const [settings] = useGameSettings(game.id, game.defaultSettings ?? {});
  return <Navigate to={game.pathFor!(settings)} replace />;
}

/** «Wer spielt mit?»: choose a group and edit its people – or create the first group. */
export function GroupSection({
  title = 'Spielgruppe',
  selectedId,
  onSelect,
}: {
  title?: string;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const group = useGroup(selectedId);
  const createGroup = useData((s) => s.createGroup);
  return (
    <Section title={title}>
      {selectedId ? (
        <>
          <GroupPicker selectedId={selectedId} onSelect={onSelect} />
          {group && <PlayerEditor group={group} />}
        </>
      ) : (
        <div className="setup-nogroup">
          <p>Wer spielt mit? Erstelle eine Gruppe und füge die Namen hinzu.</p>
          <Button
            icon="plus"
            onClick={() => {
              const created = createGroup({ name: 'Meine Runde' });
              onSelect(created.id);
            }}
          >
            Gruppe erstellen
          </Button>
        </div>
      )}
    </Section>
  );
}

/**
 * Too few people to start: the big button is no dead end – it leads to the field for the names, and
 * creates the first group to put them in when there is none.
 */
export function useAddMissing(groupId: string | undefined, select: (id: string) => void): () => void {
  const createGroup = useData((s) => s.createGroup);
  return () => {
    if (!groupId) select(createGroup({ name: 'Meine Runde' }).id);
    // After the render that shows the field of a new group.
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.setup .player-editor__input');
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input?.focus({ preventScroll: true });
    }, 60);
  };
}

function GameSetup({ game }: { game: GameDefinition }) {
  const navigate = useNavigate();
  const library = useLibraryIds();
  const addGame = useData((s) => s.addGame);
  const setLastGroup = useSettings((s) => s.setLastGroup);
  const setLastPlayed = useSettings((s) => s.setLastPlayed);
  const { selectedId, select } = useSelectedGroup(game.id);
  const group = useGroup(selectedId);
  const [settings, setSettings] = useGameSettings(game.id, game.defaultSettings ?? {});
  const inLibrary = library.includes(game.id);
  const customised = useMemo(() => {
    const defaults = (game.defaultSettings ?? {}) as Record<string, unknown>;
    const current = settings as Record<string, unknown>;
    return Object.keys(defaults).some((key) => JSON.stringify(current[key]) !== JSON.stringify(defaults[key]));
  }, [game.defaultSettings, settings]);

  const playerCount = group?.players.length ?? 0;
  const needed = game.playersNeeded?.(settings) ?? game.minPlayers;
  const missing = game.noGroup ? 0 : Math.max(0, needed - playerCount);
  const canStart = game.noGroup || (!!group && missing === 0);

  const addMissing = useAddMissing(group?.id, select);
  // «Zurück» leads to the list the game was opened from; opened directly, to where it is listed.
  const from = cameFrom();
  const back = from === '/' || from === '/entdecken' ? from : inLibrary ? '/' : '/entdecken';

  const start = () => {
    if (!canStart) return;
    sound.unlock(); // must happen inside the tap for iOS
    haptic(20);
    if (group) setLastGroup(game.id, group.id);
    setLastPlayed(game.id, game.noGroup ? undefined : group?.id);
    launch({ colors: game.colors, emoji: game.emoji }, () => navigate(`/spiel/${game.id}/los`));
  };

  return (
    <Page title={breakableName(game.name)} back={back} className="setup">
      <div className="setup-hero" style={{ '--g1': game.colors[0], '--g2': game.colors[1] } as CSSProperties}>
        <div className="setup-hero__art">{game.Art ? <game.Art size={130} /> : <span>{game.emoji}</span>}</div>
        <div className="setup-hero__text">
          <p className="setup-hero__tagline">{game.tagline}</p>
        </div>
        {/* Below the picture, over the whole width: the three facts stay on one line. */}
        <div className="setup-hero__meta">
          <span>
            <Icon name="users" size={15} /> {game.noGroup ? 'alle' : `${game.minPlayers}–${game.maxPlayers}`}
          </span>
          <span>
            <Icon name="clock" size={15} /> {game.duration}
          </span>
          <span>{game.age}</span>
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

      {!game.noGroup && <GroupSection selectedId={selectedId} onSelect={select} />}

      {game.scored && (
        <Fold title="Rangliste der Familie" icon="trophy" meta="alle Partien">
          <FamilyTotals gameId={game.id} winsOnly={game.scored === 'wins'} />
        </Fold>
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

      <BottomBar>
        {canStart ? (
          <Button size="lg" block icon="play" onClick={start}>
            {game.noGroup ? 'Spiel starten' : `Spiel starten · ${playerCount} ${playerCount === 1 ? 'Person' : 'Personen'}`}
          </Button>
        ) : (
          /* Not ready yet – the button is no dead end: it leads to what is missing. */
          <Button size="lg" block variant="secondary" icon="plus" onClick={addMissing}>
            {group ? `Noch ${missing} ${missing === 1 ? 'Person' : 'Personen'} hinzufügen` : 'Mitspielende hinzufügen'}
          </Button>
        )}
      </BottomBar>
    </Page>
  );
}

/** While a game is open: no tab bar, sound kept awake and released afterwards (no lingering iOS media session). */
export function usePlayScreen(): void {
  useEffect(() => {
    document.documentElement.classList.add('is-playing');
    sound.hold();
    return () => {
      document.documentElement.classList.remove('is-playing');
      sound.release();
    };
  }, []);
}

export function PlayLoading() {
  return (
    <div className="play-loading">
      <Mascot size={110} mood="wink" />
      Gleich geht’s los …
    </div>
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

  usePlayScreen();

  // Points per person: the game reports them, leaving the game adds them to the family totals.
  useEffect(() => {
    if (!game?.scored) return;
    startSession(game.id, players);
    return () => endSession();
  }, [game?.id, game?.scored, players]);

  if (!game?.Play || game.status !== 'available') return <Navigate to="/" replace />;
  // After the game: its setup screen, or its own page (Lernen: «Wer spielt mit?» of the stack).
  const home = game.pathFor?.(settings) ?? `/spiel/${game.id}`;
  const needed = game.playersNeeded?.(settings) ?? game.minPlayers;
  if (!game.noGroup && (!group || players.length < needed)) return <Navigate to={home} replace />;

  const Play = game.Play;
  return (
    <div className="play-screen">
      <Suspense fallback={<PlayLoading />}>
        <Play
          players={players}
          settings={settings}
          onExit={() => navigate(home, { replace: true, viewTransition: true })}
        />
      </Suspense>
    </div>
  );
}
