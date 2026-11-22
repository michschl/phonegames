import type { DocAttempt, DocTask, LearnCard, LearnTopic, TaskDocument } from '../../../shared/types.ts';
import { checkTypedAnswer } from './learn.ts';
import { grade, totalPoints } from './taskDocs.ts';

/*
 * «Aufgaben»: results of tests, task sheets and practice exams – how many points, which grade, and how
 * well each learning goal sits. Pure functions, see taskResults.test.ts.
 */

/** Points of a result. */
export function attemptPoints(attempt: Pick<DocAttempt, 'scores'>): number {
  return Object.values(attempt.scores).reduce((sum, value) => sum + value, 0);
}

/** «12 von 15 Punkten · Note 5» (the grade only for practice exams). */
export function attemptSummary(doc: Pick<TaskDocument, 'kind' | 'tasks'>, attempt: Pick<DocAttempt, 'scores'>): string {
  const max = totalPoints(doc);
  const points = attemptPoints(attempt);
  const text = `${formatPoints(points)} von ${formatPoints(max)} ${max === 1 ? 'Punkt' : 'Punkten'}`;
  return doc.kind === 'exam' ? `${text} · Note ${formatGrade(grade(points, max))}` : text;
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatGrade(value: number): string {
  return value.toLocaleString('de-CH', { maximumFractionDigits: 1 });
}

/** The task as a card – so a typed answer is checked as kindly as in the Kartenkasten. */
function asCard(task: DocTask): LearnCard {
  return { id: task.id, kind: 'qa', prompt: task.prompt, answer: task.answer, accepted: task.accepted, distractors: [] };
}

/**
 * Points of an answer the app can judge itself (choice, richtig/falsch, short answers), or null for
 * open tasks – those are judged with the sample solution.
 */
export function autoScore(task: DocTask, answer: string | undefined): number | null {
  if (task.type === 'open') return null;
  const given = (answer ?? '').trim();
  if (!given) return 0;
  if (task.type === 'choice' || task.type === 'truefalse') return given.toLowerCase() === task.answer.toLowerCase() ? task.points : 0;
  return checkTypedAnswer(given, asCard(task)).verdict === 'wrong' ? 0 : task.points;
}

export type GoalLevel = 'sicher' | 'fast' | 'ueben' | 'offen';

export interface GoalStatus {
  level: GoalLevel;
  /** Points reached and possible in the latest result of each document. */
  points: number;
  max: number;
}

export const GOAL_LEVEL: Record<Exclude<GoalLevel, 'offen'>, { label: string; emoji: string }> = {
  sicher: { label: 'sitzt', emoji: '✅' },
  fast: { label: 'fast', emoji: '🟡' },
  ueben: { label: 'üben', emoji: '🔁' },
};

/** The latest result of a document – of one person, or of anybody. */
export function latestAttempt(doc: Pick<TaskDocument, 'attempts'>, learner?: string): DocAttempt | null {
  let latest: DocAttempt | null = null;
  for (const attempt of doc.attempts) {
    if (learner !== undefined && attempt.learner.toLowerCase() !== learner.toLowerCase()) continue;
    if (!latest || attempt.at > latest.at) latest = attempt;
  }
  return latest;
}

/**
 * How well each learning goal sits: the points of its tasks in the latest result of every document.
 * 80 % and more «sitzt», from 50 % «fast», below «üben»; no result yet «offen».
 */
export function goalStatus(topic: Pick<LearnTopic, 'goals'>, docs: TaskDocument[], learner?: string): Record<string, GoalStatus> {
  const sums = new Map<string, { points: number; max: number }>();
  for (const doc of docs) {
    if (doc.status !== 'ready') continue;
    const attempt = latestAttempt(doc, learner);
    if (!attempt) continue;
    for (const task of doc.tasks) {
      const score = attempt.scores[task.id];
      if (!task.goalId || score === undefined) continue;
      const sum = sums.get(task.goalId) ?? { points: 0, max: 0 };
      sum.points += score;
      sum.max += task.points;
      sums.set(task.goalId, sum);
    }
  }
  const result: Record<string, GoalStatus> = {};
  for (const goal of topic.goals) {
    const sum = sums.get(goal.id);
    if (!sum || sum.max === 0) {
      result[goal.id] = { level: 'offen', points: 0, max: 0 };
      continue;
    }
    const share = sum.points / sum.max;
    result[goal.id] = { level: share >= 0.8 ? 'sicher' : share >= 0.5 ? 'fast' : 'ueben', ...sum };
  }
  return result;
}

/** Goals to practise: «üben» first, then «fast». */
export function weakGoals(topic: Pick<LearnTopic, 'goals'>, status: Record<string, GoalStatus>): string[] {
  const of = (level: GoalLevel) => topic.goals.filter((g) => status[g.id]?.level === level).map((g) => g.id);
  return [...of('ueben'), ...of('fast')];
}
