import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { DocTask, LearnTopic, TaskDocument } from '../../../shared/types.ts';
import { gradeScale, KIND_INFO, pdfFilename, totalPoints, usesGrid } from './taskDocs.ts';

/*
 * The printable PDF of a document of «Aufgaben»: the task sheet (name, date, points, space to answer –
 * squared paper for mathematics) and the sample solution on pages of its own, so nobody peeks while
 * solving. Built in the browser with pdfmake (loaded only when needed) – it works offline too.
 */

export type PdfVariant = 'tasks' | 'solutions' | 'both';

const INK = '#1b1033';
const MUTED = '#6b6480';
const LINE = '#b9b3c9';
const WIDTH = 515; // A4 minus the margins, in points
const ROW = 22;

/** A small square to tick. */
function box(): Content {
  return { width: 16, stack: [{ canvas: [{ type: 'rect', x: 0, y: 2, w: 9, h: 9, lineWidth: 0.8, lineColor: INK }] }] } as Content;
}

function answerSpace(lines: number, grid: boolean): Content {
  const height = lines * ROW;
  if (grid) {
    // Squares of 5 mm (14.17 pt) for calculations.
    const step = 14.17;
    const shapes: { type: 'line'; x1: number; y1: number; x2: number; y2: number; lineWidth: number; lineColor: string }[] = [];
    for (let y = 0; y <= height; y += step) shapes.push({ type: 'line', x1: 0, y1: y, x2: WIDTH, y2: y, lineWidth: 0.3, lineColor: LINE });
    for (let x = 0; x <= WIDTH; x += step) shapes.push({ type: 'line', x1: x, y1: 0, x2: x, y2: height, lineWidth: 0.3, lineColor: LINE });
    return { canvas: shapes, margin: [0, 6, 0, 0] };
  }
  return {
    canvas: Array.from({ length: lines }, (_, i) => ({
      type: 'line' as const,
      x1: 0,
      y1: (i + 1) * ROW,
      x2: WIDTH,
      y2: (i + 1) * ROW,
      lineWidth: 0.6,
      lineColor: LINE,
    })),
    margin: [0, 0, 0, 4],
  };
}

function points(task: DocTask): string {
  return `${task.points} ${task.points === 1 ? 'Punkt' : 'Punkte'}`;
}

function taskBlock(task: DocTask, index: number, grid: boolean): Content {
  const body: Content[] = [
    {
      columns: [
        { text: `${index + 1}.`, bold: true, width: 22 },
        { text: task.prompt, width: '*' },
        { text: points(task), width: 60, alignment: 'right', color: MUTED, fontSize: 9 },
      ],
      columnGap: 6,
    },
  ];
  if (task.type === 'choice') {
    body.push({
      stack: task.options.map((option, i) => ({
        columns: [box(), { text: `${String.fromCharCode(65 + i)}   ${option}`, width: '*' }],
        margin: [28, 4, 0, 0],
      })),
    });
  } else if (task.type === 'truefalse') {
    body.push({
      columns: [box(), { text: 'richtig', width: 70 }, box(), { text: 'falsch', width: '*' }],
      margin: [28, 6, 0, 0],
    });
  } else {
    body.push({ ...(answerSpace(Math.max(1, task.lines), grid && task.type === 'open') as object), margin: [28, 4, 0, 0] } as Content);
  }
  return { stack: body, unbreakable: true, margin: [0, 0, 0, 14] };
}

function solutionBlock(task: DocTask, index: number): Content {
  const answer =
    task.type === 'choice'
      ? `${String.fromCharCode(65 + Math.max(0, task.options.indexOf(task.answer)))} – ${task.answer}`
      : task.type === 'truefalse'
        ? task.answer
        : task.answer + (task.accepted.length > 0 ? `  (auch richtig: ${task.accepted.join(', ')})` : '');
  return {
    stack: [
      {
        columns: [
          { text: `${index + 1}.`, bold: true, width: 22 },
          { text: [{ text: 'Lösung: ', bold: true }, answer], width: '*' },
          { text: points(task), width: 60, alignment: 'right', color: MUTED, fontSize: 9 },
        ],
        columnGap: 6,
      },
      ...(task.solution && task.solution !== task.answer ? [{ text: task.solution, margin: [28, 3, 0, 0], color: '#3d2f5c' } as Content] : []),
      ...(task.doubt ? [{ text: `Bitte prüfen: ${task.doubt}`, italics: true, color: '#a15c00', margin: [28, 3, 0, 0] } as Content] : []),
    ],
    unbreakable: true,
    margin: [0, 0, 0, 10],
  };
}

