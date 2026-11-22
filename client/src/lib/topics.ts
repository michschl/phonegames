import { localDay } from './learn.ts';

/*
 * «Aufgaben»: helpers for topics (the day of the test) – pure functions, see topics.test.ts.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Whole days from today until the test (0 = today, negative = past), or null without a date. */
export function daysUntil(examDate: string | null, now = Date.now()): number | null {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return null;
  const [year, month, day] = examDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = localDay(now).split('-').map(Number) as [number, number, number];
  // At noon, so a change to or from summer time does not shift a day.
  return Math.round((new Date(year, month - 1, day, 12).getTime() - new Date(ty, tm - 1, td, 12).getTime()) / DAY);
}

/** «Prüfung heute», «Prüfung morgen», «Prüfung in 5 Tagen» – null without a date or when it is over. */
export function examLabel(examDate: string | null, now = Date.now()): string | null {
  const days = daysUntil(examDate, now);
  if (days === null || days < 0) return null;
  return days === 0 ? 'Prüfung heute' : days === 1 ? 'Prüfung morgen' : `Prüfung in ${days} Tagen`;
}

/** «3. Dezember 2026». */
export function examDateLabel(examDate: string): string {
  const [year, month, day] = examDate.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Topics whose test is today or within the next days – soonest first (for «Heute dran»). */
export function upcomingExams<T extends { examDate: string | null; deleted?: boolean }>(topics: T[], withinDays = 7, now = Date.now()): { topic: T; days: number }[] {
  return topics
    .filter((topic) => !topic.deleted)
    .map((topic) => ({ topic, days: daysUntil(topic.examDate, now) }))
    .filter((entry): entry is { topic: T; days: number } => entry.days !== null && entry.days >= 0 && entry.days <= withinDays)
    .sort((a, b) => a.days - b.days);
}
