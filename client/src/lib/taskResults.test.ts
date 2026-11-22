import { describe, expect, it } from 'vitest';
import type { DocTask, TaskDocument } from '../../../shared/types.ts';
import { attemptSummary, autoScore, goalStatus, latestAttempt, weakGoals } from './taskResults.ts';

const task = (patch: Partial<DocTask>): DocTask => ({
  id: 't1',
  type: 'short',
  goalId: 'g1',
  prompt: 'Frage',
  options: [],
  answer: 'Augusta Raurica',
  accepted: ['Augusta Rauracorum'],
  solution: '',
  points: 1,
  lines: 1,
  doubt: '',
  ...patch,
});

const doc = (tasks: DocTask[], attempts: TaskDocument['attempts'], kind: TaskDocument['kind'] = 'quiz'): TaskDocument => ({
  id: 'd1',
  topicId: 'topic',
  kind,
  status: 'ready',
  error: '',
  title: 'Test',
  intro: '',
  durationMin: 15,
  difficulty: 'mixed',
  goalIds: [],
  tasks,
  attempts,
  createdAt: 1,
  updatedAt: 1,
});

describe('results of «Aufgaben»', () => {
  it('judges choice, richtig/falsch and short answers kindly; open tasks are judged by hand', () => {
    expect(autoScore(task({ type: 'choice', options: ['A', 'B'], answer: 'B', points: 2 }), 'B')).toBe(2);
    expect(autoScore(task({ type: 'choice', options: ['A', 'B'], answer: 'B' }), 'A')).toBe(0);
    expect(autoScore(task({ type: 'truefalse', answer: 'richtig' }), 'richtig')).toBe(1);
    expect(autoScore(task({}), 'augusta rauraca')).toBe(1); // a small typo counts
    expect(autoScore(task({}), 'Augusta Rauracorum')).toBe(1);
    expect(autoScore(task({}), 'Aventicum')).toBe(0);
    expect(autoScore(task({}), '  ')).toBe(0);
    expect(autoScore(task({ type: 'open' }), 'egal')).toBeNull();
  });

  it('sums the points and gives the grade of a practice exam', () => {
    const tasks = [task({ id: 'a', points: 4 }), task({ id: 'b', points: 6 })];
    expect(attemptSummary(doc(tasks, [], 'quiz'), { scores: { a: 4, b: 2.5 } })).toBe('6.5 von 10 Punkten');
    expect(attemptSummary(doc(tasks, [], 'exam'), { scores: { a: 4, b: 4 } })).toBe('8 von 10 Punkten · Note 5');
  });

  it('knows per learning goal what sits, from the latest result of each document', () => {
    const tasks = [task({ id: 'a', goalId: 'g1', points: 2 }), task({ id: 'b', goalId: 'g2', points: 2 }), task({ id: 'c', goalId: 'g2', points: 2 })];
    const attempts = [
      { id: 'old', at: 1, mode: 'app' as const, learner: 'Lea', scores: { a: 0, b: 0, c: 0 } },
      { id: 'new', at: 2, mode: 'paper' as const, learner: 'Lea', scores: { a: 2, b: 1, c: 0 } },
      { id: 'tim', at: 3, mode: 'app' as const, learner: 'Tim', scores: { a: 0, b: 2, c: 2 } },
    ];
    const topic = { goals: [{ id: 'g1', text: '', content: '' }, { id: 'g2', text: '', content: '' }, { id: 'g3', text: '', content: '' }] };
    expect(latestAttempt(doc(tasks, attempts))!.id).toBe('tim');
    const lea = goalStatus(topic, [doc(tasks, attempts)], 'Lea');
    expect(lea).toEqual({
      g1: { level: 'sicher', points: 2, max: 2 },
      g2: { level: 'ueben', points: 1, max: 4 },
      g3: { level: 'offen', points: 0, max: 0 },
    });
    expect(weakGoals(topic, lea)).toEqual(['g2']);
    expect(goalStatus(topic, [doc(tasks, attempts)]).g2!.level).toBe('sicher');
  });
});
