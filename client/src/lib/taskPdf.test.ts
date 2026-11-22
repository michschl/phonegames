import { describe, expect, it } from 'vitest';
import type { TaskDocument } from '../../../shared/types.ts';
import { buildPdf } from './taskPdf.ts';

const doc: TaskDocument = {
  id: 'doc-000000000001',
  topicId: 'topic-0001',
  kind: 'exam',
  status: 'ready',
  error: '',
  title: 'Probeprüfung: Brüche',
  intro: 'Du hast 30 Minuten Zeit.',
  durationMin: 30,
  difficulty: 'mixed',
  goalIds: [],
  tasks: [
    { id: 't1', type: 'choice', goalId: null, prompt: 'Welcher Bruch ist grösser?', options: ['½', '⅓'], answer: '½', accepted: [], solution: 'Halbe sind grösser als Drittel.', points: 1, lines: 0, doubt: '' },
    { id: 't2', type: 'open', goalId: null, prompt: 'Rechne ½ + ¼.', options: [], answer: '¾', accepted: [], solution: '½ = ²⁄₄, ²⁄₄ + ¼ = ¾', points: 3, lines: 6, doubt: 'Schreibweise prüfen' },
  ],
  attempts: [],
  createdAt: 0,
  updatedAt: 0,
};
const topic = { title: 'Brüche', subject: 'Mathematik', level: '5. Klasse' };
const text = (value: unknown) => JSON.stringify(value);

describe('PDF of a document', () => {
  it('has the task sheet with name, points and squared paper for mathematics – no solutions', () => {
    const pdf = buildPdf(doc, topic, 'tasks');
    const content = text(pdf.content);
    expect(content).toContain('Probeprüfung: Brüche');
    expect(content).toContain('Mathematik · 5. Klasse · 30 Minuten');
    expect(content).toContain('Punkte:      / 4');
    expect(content).toContain('Note:');
    expect(content).toContain('Rechne ½ + ¼.');
    expect(content).not.toContain('Musterlösung');
    // Squared paper: vertical lines too.
    expect(content).toMatch(/"x1":14\.17,"y1":0/);
  });

  it('puts the sample solution on pages of its own, with the grading scale', () => {
    const pdf = buildPdf(doc, topic, 'both');
    const content = pdf.content as { text?: string; pageBreak?: string }[];
    const heading = content.find((c) => c.text === 'Musterlösung – Probeprüfung: Brüche');
    expect(heading?.pageBreak).toBe('before');
    const all = text(content);
    expect(all).toContain('A – ½');
    expect(all).toContain('Bitte prüfen: Schreibweise prüfen');
    expect(all).toContain('Notenskala');
  });

  it('can be the solutions only', () => {
    const content = text(buildPdf(doc, topic, 'solutions').content);
    expect(content).toContain('Musterlösung');
    expect(content).not.toContain('Name:');
  });
});
