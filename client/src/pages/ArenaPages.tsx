import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { balance } from '../../../shared/coins.ts';
import { arenaKey, ARENA_GAMES, getArenaGame } from '../arena/registry.ts';
import type { ArenaGame, ArenaResult } from '../arena/types.ts';
import { ARENA_SETTINGS, hasWebGL, type ArenaGraphics } from '../arena/support.ts';
import { tiltAvailable } from '../arena/input.ts';
import { Mascot } from '../components/Brand.tsx';
import { FamilyRanking } from '../components/FamilyRanking.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { BottomBar, Page, Section } from '../components/Layout.tsx';
import { Button, ConfirmSheet, Segmented } from '../components/ui.tsx';
import { sound } from '../lib/audio.ts';
import { confetti } from '../lib/confetti.ts';
import { haptic } from '../lib/device.ts';
import { requestTiltPermission } from '../lib/motion.ts';
import { familyRanking, placeOf } from '../lib/ranking.ts';
import { useData, useRewards, useWallet } from '../store/data.ts';
import { useGameSettings } from '../store/settings.ts';
import { PlayAreaSwitch, PlayerChips, usePlayer } from './SoloPages.tsx';

/*
 * «Arena» (/arena): 3D games for teenagers from 13, the third area of the «Spiele» tab. Parents can hide
 * it under «Belohnungen». Records count for the family leaderboard.
 */

export const ARENA = '/arena';

function ArenaTile({ game, index, best }: { game: ArenaGame; index: number; best: number | undefined }) {
  return (
    <Link
      to={`${ARENA}/${game.id}`}
      className="arena-tile"
      style={{ '--c1': game.colors[0], '--c2': game.colors[1], animationDelay: `${index * 70}ms` } as CSSProperties}
      viewTransition
    >
      <span className="arena-tile__glow" aria-hidden="true" />
      <span className="arena-tile__emoji" aria-hidden="true">
        {game.emoji}
      </span>
      <span className="arena-tile__name">{game.name}</span>
      <span className="arena-tile__tag">{game.tagline}</span>
      <span className="arena-tile__skills">{game.skills.join(' · ')}</span>
      {best !== undefined && best > 0 && (
        <span className="arena-tile__best">
          🏆 {best.toLocaleString('de-CH')}
          {game.levels ? ` / ${game.levels}` : ''}
        </span>
      )}
    </Link>
  );
}

/** /arena */
export function ArenaHubPage() {
  const rewards = useRewards();
  const [player, setPlayer, players] = usePlayer();
  const wallet = useWallet(player);
  const [look, setLook] = useGameSettings<{ grafik: ArenaGraphics }>(ARENA_SETTINGS, { grafik: 'auto' });
  if (!rewards.arena) return <Navigate to="/allein" replace />;
  return (
    <Page title="Arena" subtitle="3D-Spiele ab 13 – mit Familien-Rangliste.">
      <PlayAreaSwitch area="arena" />
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
            <small>Eine Runde kostet {rewards.pricePerRound}. Skins gibt es ab 25 Münzen.</small>
          </span>
        </div>
      )}
      <Section title="Spiele">
        <div className="arena-grid">
          {ARENA_GAMES.map((game, i) => (
            <ArenaTile key={game.id} game={game} index={i} best={wallet.best[arenaKey(game, 0)]} />
          ))}
        </div>
      </Section>
      <Section title="Grafik">
        <Segmented
          label="Grafik"
          value={look.grafik}
          options={[
            { value: 'auto', label: 'Automatisch' },
            { value: 'schoen', label: 'Schön' },
            { value: 'schnell', label: 'Schnell' },
          ]}
          onChange={(grafik) => setLook({ grafik })}
        />
        <p className="settings-panel__hint arena-mode-hint">
          {look.grafik === 'auto'
            ? 'Leuchten, Spiegelungen und Partikel – läuft es nicht flüssig, schaltet das Spiel sie von selbst ab.'
            : look.grafik === 'schoen'
              ? 'Immer mit allen Effekten, auch wenn es einmal ruckelt.'
              : 'Ohne Leuchteffekte: schont den Akku und läuft auch auf älteren Handys flüssig.'}
        </p>
      </Section>
      {!hasWebGL() && <p className="notice notice--warn">Dieses Gerät kann leider keine 3D-Grafik anzeigen.</p>}
    </Page>
  );
}

