import { Suspense, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { balance } from '../../../shared/coins.ts';
import { Logo, Mascot } from '../components/Brand.tsx';
import { CoinPill } from '../components/Coins.tsx';
import { FamilyRanking } from '../components/FamilyRanking.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, OfflinePill, Page, Section } from '../components/Layout.tsx';
import { Avatar, Button, ConfirmSheet, Segmented } from '../components/ui.tsx';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { launch } from '../lib/launch.ts';
import { nextMove } from '../lib/transition.ts';
import { breakableName } from '../lib/util.ts';
import { CARS, getCar, getSoloGame, SOLO_GAMES } from '../solo/registry.ts';
import { LEVEL_LABEL, type SoloGame, type SoloLevel, type SoloResult } from '../solo/types.ts';
import { useAuth } from '../store/auth.ts';
import { useData, useRewards, useWallet } from '../store/data.ts';
import { useLearners } from '../store/learners.ts';
import { useGameSettings, useSettings } from '../store/settings.ts';

/*
 * «Allein spielen»: the second area of the «Spiele» tab («Zusammen | Allein»). Short games for one
 * person from 6 to 12 years. With «Belohnungen» on, a round costs coins earned by learning.
 */

export const SOLO = '/allein';

const AREA_PATH = { zusammen: '/', allein: '/allein', arena: '/arena' } as const;

/** «Zusammen | Allein | Arena» at the top of the «Spiele» tab; the tab opens the area used last. Parents can hide the Arena. */
export function PlayAreaSwitch({ area }: { area: 'zusammen' | 'allein' | 'arena' }) {
  const navigate = useNavigate();
  const setPlayArea = useSettings((s) => s.setPlayArea);
  const arena = useRewards().arena;
  // Only a change is stored – writing the same value would rewrite all settings on every visit.
  useEffect(() => {
    if (useSettings.getState().playArea !== area) setPlayArea(area);
  }, [area, setPlayArea]);
  return (
    <div className="learn-area play-area">
      <Segmented
        label="Spielart"
        value={area}
        options={[
          { value: 'zusammen', label: 'Zusammen' },
          { value: 'allein', label: 'Allein' },
          ...(arena ? [{ value: 'arena' as const, label: 'Arena' }] : []),
        ]}
        onChange={(next) => {
          haptic(6);
          const order = ['zusammen', 'allein', 'arena'];
          if (next !== area) nextMove(order.indexOf(next) > order.indexOf(area) ? 'right' : 'left');
          navigate(AREA_PATH[next], { viewTransition: true });
        }}
      />
    </div>
  );
}

/**
 * The top of the three areas of «Spiele»: the logo, the way to the account and the switch. It is the same
 * in every area, so the switch stays where the finger is.
 */
export function PlayTop({ area }: { area: 'zusammen' | 'allein' | 'arena' }) {
  const user = useAuth((s) => s.user);
  return (
    <>
      <header className="home-top">
        <Logo size={38} />
        <div className="page__actions">
          <OfflinePill />
          {user && (
            <Link to="/konto" className="header-avatar" aria-label="Konto">
              <Avatar name={user.name} color={user.color} emoji={user.avatar} size={44} />
            </Link>
          )}
        </div>
      </header>
      <PlayAreaSwitch area={area} />
    </>
  );
}

/** A page of «Allein» or the Arena below that top: title with the marker of the tab, a line about it, the content. */
export function PlayPage({ area, title, subtitle, children }: { area: 'allein' | 'arena'; title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="page">
      <PlayTop area={area} />
      <div className="page__content">
        <h1 className="page__title">
          <span className="page__title-mark">{title}</span>
        </h1>
        <p className="page__subtitle page__lead">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

/** Where «Zurück» leads on a game page: back to «Entdecken» when the game was opened there, else to its area. */
export function useBackTo(area: string): string {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return from === '/entdecken' ? from : area;
}

/** Who plays: the names of «Wer lernt?» (or the account), remembered per device. */
export function usePlayer(): [string, (name: string) => void, { id: string; name: string; color: string }[]] {
  const learners = useLearners();
  const self = useAuth((s) => s.user?.name ?? '');
  const [chosen, setChosen] = useGameSettings<{ player: string }>('allein', { player: '' });
  const known = learners.find((l) => l.name.toLowerCase() === chosen.player.toLowerCase());
  return [known?.name ?? learners[0]?.name ?? self, (player) => setChosen({ player }), learners];
}

export function PlayerChips({ value, onChange, players, coins }: { value: string; onChange: (name: string) => void; players: { id: string; name: string; color: string }[]; coins: boolean }) {
  return (
    <div className="solver-picker" role="radiogroup" aria-label="Wer spielt?">
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          role="radio"
          aria-checked={player.name === value}
          className={`solver-chip ${player.name === value ? 'is-active' : ''}`}
          onClick={() => {
            haptic(5);
            onChange(player.name);
          }}
        >
          <Avatar name={player.name} color={player.color} size={30} />
          <span>{player.name}</span>
          {coins && <CoinPill learner={player.name} className="coin-pill--small" />}
        </button>
      ))}
    </div>
  );
}

