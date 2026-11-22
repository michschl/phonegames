import { describe, expect, it } from 'vitest';
import { documentMeta, grade, gradeScale, pdfFilename, totalPoints, usesGrid } from './taskDocs.ts';

const task = (points: number) => ({
  id: 't',
  type: 'open' as const,
  goalId: null,
  prompt: 'p',
  options: [],
  answer: 'a',
  accepted: [],
  solution: '',
  points,
  lines: 3,
  doubt: '',
});

describe('documents of «Aufgaben»', () => {
  it('adds up points and gives the Swiss grade, rounded to halves', () => {
    expect(totalPoints({ tasks: [task(2), task(3)] })).toBe(5);
    expect(grade(30, 30)).toBe(6);
    expect(grade(0, 30)).toBe(1);
    expect(grade(18, 30)).toBe(4);
    expect(grade(20, 30)).toBe(4.5);
    expect(grade(40, 30)).toBe(6);
  });

  it('lists the points needed for each grade', () => {
    const scale = gradeScale(30);
    expect(scale[0]).toEqual({ grade: 6, from: 28.5 });
    expect(scale.find((s) => s.grade === 4)).toEqual({ grade: 4, from: 16.5 });
    expect(scale.at(-1)).toEqual({ grade: 1, from: 0 });
  });

  it('describes itself and names its file', () => {
    expect(documentMeta({ kind: 'quiz', durationMin: 15, tasks: [task(1), task(1)] })).toBe('Wissenstest · 15 Min. · 2 Punkte');
    expect(pdfFilename({ title: 'Wissenstest: Die Römer' }, 'tasks')).toBe('Wissenstest-Die-Roemer.pdf');
    expect(pdfFilename({ title: 'Probeprüfung: Brüche' }, 'solutions')).toBe('Probepruefung-Brueche-Loesungen.pdf');
    expect(usesGrid({ subject: 'Mathematik', title: 'Brüche' })).toBe(true);
    expect(usesGrid({ subject: 'Geschichte', title: 'Römer' })).toBe(false);
  });
});
