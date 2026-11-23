import { useMemo, useState } from 'react';
import { balance } from '../../../shared/coins.ts';
import type { CoinWallet } from '../../../shared/types.ts';
import { Mascot } from '../components/Brand.tsx';
import { Fold } from '../components/Fold.tsx';
import { Icon } from '../components/Icon.tsx';
import { Page, Section } from '../components/Layout.tsx';
import { Avatar, Button, Sheet, TextField, Toggle } from '../components/ui.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { sound } from '../lib/audio.ts';
import { haptic } from '../lib/device.ts';
import { learnerColor, learnerId } from '../lib/learners.ts';
import { codeMatches, hasCode, hashCode, isOpen, newSalt, useRewardLock, validCode } from '../lib/rewards.ts';
import { useData, useRewards } from '../store/data.ts';
import { useLearners } from '../store/learners.ts';
import { toast, useUi } from '../store/ui.ts';

/*
 * «Belohnungen» (/belohnungen): coins for learning, spent on «Allein spielen». Usually set up by parents
 * for younger children, behind a code; older children with an account of their own leave it off – or use
 * it as their own incentive.
 */

function Stepper({ label, value, onChange, min = 0, max, step = 1, format }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}) {
  return (
    <div className="stepper-row">
      <span className="stepper-row__label">{label}</span>
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" className="stepper__btn" aria-label={`${label}: weniger`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          −
        </button>
        <output className="stepper__value" aria-live="polite">
          {format ? format(value) : value}
        </output>
        <button type="button" className="stepper__btn" aria-label={`${label}: mehr`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

const coins = (n: number) => `${n} ${n === 1 ? 'Münze' : 'Münzen'}`;

/** The lock: the code opens the settings for a while; a forgotten code is reset with the password. */
function LockScreen() {
  const rewards = useRewards();
  const open = useRewardLock((s) => s.open);
  const saveRewards = useData((s) => s.saveRewards);
  const online = useUi((s) => s.online);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const tryCode = () => {
    if (codeMatches(rewards, code)) {
      sound.pop();
      open();
    } else {
      sound.fail();
      haptic([30, 40, 30]);
      setError('Der Code stimmt nicht.');
      setCode('');
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api.checkPassword(password);
      saveRewards({ codeHash: '', codeSalt: '' });
      open();
      toast('Der Code ist entfernt. Du kannst einen neuen festlegen.', { tone: 'success' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reward-lock">
      <Mascot size={110} mood="wink" />
      <p className="reward-lock__title">Mit Code geschützt</p>
      <p className="reward-lock__text">Die Einstellungen der Belohnungen sind mit einem Code geschützt.</p>
      {!forgot ? (
        <form
          className="reward-lock__form"
          onSubmit={(e) => {
            e.preventDefault();
            tryCode();
          }}
        >
          <TextField
            label="Code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value.replace(/\D/g, '').slice(0, 8));
            }}
            error={error ?? undefined}
            autoFocus
          />
          <Button type="submit" block icon="lock" disabled={code.length < 4}>
            Öffnen
          </Button>
          <button type="button" className="link-btn" onClick={() => setForgot(true)}>
            Code vergessen?
          </button>
        </form>
      ) : (
        <form
          className="reward-lock__form"
          onSubmit={(e) => {
            e.preventDefault();
            void reset();
          }}
        >
          <p className="reward-lock__text">Mit dem Passwort des Kontos kannst du den Code entfernen.</p>
          <TextField
            label="Passwort des Kontos"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setError(null);
              setPassword(e.target.value);
            }}
            error={error ?? undefined}
          />
          {!online && <p className="notice notice--warn">Dafür brauchst du Internet.</p>}
          <Button type="submit" block loading={busy} disabled={!password || !online}>
            Code entfernen
          </Button>
          <button type="button" className="link-btn" onClick={() => setForgot(false)}>
            Zurück zum Code
          </button>
        </form>
      )}
    </div>
  );
}

function CodeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const saveRewards = useData((s) => s.saveRewards);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!validCode(first)) return setError('Der Code braucht 4 bis 8 Ziffern.');
    if (first !== second) return setError('Die beiden Codes sind nicht gleich.');
    const salt = newSalt();
    saveRewards({ codeHash: hashCode(first, salt), codeSalt: salt });
    useRewardLock.getState().open();
    sound.pop();
    toast('Code gespeichert – er gilt auf allen Geräten.', { tone: 'success' });
    setFirst('');
    setSecond('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Code festlegen">
      <form
        className="reward-lock__form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="sheet__text">4 bis 8 Ziffern. Wer ihn nicht kennt, kann die Belohnungen nicht ändern und sich keine Münzen schenken.</p>
        <TextField
          label="Neuer Code"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={first}
          onChange={(e) => {
            setError(null);
            setFirst(e.target.value.replace(/\D/g, '').slice(0, 8));
          }}
        />
        <TextField
          label="Code wiederholen"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={second}
          onChange={(e) => {
            setError(null);
            setSecond(e.target.value.replace(/\D/g, '').slice(0, 8));
          }}
          error={error ?? undefined}
        />
        <Button type="submit" block icon="lock">
          Code speichern
        </Button>
      </form>
    </Sheet>
  );
}

