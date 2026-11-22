import { useMemo } from 'react';
import { familyRanking } from '../lib/ranking.ts';
import { learnerColor } from '../lib/learners.ts';
import { useData } from '../store/data.ts';
import { Avatar } from './ui.tsx';

const MEDALS = ['🥇', '🥈', '🥉'];

/** «Familie»: the best score of everybody on this account in a game – the current person highlighted. */
export function FamilyRanking({ scoreKey, current, unit = 'Punkte', limit = 5 }: { scoreKey: string; current: string; unit?: string; limit?: number }) {
  const wallets = useData((s) => s.wallets);
  const ranking = useMemo(() => familyRanking(Object.values(wallets ?? {}), scoreKey), [wallets, scoreKey]);
  if (ranking.length === 0) return <p className="ranking__empty">Noch kein Rekord – wer spielt zuerst?</p>;
  const mine = ranking.find((e) => e.learner.toLowerCase() === current.toLowerCase());
  const shown = ranking.slice(0, limit);
  if (mine && !shown.includes(mine)) shown.push(mine);
  return (
    <ol className="ranking" aria-label="Rangliste der Familie">
      {shown.map((entry) => (
        <li key={entry.learner} className={`ranking__row ${entry === mine ? 'is-me' : ''}`}>
          <span className="ranking__place">{MEDALS[entry.place - 1] ?? `${entry.place}.`}</span>
          <Avatar name={entry.learner} color={learnerColor(entry.learner)} size={28} />
          <span className="ranking__name">{entry.learner}</span>
          <span className="ranking__score">
            {entry.score.toLocaleString('de-CH')} <small>{unit}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