function SoloTile({ game, best, index }: { game: SoloGame; best: number | undefined; index: number }) {
  return (
    <Link
      to={`${SOLO}/${game.id}`}
      className="solo-tile"
      style={{ '--c1': game.colors[0], '--c2': game.colors[1], animationDelay: `${index * 60}ms` } as CSSProperties}
      viewTransition
    >
      <span className="solo-tile__cover" aria-hidden="true">
        <img src={`/covers/solo-${game.id}.webp`} alt="" loading="lazy" decoding="async" />
        <span className="solo-tile__emoji">{game.emoji}</span>
      </span>
      <span className="solo-tile__name">{breakableName(game.name)}</span>
      <span className="solo-tile__tag">{game.tagline}</span>
      <span className="solo-tile__skills">{game.skills.join(' · ')}</span>
      {best !== undefined && best > 0 && <span className="solo-tile__best">🏆 {best}</span>}
    </Link>
  );
}

/** /allein – the games, who plays and their coins. */
export function SoloHubPage() {
  const [player, setPlayer, players] = usePlayer();
  const rewards = useRewards();
  const wallet = useWallet(player);
  const [{ level }] = useGameSettings<{ level: SoloLevel }>(`allein-stufe-${player.toLowerCase()}`, { level: 1 });

  return (
    <PlayPage area="allein" title="Allein spielen" subtitle="Kurze Spiele für Reaktion, Merken und Köpfchen.">
      {players.length > 1 && (
        <Section title="Wer spielt?">
          <PlayerChips value={player} onChange={setPlayer} players={players} coins={rewards.enabled} />
        </Section>
      )}
      {rewards.enabled && (
        <div className="coin-card">
          <span className="coin-card__coin" aria-hidden="true">
            🪙
          </span>
          <span className="coin-card__text">
            <strong>
              {player} hat {balance(wallet)} {balance(wallet) === 1 ? 'Münze' : 'Münzen'}
            </strong>
            <small>Eine Runde kostet {rewards.pricePerRound}. Neue Münzen gibt’s fürs Lernen – Karten, Lückentext und Aufgaben.</small>
          </span>
          <Link to="/lernen" className="btn btn--secondary btn--sm" viewTransition>
            Lernen
          </Link>
        </div>
      )}
      <Section title="Spiele">
        <div className="solo-grid">
          {SOLO_GAMES.map((game, i) => (
            <SoloTile key={game.id} game={game} index={i} best={wallet.best[`${game.id}:${level}`]} />
          ))}
        </div>
      </Section>
      {rewards.arena && (
        <Link to="/arena" className="solo-soon" viewTransition>
          <span aria-hidden="true">🚀</span>
          <span>
            <strong>Schon 13?</strong> In der Arena warten acht Spiele in 3D.
          </span>
          <Icon name="next" size={18} strokeWidth={3} />
        </Link>
      )}
      <Link to="/belohnungen" className="solo-rewards-link" viewTransition>
        <Icon name="settings" size={18} />
        <span>Belohnungen einstellen{rewards.enabled ? '' : ' – Münzen fürs Lernen sind aus'}</span>
      </Link>
    </PlayPage>
  );
}