function WalletRow({ name, color, wallet, onGift }: { name: string; color: string; wallet: CoinWallet | undefined; onGift: () => void }) {
  const history = [...(wallet?.history ?? [])].reverse().slice(0, 12);
  return (
    <li className="wallet-row">
      <div className="wallet-row__head">
        <Avatar name={name} color={color} size={38} />
        <span className="wallet-row__name">{name}</span>
        <span className="coin-pill" aria-label={`${name} hat ${coins(balance(wallet))}`}>
          <span aria-hidden="true">🪙</span> {balance(wallet)}
        </span>
        <IconButtonSmall label={`Münzen für ${name} ändern`} onClick={onGift} />
      </div>
      {history.length > 0 && (
        <Fold title="Verlauf" icon="clock">
          <ul className="coin-history">
            {history.map((event) => (
              <li key={event.id}>
                <span className={event.amount > 0 ? 'is-plus' : 'is-minus'}>
                  {event.amount > 0 ? '+' : '−'}
                  {Math.abs(event.amount)}
                </span>
                <span>{event.reason}</span>
                <small>{new Date(event.at).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })}</small>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </li>
  );
}

function IconButtonSmall({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn icon-btn--small" aria-label={label} title={label} onClick={onClick}>
      <Icon name="plus" size={18} />
    </button>
  );
}

function GiftSheet({ learner, onClose }: { learner: string | null; onClose: () => void }) {
  const giftCoins = useData((s) => s.giftCoins);
  const give = (amount: number) => {
    if (!learner) return;
    giftCoins(learner, amount);
    if (amount > 0) sound.coin();
    haptic(10);
    toast(amount > 0 ? `${coins(amount)} für ${learner} 🎁` : `${coins(-amount)} von ${learner} abgezogen`);
    onClose();
  };
  return (
    <Sheet open={learner !== null} onClose={onClose} title={learner ? `Münzen für ${learner}` : ''}>
      <p className="sheet__text">Zum Beispiel als Belohnung für etwas, das nicht in der App passiert ist.</p>
      <div className="gift-grid">
        {[5, 10, 20, 50].map((n) => (
          <button key={n} type="button" className="gift-btn" onClick={() => give(n)}>
            +{n}
          </button>
        ))}
        {[5, 10].map((n) => (
          <button key={-n} type="button" className="gift-btn is-minus" onClick={() => give(-n)}>
            −{n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function RewardsPage() {
  const rewards = useRewards();
  const openUntil = useRewardLock((s) => s.openUntil);
  const lock = useRewardLock((s) => s.lock);
  const saveRewards = useData((s) => s.saveRewards);
  const wallets = useData((s) => s.wallets);
  const learners = useLearners();
  const [codeOpen, setCodeOpen] = useState(false);
  const [gift, setGift] = useState<string | null>(null);

  // Everybody of «Wer lernt?» and everybody who has coins.
  const people = useMemo(() => {
    const list = learners.map((l) => ({ name: l.name, color: l.color }));
    for (const wallet of Object.values(wallets ?? {})) {
      if (!wallet.deleted && !list.some((p) => learnerId(p.name) === wallet.id)) list.push({ name: wallet.learner, color: learnerColor(wallet.learner) });
    }
    return list;
  }, [learners, wallets]);

  if (!isOpen(rewards, openUntil)) {
    return (
      <Page title="Belohnungen" back="/konto">
        <LockScreen />
      </Page>
    );
  }

  return (
    <Page
      title="Belohnungen"
      subtitle="Münzen fürs Lernen"
      back="/konto"
      className="rewards-page"
      actions={
        hasCode(rewards) ? (
          <button type="button" className="icon-btn" aria-label="Wieder sperren" title="Wieder sperren" onClick={lock}>
            <Icon name="lock" />
          </button>
        ) : undefined
      }
    >
      <div className="reward-intro">
        <span className="reward-intro__coin" aria-hidden="true">
          🪙
        </span>
        <p>
          Wer lernt, verdient Münzen – im Kartenkasten, im Lückentext und mit Aufgaben. Mit den Münzen spielt man «Allein spielen»: Eine Runde
          kostet ein paar Münzen, ein schnelleres Auto mehr.
        </p>
      </div>

      <div className="list">
        <div className="list__item list__item--toggle">
          <Toggle
            label="Münzen fürs Lernen"
            description={rewards.enabled ? 'An – Spielen kostet Münzen.' : 'Aus – alle Spiele von «Allein spielen» sind frei.'}
            checked={rewards.enabled}
            onChange={(enabled) => saveRewards({ enabled })}
          />
        </div>
      </div>
      <p className="settings-panel__hint reward-who">
        Für jüngere Kinder schalten meist die Eltern die Münzen ein und schützen die Einstellungen mit einem Code. Bei Jugendlichen bleiben
        sie oft aus – oder dienen als eigener Ansporn.
      </p>

      {rewards.enabled && (
        <>
          <Section title="Verdienen">
            <div className="settings-panel">
              <Stepper label="Pro gewusste Karte oder Lücke" value={rewards.perCard} max={5} onChange={(perCard) => saveRewards({ perCard })} format={coins} />
              <Stepper label="Pro Punkt in Aufgaben" value={rewards.perPoint} max={5} onChange={(perPoint) => saveRewards({ perPoint })} format={coins} />
              <Stepper
                label="Höchstens pro Tag"
                value={rewards.dailyMax}
                max={300}
                step={10}
                onChange={(dailyMax) => saveRewards({ dailyMax })}
                format={(n) => (n === 0 ? 'ohne Grenze' : coins(n))}
              />
            </div>
          </Section>
          <Section title="Ausgeben">
            <div className="settings-panel">
              <Stepper label="Eine Runde «Allein spielen»" value={rewards.pricePerRound} max={30} onChange={(pricePerRound) => saveRewards({ pricePerRound })} format={coins} />
              <p className="settings-panel__hint">Im Phoni-Rennen gibt es schnellere Autos zu kaufen (30, 60 und 120 Münzen).</p>
            </div>
          </Section>
        </>
      )}

      <Section title="Arena (ab 13)">
        <div className="list">
          <div className="list__item list__item--toggle">
            <Toggle
              label="Arena anzeigen"
              description={rewards.arena ? '3D-Spiele für Jugendliche – im Tab «Spiele» und unter «Entdecken».' : 'Ausgeblendet – auf allen Geräten dieses Kontos.'}
              checked={rewards.arena}
              onChange={(arena) => saveRewards({ arena })}
            />
          </div>
        </div>
      </Section>

      <Section title="Kontostand">
        {people.length === 0 ? (
          <p className="learn-hub__calm">Noch niemand. Wer im Lernen unter «Wer lernt?» steht, erscheint hier.</p>
        ) : (
          <ul className="wallet-list">
            {people.map((person) => (
              <WalletRow
                key={person.name}
                name={person.name}
                color={person.color}
                wallet={wallets?.[learnerId(person.name)]}
                onGift={() => setGift(person.name)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Code">
        <div className="list">
          <button type="button" className="list__item" onClick={() => setCodeOpen(true)}>
            <Icon name="lock" />
            <span className="list__label">
              {hasCode(rewards) ? 'Code ändern' : 'Mit Code schützen'}
              <small className="list__sub">
                {hasCode(rewards) ? 'Geschützt auf allen Geräten.' : 'Damit Kinder Einstellungen und Kontostand nicht selbst ändern.'}
              </small>
            </span>
            <Icon name="next" size={18} />
          </button>
          {hasCode(rewards) && (
            <button
              type="button"
              className="list__item"
              onClick={() => {
                saveRewards({ codeHash: '', codeSalt: '' });
                toast('Code entfernt.');
              }}
            >
              <Icon name="x" />
              <span className="list__label">Code entfernen</span>
            </button>
          )}
        </div>
      </Section>

      <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} />
      <GiftSheet learner={gift} onClose={() => setGift(null)} />
    </Page>
  );
}
