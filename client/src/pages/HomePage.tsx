import { Link } from 'react-router';
import { Logo } from '../components/Brand.tsx';
import { GameHero, GameMini, GameTile } from '../components/GameCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { OfflinePill } from '../components/Layout.tsx';
import { LearnDue } from '../components/LearnDue.tsx';
import { PasskeyHint } from '../components/PasskeyHint.tsx';
import { Avatar, EmptyState } from '../components/ui.tsx';
import { GAMES, getGame } from '../games/registry.ts';
import type { GameDefinition } from '../games/types.ts';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic, isStandalone } from '../lib/device.ts';
import { promptInstall, usePwa } from '../lib/pwa.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useGroup, useGroups, useLibraryIds } from '../store/data.ts';
import { useSettings } from '../store/settings.ts';
import { toast } from '../store/ui.ts';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Noch wach';
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Hoi';
  return 'Guten Abend';
}

export function HomePage() {
  const user = useAuth((s) => s.user)!;
  const ids = useLibraryIds();
  const groups = useGroups();
  const addGame = useData((s) => s.addGame);
  const lastPlayed = useSettings((s) => s.lastPlayed);
  const lastGroup = useGroup(lastPlayed?.groupId);
  const installEvent = usePwa((s) => s.installEvent);

  const games = ids
    .map((id) => getGame(id))
    .filter((g): g is GameDefinition => g !== undefined && g.status === 'available');
  const suggestions = GAMES.filter((g) => g.status === 'available' && !ids.includes(g.id));
  const continueGame = lastPlayed ? getGame(lastPlayed.gameId) : undefined;
  const storedSettings = useSettings((s) => (continueGame ? s.gameSettings[continueGame.id] : undefined));
  const continueSettings = { ...(continueGame?.defaultSettings ?? {}), ...(storedSettings as object | undefined) };
  const firstName = user.name.split(' ')[0];

  const quickAdd = (gameId: string, name: string, button: HTMLElement) => {
    addGame(gameId);
    sound.unlock();
    sound.pop();
    sound.release();
    haptic([15, 30, 15]);
    const r = button.getBoundingClientRect();
    confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 60, spread: Math.PI });
    toast(`${name} ist jetzt in deinen Spielen 🎉`, { tone: 'success' });
  };

  return (
    <main className="page home">
      <header className="home-top">
        <Logo size={38} />
        <div className="page__actions">
          <OfflinePill />
          <Link to="/konto" className="header-avatar" aria-label="Konto">
            <Avatar name={user.name} color={user.color} emoji={user.avatar} size={44} />
          </Link>
        </div>
      </header>

      <div className="page__content">
        <h1 className="home-greeting">
          {greeting()}, <span className="home-greeting__name">{firstName}</span>! <span className="wave">👋</span>
        </h1>
        <p className="page__subtitle">Worauf habt ihr heute Lust?</p>

        {continueGame && continueGame.status === 'available' ? (
          <div className="home-hero">
            <GameHero
              game={continueGame}
              // Back to where it was played: Lernen → the stack and «Wer spielt mit?», others → their setup screen.
              to={continueGame.pathFor ? continueGame.pathFor(continueSettings) : undefined}
              eyebrow="Weiterspielen"
              text={
                lastGroup
                  ? `mit ${lastGroup.name} · ${lastGroup.players.length} ${lastGroup.players.length === 1 ? 'Person' : 'Personen'}`
                  : continueGame.tagline
              }
            />
          </div>
        ) : games[0] ? (
          <div className="home-hero">
            <GameHero game={games[0]} eyebrow="Jetzt spielen" text={games[0].tagline} />
          </div>
        ) : null}

        <LearnDue />

        <PasskeyHint />

        {installEvent && !isStandalone() && (
          <button type="button" className="install-banner" onClick={() => void promptInstall()}>
            <span className="install-banner__icon">
              <Icon name="phone" />
            </span>
            <span>
              <strong>Phonegames installieren</strong>
              <small>Direkt vom Startbildschirm starten – auch offline.</small>
            </span>
            <Icon name="next" />
          </button>
        )}

        {games.length === 0 ? (
          <EmptyState
            mascot="wow"
            emoji="🎲"
            title="Noch keine Spiele"
            text="Such dir ein paar Spiele aus – Phoni freut sich schon auf den Spieleabend!"
            action={
              <Link to="/entdecken" className="btn btn--primary btn--lg" viewTransition>
                <Icon name="compass" />
                <span>Spiele entdecken</span>
              </Link>
            }
          />
        ) : (
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Meine Spiele</h2>
              <span className="count-badge">{games.length}</span>
            </div>
            <div className="tile-grid">
              {games.map((game, i) => (
                <GameTile key={game.id} game={game} index={i} />
              ))}
              <Link to="/entdecken" className="tile-more" viewTransition>
                <span className="tile-more__plus">
                  <Icon name="plus" size={24} strokeWidth={3} />
                </span>
                <span>Mehr Spiele</span>
              </Link>
            </div>
          </section>
        )}

        {suggestions.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Neu für euch</h2>
              <Link to="/entdecken" className="section__link" viewTransition>
                Alle ansehen
              </Link>
            </div>
            <div className="rail">
              {suggestions.slice(0, 8).map((game, i) => (
                <GameMini key={game.id} game={game} index={i} onAdd={(button) => quickAdd(game.id, game.name, button)} />
              ))}
            </div>
          </section>
        )}

        {games.length > 0 && groups.length === 0 && (
          <Link to="/gruppen" className="hint-card" viewTransition>
            <span className="hint-card__emoji" aria-hidden="true">
              👯
            </span>
            <span>
              <strong>Tipp:</strong> Lege eine Spielgruppe an – dann sind beim nächsten Spieleabend alle sofort dabei.
            </span>
          </Link>
        )}
      </div>
    </main>
  );
}
