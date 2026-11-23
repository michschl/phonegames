import { useMemo } from 'react';
import { familyRanking, familyTotals } from '../lib/ranking.ts';
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
    // From two people on, the best three stand on a podium (the list order stays 1, 2, 3 for screen readers).
    <ol className={`ranking${shown.length >= 2 ? ' ranking--podium' : ''}`} aria-label="Rangliste der Familie">
      {shown.map((entry, i) => (
        <li key={entry.learner} className={`ranking__row ${entry === mine ? 'is-me' : ''} ${i < 3 && shown.length >= 2 ? `is-step is-place${Math.min(3, entry.place)}` : ''}`}>
          <span className="ranking__place">{MEDALS[entry.place - 1] ?? `${entry.place}.`}</span>
          <Avatar name={entry.learner} color={learnerColor(entry.learner)} size={i < 3 && shown.length >= 2 ? 44 : 28} />
          <span className="ranking__name">{entry.learner}</span>
          <span className="ranking__score">
            {entry.score.toLocaleString('de-CH')} <small>{unit}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Games played together: points, wins and games of everybody on this account. */
export function FamilyTotals({ gameId, winsOnly = false }: { gameId: string; winsOnly?: boolean }) {
  const wallets = useData((s) => s.wallets);
  const totals = useMemo(() => {
    const list = familyTotals(Object.values(wallets ?? {}), gameId);
    return winsOnly ? [...list].sort((a, b) => b.wins - a.wins || b.games - a.games) : list;
  }, [wallets, gameId, winsOnly]);
  if (totals.length === 0) return <p className="ranking__empty">Noch keine Partie gezählt. Nach dem Spiel stehen hier Punkte und Siege.</p>;
  return (
    <ol className="ranking ranking--totals" aria-label="Rangliste der Familie">
      {totals.slice(0, 10).map((entry, i) => (
        <li key={entry.learner} className="ranking__row">
          <span className="ranking__place">{MEDALS[(winsOnly ? i + 1 : entry.place) - 1] ?? `${winsOnly ? i + 1 : entry.place}.`}</span>
          <Avatar name={entry.learner} color={learnerColor(entry.learner)} size={28} />
          <span className="ranking__name">{entry.learner}</span>
          <span className="ranking__score">
            {!winsOnly && (
              <>
                {entry.points.toLocaleString('de-CH')} <small>Pkt.</small>{' '}
              </>
            )}
            {entry.wins} <small>{entry.wins === 1 ? 'Sieg' : 'Siege'}</small>
            <small className="ranking__games"> · {entry.games} {entry.games === 1 ? 'Partie' : 'Partien'}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
