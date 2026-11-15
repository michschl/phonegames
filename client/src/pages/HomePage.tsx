import { Link } from 'react-router';
import { GameTile } from '../components/GameCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Page } from '../components/Layout.tsx';
import { Avatar, EmptyState } from '../components/ui.tsx';
import { getGame } from '../games/registry.ts';
import { isStandalone } from '../lib/device.ts';
import { promptInstall, usePwa } from '../lib/pwa.ts';
import { useAuth } from '../store/auth.ts';
import { useGroups, useLibraryIds } from '../store/data.ts';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Hoi';
  return 'Guten Abend';
}

export function HomePage() {
  const user = useAuth((s) => s.user)!;
  const ids = useLibraryIds();
  const groups = useGroups();
  const installEvent = usePwa((s) => s.installEvent);
  const games = ids.map((id) => getGame(id)).filter((g) => g !== undefined);
  const firstName = user.name.split(' ')[0];

  return (
    <Page
      title={
        <>
          {greeting()}, {firstName}! <span className="wave">👋</span>
        </>
      }
      subtitle="Worauf habt ihr heute Lust?"
      actions={
        <Link to="/konto" className="header-avatar" aria-label="Konto">
          <Avatar name={user.name} color={user.color} emoji={user.avatar} size={40} />
        </Link>
      }
    >
      {installEvent && !isStandalone() && (
        <button type="button" className="install-banner" onClick={() => void promptInstall()}>
          <span className="install-banner__icon">
            <Icon name="phone" />
          </span>
          <span>
            <strong>Plausch installieren</strong>
            <small>Direkt vom Startbildschirm starten – auch offline.</small>
          </span>
          <Icon name="next" />
        </button>
      )}

      {games.length === 0 ? (
        <EmptyState
          emoji="🎲"
          title="Noch keine Spiele"
          text="Stöbere im Katalog und füge Spiele zu deiner Liste hinzu."
          action={
            <Link to="/entdecken" className="btn btn--primary btn--lg" viewTransition>
              <Icon name="compass" />
              <span>Spiele entdecken</span>
            </Link>
          }
        />
      ) : (
        <>
          <h2 className="section__title">Meine Spiele</h2>
          <div className="tile-grid">
            {games.map((game, i) => (
              <GameTile key={game.id} game={game} index={i} />
            ))}
            <Link to="/entdecken" className="tile-more" viewTransition>
              <Icon name="plus" size={26} />
              <span>Mehr Spiele entdecken</span>
            </Link>
          </div>
        </>
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
    </Page>
  );
}