/** Kugelbahn: the levels – the next after the highest finished one is open. */
function LevelPicker({ value, onChange, reached, times, count, prefix }: { value: number; onChange: (level: number) => void; reached: number; times: Record<string, number>; count: number; prefix: string }) {
  return (
    <div className="level-grid" role="radiogroup" aria-label="Level">
      {Array.from({ length: count }, (_, i) => {
        const open = i <= reached;
        const done = i < reached;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`Level ${i + 1}${done ? ', geschafft' : open ? '' : ', noch gesperrt'}`}
            disabled={!open}
            className={`level-cell ${value === i ? 'is-active' : ''} ${done ? 'is-done' : ''}`}
            onClick={() => {
              haptic(5);
              onChange(i);
            }}
          >
            {open ? i + 1 : '🔒'}
            {done && times[`${prefix}:L${i + 1}`] ? <small>★</small> : null}
          </button>
        );
      })}
    </div>
  );
}

/** /arena/:gameId – start, the game, the result. */
export function ArenaGamePage() {
  const { gameId } = useParams();
  const game = getArenaGame(gameId);
  const rewards = useRewards();
  const [player, setPlayer, players] = usePlayer();
  const wallet = useWallet(player);
  const wallets = useData((s) => s.wallets);
  const spendCoins = useData((s) => s.spendCoins);
  const unlock = useData((s) => s.unlock);
  const recordBest = useData((s) => s.recordBest);
  const id = game?.id ?? 'none';
  const [choice, setChoice] = useGameSettings<{ skin: string; option: number; tilt: boolean; mode: number }>(`arena-${id}-${player.toLowerCase()}`, {
    skin: '',
    option: 0,
    tilt: false,
    mode: 0,
  });
  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<(ArenaResult & { record: boolean; key: string }) | null>(null);
  const [buy, setBuy] = useState<string | null>(null);
  const webgl = useMemo(() => hasWebGL(), []);

  const levelCount = game?.levels ?? 0;
  const reached = Math.min(Math.max(0, levelCount - 1), wallet.best[`${id}:level`] ?? 0);
  const owned = (skinId: string) => {
    const skin = game?.skins.find((s) => s.id === skinId);
    return !!skin && (!rewards.enabled || skin.price === 0 || wallet.unlocks.includes(`${id}:${skinId}`));
  };
  const skin = game ? (owned(choice.skin) ? game.skins.find((s) => s.id === choice.skin)! : game.skins[0]!) : null;
  const option = levelCount ? Math.min(choice.option, reached) : Math.min(choice.option, (game?.options?.values.length ?? 1) - 1);
  const price = rewards.enabled ? rewards.pricePerRound : 0;
  const coins = balance(wallet);
  const canPay = coins >= price;

  const finish = useCallback(
    (outcome: ArenaResult) => {
      if (!game) return;
      const key = outcome.key ?? arenaKey(game, option);
      const record = recordBest(player, key, outcome.score);
      for (const [extra, value] of Object.entries(outcome.records ?? {})) recordBest(player, extra, value);
      setResult({ ...outcome, record, key });
      setPhase('result');
      if (record || outcome.stars >= 3) {
        sound.fanfare();
        confetti({ count: 160 });
      } else {
        sound.ding();
      }
    },
    [game, option, player, recordBest],
  );
  const quit = useCallback(() => setPhase('start'), []);
  // Keep the sound awake while playing (the music of Beat-Bahn, the effects of the others).
  useEffect(() => {
    if (phase !== 'play') return;
    sound.hold();
    return () => sound.release();
  }, [phase]);

  if (!game || !skin) return <Navigate to={ARENA} replace />;
  if (!rewards.arena) return <Navigate to="/allein" replace />;

  const start = async (next = option) => {
    sound.unlock();
    if (choice.tilt && game.tilt) await requestTiltPermission();
    if (price > 0 && !spendCoins(player, price, game.name)) return;
    if (price > 0) sound.coin();
    if (next !== choice.option) setChoice({ ...choice, option: next });
    setRound((r) => r + 1);
    setResult(null);
    setPhase('play');
  };

  if (phase === 'play') {
    const Play = game.Play;
    return (
      <Suspense fallback={<div className="arena-loading" aria-busy="true" />}>
        <Play
          key={round}
          player={player}
          skin={skin.id}
          option={option}
          tilt={choice.tilt && game.tilt}
          mode={Math.min(choice.mode, (game.modes?.values.length ?? 1) - 1)}
          onFinish={finish}
          onQuit={quit}
        />
      </Suspense>
    );
  }

  if (phase === 'result' && result) {
    const ranking = familyRanking(Object.values(wallets ?? {}), result.key);
    const mine = placeOf(ranking, player);
    const nextLevel = !!game.levels && (result.records?.[`${game.id}:level`] ?? 0) > option && option + 1 < game.levels;
    return (
      <Page title={game.name} back={ARENA} className="solo-result-page arena-page">
        <div className="solo-result">
          <Mascot size={120} mood={result.stars >= 3 ? 'party' : result.stars >= 1 ? 'happy' : 'wink'} />
          <p className="solo-result__stars" aria-label={`${result.stars} von 3 Sternen`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < result.stars ? 'is-on' : ''} style={{ animationDelay: `${300 + i * 200}ms` }}>
                ★
              </span>
            ))}
          </p>
          <p className="solo-result__score">{result.score.toLocaleString('de-CH')} Punkte</p>
          {result.record && <p className="solo-result__record">🏆 Neuer Rekord für {player}!</p>}
          <p className="solo-result__summary">{result.summary}</p>
          {mine && ranking.length > 1 && (
            <p className="solo-result__best">
              Platz {mine.place} von {ranking.length} in der Familie
            </p>
          )}
        </div>
        <Section title={game.levels ? 'Familie · Level geschafft' : `Familie${game.options ? ` · ${game.options.values[option]}` : ''}`}>
          <FamilyRanking scoreKey={game.levels ? `${game.id}:level` : result.key} current={player} unit={game.unit} />
        </Section>
        <BottomBar>
          <div className="solve-nav">
            <Link to={ARENA} className="btn btn--secondary" viewTransition>
              Arena
            </Link>
            {nextLevel ? (
              <Button icon="next" disabled={!canPay} onClick={() => void start(option + 1)}>
                {price > 0 ? `Level ${option + 2} · ${price} 🪙` : `Level ${option + 2}`}
              </Button>
            ) : (
              <Button icon="refresh" disabled={!canPay} onClick={() => void start()}>
                {price > 0 ? `Nochmals · ${price} 🪙` : 'Nochmals'}
              </Button>
            )}
          </div>
        </BottomBar>
      </Page>
    );
  }

  const buySkin = buy ? game.skins.find((s) => s.id === buy) : null;
  const rankingKey = arenaKey(game, option);
  return (
    <Page title={game.name} subtitle={game.tagline} back={ARENA} className="solo-start arena-page">
      <div className="arena-hero" style={{ '--c1': game.colors[0], '--c2': game.colors[1] } as CSSProperties}>
        <span className="arena-hero__emoji" aria-hidden="true">
          {game.emoji}
        </span>
        <p>{game.description}</p>
        <p className="solo-hero__meta">
          {game.skills.join(' · ')} · {game.duration}
        </p>
      </div>

      {!webgl && <p className="notice notice--warn">Dieses Gerät kann leider keine 3D-Grafik anzeigen – die Arena läuft hier nicht.</p>}

      {players.length > 1 && (
        <Section title="Wer spielt?">
          <PlayerChips value={player} onChange={setPlayer} players={players} coins={rewards.enabled} />
        </Section>
      )}

      {!!game.levels && (
        <Section title="Level">
          <LevelPicker
            value={option}
            onChange={(level) => setChoice({ ...choice, option: level })}
            reached={reached}
            times={wallet.best}
            count={game.levels}
            prefix={game.id}
          />
        </Section>
      )}
      {game.options && (
        <Section title={game.options.label}>
          <Segmented
            label={game.options.label}
            value={String(option)}
            options={game.options.values.map((label, i) => ({ value: String(i), label }))}
            onChange={(value) => setChoice({ ...choice, option: Number(value) })}
          />
        </Section>
      )}

      {game.modes && (
        <Section title={game.modes.label}>
          <Segmented
            label={game.modes.label}
            value={String(Math.min(choice.mode, game.modes.values.length - 1))}
            options={game.modes.values.map((label, i) => ({ value: String(i), label }))}
            onChange={(value) => setChoice({ ...choice, mode: Number(value) })}
          />
          {game.modes.hints?.[choice.mode] && <p className="settings-panel__hint arena-mode-hint">{game.modes.hints[choice.mode]}</p>}
        </Section>
      )}

      {game.tilt && tiltAvailable() && (
        <Section title="Steuerung">
          <Segmented
            label="Steuerung"
            value={choice.tilt ? 'neigen' : 'finger'}
            options={[
              { value: 'finger', label: 'Finger' },
              { value: 'neigen', label: 'Handy neigen' },
            ]}
            onChange={(value) => setChoice({ ...choice, tilt: value === 'neigen' })}
          />
        </Section>
      )}

      <Section title={game.skinLabel}>
        <div className="skin-row" role="radiogroup" aria-label={game.skinLabel}>
          {game.skins.map((s) => {
            const mine = owned(s.id);
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={skin.id === s.id}
                aria-label={`${s.name}${mine ? '' : `, ${s.price} Münzen`}`}
                className={`skin ${skin.id === s.id ? 'is-active' : ''} ${mine ? '' : 'is-locked'}`}
                onClick={() => {
                  haptic(5);
                  if (mine) setChoice({ ...choice, skin: s.id });
                  else setBuy(s.id);
                }}
              >
                <span className="skin__swatch" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.accent})` }} aria-hidden="true" />
                <span className="skin__name">{s.name}</span>
                {!mine && <span className="skin__price">🔒 {s.price}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Familie">
        <FamilyRanking scoreKey={rankingKey} current={player} unit={game.unit} />
      </Section>

      <Section title="So geht’s">
        <Fold title="Regeln" icon="sparkles">
          <ol className="rules">
            {game.rules.map((rule) => (
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
        <Button size="lg" block icon="play" disabled={!canPay || !webgl} onClick={() => void start()}>
          {game.levels ? `Level ${option + 1} spielen` : 'Spielen'}
          {price > 0 ? ` · ${price} 🪙` : ''}
        </Button>
      </BottomBar>

      <ConfirmSheet
        open={!!buySkin}
        onClose={() => setBuy(null)}
        title={buySkin ? `${buySkin.name} kaufen?` : ''}
        message={buySkin ? (coins >= buySkin.price ? `Kostet ${buySkin.price} Münzen – ${player} hat ${coins}.` : `Kostet ${buySkin.price} Münzen – ${player} hat erst ${coins}.`) : ''}
        confirmLabel={buySkin && coins >= buySkin.price ? `Für ${buySkin.price} 🪙 kaufen` : 'OK'}
        onConfirm={() => {
          if (buySkin && coins >= buySkin.price && unlock(player, `${game.id}:${buySkin.id}`, buySkin.price, `${game.name}: ${buySkin.name}`)) {
            setChoice({ ...choice, skin: buySkin.id });
            sound.fanfare();
            confetti({ count: 100 });
          }
          setBuy(null);
        }}
      />
      <Link to="/belohnungen" className="solo-rewards-link" viewTransition>
        <Icon name="settings" size={18} />
        <span>Arena und Münzen einstellen</span>
      </Link>
    </Page>
  );
}
