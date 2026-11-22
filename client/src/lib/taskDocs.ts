import type { DocTask, LearnTopic, TaskDocKind, TaskDocument } from '../../../shared/types.ts';

/*
 * «Aufgaben»: what a document says about itself – points, a grade, labels. Pure functions, see
 * taskDocs.test.ts.
 */

export const KIND_INFO: Record<TaskDocKind, { label: string; emoji: string; text: string }> = {
  quiz: { label: 'Wissenstest', emoji: '🧠', text: 'Kurze Fragen – zeigt schnell, was schon sitzt.' },
  tasks: { label: 'Übungsaufgaben', emoji: '✏️', text: 'Aufgaben zum Üben, von leicht bis knifflig.' },
  exam: { label: 'Probeprüfung', emoji: '📝', text: 'Wie die echte Prüfung: mit Punkten, Zeit und Note.' },
};

export const TYPE_LABEL: Record<DocTask['type'], string> = {
  choice: 'Auswahl',
  truefalse: 'Richtig oder falsch',
  short: 'Kurzantwort',
  open: 'Ausführlich',
};

export function totalPoints(doc: Pick<TaskDocument, 'tasks'>): number {
  return doc.tasks.reduce((sum, task) => sum + task.points, 0);
}

/** Swiss grade 1–6 from points: 1 + 5 × points / maximum, rounded to halves. */
export function grade(points: number, max: number): number {
  if (max <= 0) return 1;
  const raw = 1 + (5 * Math.max(0, Math.min(points, max))) / max;
  return Math.round(raw * 2) / 2;
}

/** The fewest points for each grade (6, 5.5 … 1) – the scale of a practice exam. */
export function gradeScale(max: number): { grade: number; from: number }[] {
  const scale: { grade: number; from: number }[] = [];
  for (let g = 6; g >= 1; g -= 0.5) {
    let from = 0;
    while (from <= max && grade(from, max) < g) from += 0.5;
    if (from <= max) scale.push({ grade: g, from });
  }
  return scale;
}

/** «Wissenstest · 15 Min. · 10 Punkte» */
export function documentMeta(doc: Pick<TaskDocument, 'kind' | 'durationMin' | 'tasks'>): string {
  const points = totalPoints(doc);
  return [KIND_INFO[doc.kind].label, `${doc.durationMin} Min.`, doc.tasks.length > 0 ? `${points} ${points === 1 ? 'Punkt' : 'Punkte'}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Lines become squared paper for mathematics. */
export function usesGrid(topic: Pick<LearnTopic, 'subject' | 'title'>): boolean {
  return /mathe|rechnen|geometrie|algebra|physik/i.test(`${topic.subject} ${topic.title}`);
}

/** «Wissenstest-Die-Roemer.pdf» */
export function pdfFilename(doc: Pick<TaskDocument, 'title'>, variant: 'tasks' | 'solutions' | 'both'): string {
  const base = doc.title
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'Unterlage'}${variant === 'solutions' ? '-Loesungen' : ''}.pdf`;
}
