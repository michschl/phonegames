import { useEffect, useRef, useState } from 'react';
import { balance } from '../../../shared/coins.ts';
import { sound } from '../lib/audio.ts';
import { useData, useRewards, useWallet } from '../store/data.ts';

/** «🪙 23» – the coins of a person. */
export function CoinPill({ learner, className = '' }: { learner: string; className?: string }) {
  const wallet = useWallet(learner);
  const n = balance(wallet);
  return (
    <span className={`coin-pill ${className}`} aria-label={`${learner} hat ${n} ${n === 1 ? 'Münze' : 'Münzen'}`}>
      <span aria-hidden="true">🪙</span> {n}
    </span>
  );
}

/**
 * Coins for a finished round of learning: added once (while coins are on, up to the daily limit) and
 * shown as «+12 🪙 für Lea». Shows nothing while coins are off.
 */
export function CoinGain({ learner, amount, reason, when = true }: { learner: string | null | undefined; amount: number; reason: string; when?: boolean }) {
  const rewards = useRewards();
  const earnCoins = useData((s) => s.earnCoins);
  const done = useRef(false);
  const [credited, setCredited] = useState<number | null>(null);

  useEffect(() => {
    if (done.current || !when || !learner || !rewards.enabled) return;
    done.current = true;
    const n = earnCoins(learner, amount, reason);
    setCredited(n);
    if (n > 0) window.setTimeout(() => sound.coin(), 400);
  }, [when, learner, amount, reason, rewards.enabled, earnCoins]);

  if (!rewards.enabled || credited === null || !learner) return null;
  return (
    <p className={`coin-gain ${credited > 0 ? 'is-plus' : ''}`} role="status">
      {credited > 0 ? (
        <>
          <span className="coin-gain__coin" aria-hidden="true">
            🪙
          </span>
          <strong>+{credited}</strong> {credited === 1 ? 'Münze' : 'Münzen'} für {learner}
        </>
      ) : amount > 0 ? (
        'Für heute sind alle Münzen verdient – morgen gibt es neue.'
      ) : null}
    </p>
  );
}