/** /allein/:gameId – start screen, the game, the result. */
export function SoloGamePage() {
  const { gameId } = useParams();
  const game = getSoloGame(gameId);
  const back = useBackTo(SOLO);
  const [player, setPlayer, players] = usePlayer();
  const rewards = useRewards();
  const wallet = useWallet(player);
  const spendCoins = useData((s) => s.spendCoins);
  const unlock = useData((s) => s.unlock);
  const recordBest = useData((s) => s.recordBest);
  const [levelChoice, setLevelChoice] = useGameSettings<{ level: SoloLevel }>(`allein-stufe-${player.toLowerCase()}`, { level: 1 });
  const [carChoice, setCarChoice] = useGameSettings<{ car: string }>(`allein-auto-${player.toLowerCase()}`, { car: 'flitzer' });
  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<(SoloResult & { record: boolean }) | null>(null);
  const [buy, setBuy] = useState<string | null>(null);
  const level = levelChoice.level;
  const price = rewards.enabled ? rewards.pricePerRound : 0;
  const coins = balance(wallet);
  const owned = (carId: string) => !rewards.enabled || getCar(carId).price === 0 || wallet.unlocks.includes(`auto:${carId}`);
  const car = owned(carChoice.car) ? getCar(carChoice.car) : CARS[0];
  const best = game ? wallet.best[`${game.id}:${level}`] : undefined;

  const finish = useCallback(
    (outcome: SoloResult) => {
      if (!game) return;
      const record = recordBest(player, `${game.id}:${level}`, outcome.score);
      setResult({ ...outcome, record });
      setPhase('result');
      if (record || outcome.stars >= 3) {
        sound.fanfare();
        confetti({ count: 160 });
      } else {
        sound.ding();
      }
    },
    [game, level, player, recordBest],
  );
  const quit = useCallback(() => setPhase('start'), []);
  // Keep the sound awake while playing (the music of Beat-Bahn, the effects of the others).
  useEffect(() => {
    if (phase !== 'play') return;
    sound.hold();
    return () => sound.release();
  }, [phase]);

  if (!game) return <Navigate to={SOLO} replace />;

  const start = () => {
    sound.unlock();
    if (price > 0 && !spendCoins(player, price, game.name)) return;
    if (price > 0) sound.coin();
    launch(
      { colors: game.colors, emoji: game.emoji },
      () => {
        setRound((r) => r + 1);
        setResult(null);
        setPhase('play');
      },
      140,
    );
  };
  const canPay = coins >= price;

  if (phase === 'play') {
    const Play = game.Play;
    return (
      <Suspense fallback={<div className="solo-loading" aria-busy="true" />}>
        <Play key={round} level={level} player={player} car={car.id} onFinish={finish} onQuit={quit} />
      </Suspense>
    );
  }

  if (phase === 'result' && result) {
    return (
      <Page title={breakableName(game.name)} back={back} className="solo-result-page">
        <div className="solo-result">
          <Mascot size={130} mood={result.stars >= 3 ? 'party' : result.stars >= 1 ? 'happy' : 'wink'} />
          <p className="solo-result__stars" aria-label={`${result.stars} von 3 Sternen`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < result.stars ? 'is-on' : ''} style={{ animationDelay: `${300 + i * 200}ms` }}>
                ★
              </span>
            ))}
          </p>
          <p className="solo-result__score">{result.score} Punkte</p>
          {result.record ? <p className="solo-result__record">🏆 Neuer Rekord für {player}!</p> : best ? <p className="solo-result__best">Rekord: {best} Punkte</p> : null}
          <p className="solo-result__summary">{result.summary}</p>
        </div>
        <Section title={`Familie · ${LEVEL_LABEL[level]}`}>
          <FamilyRanking scoreKey={`${game.id}:${level}`} current={player} />
        </Section>
        <BottomBar>
          <div className="solve-nav">
            <Link to={SOLO} className="btn btn--secondary" viewTransition>
              Andere Spiele
            </Link>
            <Button icon="refresh" disabled={!canPay} onClick={start}>
              {price > 0 ? `Nochmals · ${price} 🪙` : 'Nochmals'}
            </Button>
          </div>
        </BottomBar>
        {!canPay && <p className="notice notice--info solo-broke">Für eine weitere Runde fehlen {price - coins} Münzen – lern ein paar Karten!</p>}
      </Page>
    );
  }

  const buyCar = buy ? getCar(buy) : null;
  return (
    <Page title={breakableName(game.name)} subtitle={game.tagline} back={back} className="solo-start">
      <div className="solo-hero" style={{ '--c1': game.colors[0], '--c2': game.colors[1] } as CSSProperties}>
        <span className="solo-hero__cover" aria-hidden="true">
          <img src={`/covers/solo-${game.id}.webp`} alt="" decoding="async" />
          <span className="solo-hero__emoji">{game.emoji}</span>
        </span>
        <p>{game.description}</p>
        <p className="solo-hero__meta">
          {game.skills.join(' · ')} · {game.duration}
        </p>
      </div>

      {players.length > 1 && (
        <Section title="Wer spielt?">
          <PlayerChips value={player} onChange={setPlayer} players={players} coins={rewards.enabled} />
        </Section>
      )}

      <Section title="Alter">
        <Segmented
          label="Alter"
          value={String(level)}
          options={([1, 2] as SoloLevel[]).map((l) => ({ value: String(l), label: LEVEL_LABEL[l] }))}
          onChange={(value) => setLevelChoice({ level: Number(value) as SoloLevel })}
        />
        {best ? <p className="solo-best">🏆 Rekord von {player}: {best} Punkte</p> : null}
      </Section>

      {game.id === 'rennen' && (
        <Section title="Garage">
          <div className="garage" role="radiogroup" aria-label="Auto">
            {CARS.map((c) => {
              const mine = owned(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={car.id === c.id}
                  className={`garage__car ${car.id === c.id ? 'is-active' : ''} ${mine ? '' : 'is-locked'}`}
                  onClick={() => {
                    haptic(6);
                    if (mine) setCarChoice({ car: c.id });
                    else setBuy(c.id);
                  }}
                >
                  <span className="garage__body" style={{ background: c.color }} aria-hidden="true" />
                  <span className="garage__name">{c.name}</span>
                  <span className="garage__perk">{c.perk}</span>
                  {!mine && <span className="garage__price">🔒 {c.price} 🪙</span>}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Familie">
        <FamilyRanking scoreKey={`${game.id}:${level}`} current={player} />
      </Section>

      <Section title="So geht’s">
        <Fold title="Regeln" icon="sparkles">
          <ol className="rules">
            {game.rules[level].map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </Fold>
      </Section>

      <BottomBar>
        {rewards.enabled && (
          <p className="solo-price">
            {player}: {coins} 🪙{!canPay && ` · es fehlen ${price - coins}`}
          </p>
        )}
        <Button size="lg" block icon="play" disabled={!canPay} onClick={start}>
          {price > 0 ? `Spielen · ${price} 🪙` : 'Spielen'}
        </Button>
      </BottomBar>

      <ConfirmSheet
        open={buyCar !== null}
        onClose={() => setBuy(null)}
        title={buyCar ? `${buyCar.name} kaufen?` : ''}
        message={
          buyCar
            ? coins >= buyCar.price
              ? `${buyCar.perk}. Kostet ${buyCar.price} Münzen – ${player} hat ${coins}.`
              : `${buyCar.perk}. Kostet ${buyCar.price} Münzen – ${player} hat erst ${coins}. Weiter lernen!`
            : ''
        }
        confirmLabel={buyCar && coins >= buyCar.price ? `Für ${buyCar.price} 🪙 kaufen` : 'OK'}
        onConfirm={() => {
          if (buyCar && coins >= buyCar.price && unlock(player, `auto:${buyCar.id}`, buyCar.price, `Auto «${buyCar.name}»`)) {
            setCarChoice({ car: buyCar.id });
            sound.fanfare();
            confetti({ count: 120 });
          }
          setBuy(null);
        }}
      />
    </Page>
  );
}