/** The pdfmake description of the PDF – kept pure for the tests. */
export function buildPdf(doc: TaskDocument, topic: Pick<LearnTopic, 'title' | 'subject' | 'level'>, variant: PdfVariant): TDocumentDefinitions {
  const max = totalPoints(doc);
  const grid = usesGrid(topic);
  const meta = [topic.subject, topic.level, `${doc.durationMin} Minuten`].filter(Boolean).join(' · ');
  const content: Content[] = [];

  if (variant !== 'solutions') {
    content.push(
      { text: doc.title, style: 'title' },
      { text: meta, color: MUTED, margin: [0, 2, 0, 12] },
      {
        table: {
          widths: ['*', 130, 110],
          body: [
            [
              { text: 'Name:', color: MUTED },
              { text: 'Datum:', color: MUTED },
              { text: doc.kind === 'exam' ? `Punkte:      / ${max}` : `Punkte:      / ${max}`, color: MUTED },
            ],
          ],
        },
        layout: { hLineWidth: (i) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => INK, paddingBottom: () => 10 },
        margin: [0, 0, 0, doc.kind === 'exam' ? 4 : 12],
      },
      ...(doc.kind === 'exam' ? [{ text: 'Note:', color: MUTED, margin: [0, 6, 0, 12] } as Content] : []),
      ...(doc.intro ? [{ text: doc.intro, italics: true, margin: [0, 0, 0, 14] } as Content] : []),
      ...doc.tasks.map((task, i) => taskBlock(task, i, grid)),
    );
  }

  if (variant !== 'tasks') {
    content.push(
      { text: `Musterlösung – ${doc.title}`, style: 'title', ...(variant === 'both' ? { pageBreak: 'before' as const } : {}) },
      { text: `${KIND_INFO[doc.kind].label} · ${max} Punkte`, color: MUTED, margin: [0, 2, 0, 12] },
      ...doc.tasks.map((task, i) => solutionBlock(task, i)),
    );
    if (doc.kind === 'exam') {
      const scale = gradeScale(max);
      content.push(
        { text: 'Notenskala', style: 'heading', margin: [0, 10, 0, 4] },
        { text: 'Note = Punkte ÷ Total × 5 + 1, auf Halbe gerundet.', color: MUTED, fontSize: 9, margin: [0, 0, 0, 6] },
        {
          table: {
            widths: scale.map(() => '*'),
            body: [scale.map((s) => ({ text: String(s.grade), bold: true, alignment: 'center' })), scale.map((s) => ({ text: `ab ${s.from}`, alignment: 'center', fontSize: 9 }))],
          },
          layout: 'lightHorizontalLines',
        },
      );
    }
    content.push({
      text: 'Aufgaben und Musterlösungen hat eine KI erstellt und einmal kontrolliert – bitte vor dem Korrigieren prüfen.',
      fontSize: 8.5,
      color: MUTED,
      margin: [0, 16, 0, 0],
    });
  }

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: doc.title, creator: 'phonegames' },
    content,
    footer: (page, pages) => ({
      columns: [
        { text: 'phonegames.app', color: MUTED, fontSize: 8 },
        { text: `Seite ${page} von ${pages}`, alignment: 'right', color: MUTED, fontSize: 8 },
      ],
      margin: [40, 16, 40, 0],
    }),
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25, color: INK },
    styles: {
      title: { fontSize: 17, bold: true },
      heading: { fontSize: 13, bold: true },
    },
  };
}

/** Makes the PDF (pdfmake is loaded on first use) and hands it over: share sheet on phones, download elsewhere. */
export async function exportPdf(
  doc: TaskDocument,
  topic: Pick<LearnTopic, 'title' | 'subject' | 'level'>,
  variant: PdfVariant,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(vfs);
  const blob = await pdfMake.createPdf(buildPdf(doc, topic, variant)).getBlob();
  const name = pdfFilename(doc, variant);
  const file = new File([blob], name, { type: 'application/pdf' });
  const phone = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: doc.title });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
