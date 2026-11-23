import { useMemo, type CSSProperties } from 'react';
import type { LearnProgress, LearnStack } from '../../../shared/types.ts';
import { learningWeek, learnStreak, stackMastery } from '../lib/learn.ts';
import { learnerColor } from '../lib/learners.ts';
import { normalize } from '../lib/util.ts';
import { Avatar } from './ui.tsx';

/*
 * Learning made visible: how far a stack is learned (a bar in the colours of the five boxes), and who
 * learned on which day of the last week.
 */

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** A thin bar: the share of cards in each box (new cards are the empty rest), and the share of the way to box 5. */
export function MasteryBar({ stack, progress }: { stack: LearnStack; progress: LearnProgress[] }) {
  const { fresh, boxes, share } = useMemo(() => stackMastery(stack, progress), [stack, progress]);
  const total = fresh + boxes.reduce((a, b) => a + b, 0);
  if (total === 0 || fresh === total) return null;
  const percent = Math.round(share * 100);
  return (
    <span className="mastery" role="img" aria-label={`Lernstand ${percent} Prozent`}>
      <span className="mastery__bar">
        {boxes.map((count, i) =>
          count > 0 ? <span key={i} className={`mastery__part is-box${i + 1}`} style={{ width: `${(count / total) * 100}%` }} /> : null,
        )}
      </span>
      <span className="mastery__value">{percent} %</span>
    </span>
  );
}

/** «Diese Woche»: one row per person who learned lately – a dot for every day with learning, and the streak. */
export function LearnWeek({ progress }: { progress: LearnProgress[] }) {
  const rows = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of progress) if (!entry.deleted && (entry.days?.length ?? 0) > 0) names.set(normalize(entry.player), entry.player);
    return [...names.values()]
      .map((name) => ({ name, week: learningWeek(progress, name), streak: learnStreak(progress, name).days }))
      .filter((row) => row.week.some((day) => day.learned))
      .sort((a, b) => b.week.filter((d) => d.learned).length - a.week.filter((d) => d.learned).length || b.streak - a.streak)
      .slice(0, 5);
  }, [progress]);
  if (rows.length === 0) return null;
  const labels = rows[0]!.week.map((d) => {
    const [y, m, day] = d.day.split('-').map(Number);
    return WEEKDAYS[new Date(y!, m! - 1, day).getDay()]!;
  });
  return (
    <div className="learn-week">
      <div className="learn-week__head" aria-hidden="true">
        <span />
        {labels.map((label, i) => (
          <span key={i} className={i === labels.length - 1 ? 'is-today' : ''}>
            {i === labels.length - 1 ? 'Heute' : label}
          </span>
        ))}
        <span />
      </div>
      {rows.map((row) => {
        const count = row.week.filter((d) => d.learned).length;
        return (
          <div key={row.name} className="learn-week__row" role="img" aria-label={`${row.name}: an ${count} von 7 Tagen gelernt${row.streak > 1 ? `, ${row.streak} Tage in Folge` : ''}`}>
            <span className="learn-week__who">
              <Avatar name={row.name} color={learnerColor(row.name)} size={28} />
              <span>{row.name}</span>
            </span>
            {row.week.map((day) => (
              <span key={day.day} className={`learn-week__day${day.learned ? ' is-on' : ''}${day.today ? ' is-today' : ''}`} style={{ '--c': learnerColor(row.name) } as CSSProperties} />
            ))}
            <span className="learn-week__streak">{row.streak > 1 ? `🔥 ${row.streak}` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
