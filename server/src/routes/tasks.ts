import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db.ts';
import { HttpError } from '../http.ts';
import { countLearnUsage, countTaskUsage, deleteDocument, getDocument, getTaskUsage, listDocuments, saveDocument } from '../repo.ts';
import { randomToken } from '../security.ts';
import { topicGoalSchema } from '../schemas.ts';
import {
  LIMITS,
  TOPIC_LEVELS,
  type DocAttempt,
  type DocTask,
  type DocTaskType,
  type LearnDraft,
  type LearnExtractResponse,
  type TaskDocKind,
  type TaskDocRequest,
  type TaskDocument,
  type TaskUsage,
  type TopicDraft,
  type TopicDraftResponse,
  type TopicGoal,
} from '../../../shared/types.ts';
import {
  assertAnalysisLeft,
  BASE_RULES,
  CARD_SCHEMA,
  chat,
  checkCards,
  toDraft,
  IMAGE,
  learnUsage,
  looksLikeImage,
  MAX_IMAGE_CHARS,
  text,
  UpstreamError,
  currentMonth,
  formatDay,
  nextMonthStart,
  shorten,
  type LearnConfig,
} from './learn.ts';

/*
 * «Aufgaben»: larger topics for a test. From photos of learning goals, book pages or worksheets –
 * or from keywords – the AI writes the learning goals with their core content (Lehrplan 21, for the
 * school level). Tests, tasks and practice exams are made from these goals later.
 * Photos are passed on to the AI (Infomaniak, Switzerland) and never stored or logged.
 */

/** Lehrplan 21 cycle (or school type) of a level – helps the AI write for the right age. */
export function levelHint(level: string): string {
  const index = (TOPIC_LEVELS as readonly string[]).indexOf(level);
  if (index >= 0 && index <= 1) return `${level}, Primarschule, Lehrplan 21 Zyklus 1`;
  if (index >= 2 && index <= 5) return `${level}, Primarschule, Lehrplan 21 Zyklus 2`;
  if (index >= 6 && index <= 8) return `${level}, Sekundarstufe I, Lehrplan 21 Zyklus 3`;
  if (level === 'Gymnasium') return 'Gymnasium (Maturitätsschule, Rahmenlehrplan)';
  if (level === 'Berufsschule') return 'Berufsfachschule';
  if (level === 'Erwachsene') return 'Erwachsenenbildung';
  return level || 'Volksschule (Lehrplan 21)';
}

const topicSchema = z
  .object({
    images: z
      .array(z.string().max(MAX_IMAGE_CHARS, 'Ein Foto ist zu gross.').regex(IMAGE, 'Ungültiges Bild.'))
      .max(LIMITS.learnPhotos, `Höchstens ${LIMITS.learnPhotos} Fotos auf einmal.`)
      .default([]),
    text: z.string().max(LIMITS.topicNotes, 'Die Stichworte sind zu lang.').default(''),
    subject: z.string().trim().max(40).default(''),
    level: z.string().trim().max(40),
  })
  .refine((body) => body.images.length > 0 || body.text.trim().length >= 3, {
    message: 'Mach ein Foto oder schreib ein paar Stichworte zum Thema.',
  });

const TOPIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'goals', 'removed_personal_data'],
  properties: {
    title: { type: 'string', description: 'Kurzer Titel des Themas, z. B. «Die Römer» oder «Brüche addieren»' },
    subject: { type: 'string', description: 'Schulfach, z. B. Geschichte, Mathematik, NMG, Französisch' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'content', 'uncertain'],
        properties: {
          text: { type: 'string', description: 'Lernziel als «Du kannst …»-Satz' },
          content: { type: 'string', description: 'Kernstoff zum Lernziel' },
          uncertain: { type: 'string', description: 'Leer, oder Grund, warum das Lernziel geprüft werden muss' },
        },
      },
    },
    removed_personal_data: { type: 'boolean' },
  },
} as const;

export function topicPrompt(level: string, subject: string, fromPhotos: boolean): string {
  return `Du bereitest für Kinder und Jugendliche in der Schweiz den Stoff für eine Prüfung vor.
Stufe: ${levelHint(level)}.${subject ? `\nFach: ${subject}.` : ''}

Auftrag: Formuliere die Lernziele der Prüfung und zu jedem Lernziel den Kernstoff.
- Orientiere dich am Lehrplan 21 (bzw. am Lehrplan der Schulart) und an der Stufe: Inhalt, Fachbegriffe und Sprache
  passend für dieses Alter.
- goals: 3 bis 12 Lernziele in der Reihenfolge des Stoffs, jedes als konkreter, prüfbarer Satz, der mit «Du kannst»
  beginnt (z. B. «Du kannst erklären, wie die Römische Republik regiert wurde.»).
${
  fromPhotos
    ? `- Auf den Fotos stehen Lernziele, Buchseiten, Arbeitsblätter oder Notizen. Stehen Lernziele drauf, übernimm sie
  sinngemäss. Der Kernstoff stammt aus den Fotos; ergänze nur, was direkt zum Verständnis dazugehört.`
    : '- Grundlage sind die Stichworte. Nimm gesichertes Schulwissen für diese Stufe – nichts Strittiges, nichts Erfundenes.'
}
- content: der Kernstoff zum Lernziel in 2 bis 6 kurzen Sätzen oder Stichworten – Fakten, Begriffe mit Erklärung,
  Regeln, Formeln, Jahreszahlen, typische Beispiele –, so dass sich daraus Prüfungsfragen stellen lassen.
- uncertain: leer, ausser du konntest etwas nicht sicher lesen oder bist fachlich unsicher – dann kurz den Grund.
- title: kurz und konkret (höchstens 60 Zeichen). subject: das Schulfach.
- Schreibe in Schweizer Rechtschreibung (ss statt ß). Fremdsprachige Wörter exakt mit allen Akzenten.
- Lass Namen von Personen, Noten, Unterschriften und Klassen weg und setze dann removed_personal_data auf true.
- Ist kein Lernstoff zu erkennen, gib eine leere Liste goals zurück.
Antworte ausschliesslich mit JSON nach dem Schema.`;
}

/** The model's answer as a clean draft – anything broken is dropped. */
export function toTopicDraft(raw: unknown, level: string, subject: string): TopicDraft {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const goals: TopicDraft['goals'] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.goals) ? data.goals : []) {
    if (!item || typeof item !== 'object') continue;
    const goal = item as Record<string, unknown>;
    const goalText = text(goal.text, LIMITS.goalText);
    if (!goalText || seen.has(goalText.toLowerCase())) continue;
    seen.add(goalText.toLowerCase());
    goals.push({
      text: goalText,
      content: typeof goal.content === 'string' ? goal.content.trim().slice(0, LIMITS.goalContent) : '',
      uncertain: text(goal.uncertain, 200),
    });
    if (goals.length >= LIMITS.goalsPerTopic) break;
  }
  return {
    title: text(data.title, LIMITS.stackTitleMax) || 'Neues Thema',
    subject: text(data.subject, 40) || subject,
    level,
    goals,
    removedPersonalData: data.removed_personal_data === true,
  };
}

async function draftTopic(
  config: LearnConfig,
  input: { images: string[]; text: string; subject: string; level: string },
  log: FastifyBaseLogger,
): Promise<unknown> {
  const fromPhotos = input.images.length > 0;
  const notes = input.text.trim();
  return chat(
    config,
    {
      messages: [
        { role: 'system', content: topicPrompt(input.level, input.subject, fromPhotos) },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                fromPhotos ? `Hier sind ${input.images.length} Foto(s) der Unterlagen.` : '',
                notes ? `Stichworte zum Thema:\n${notes}` : '',
                'Erstelle die Lernziele mit dem Kernstoff.',
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
            ...input.images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'lernthema', strict: true, schema: TOPIC_SCHEMA } },
      reasoning_effort: 'none',
      temperature: 0.2,
      max_tokens: 6000,
    },
    'topic',
    log,
  );
}

/* --------------------------------------------------------------- documents */

const KIND_LABEL: Record<TaskDocKind, string> = { quiz: 'Wissenstest', tasks: 'Übungsaufgaben', exam: 'Probeprüfung' };

/** How many tasks (and points, for the practice exam) fit into the time. */
export function documentSize(kind: TaskDocKind, durationMin: 15 | 30 | 45): { tasks: number; points: number } {
  const step = durationMin === 15 ? 0 : durationMin === 30 ? 1 : 2;
  if (kind === 'quiz') return { tasks: [10, 18, 25][step]!, points: [10, 18, 25][step]! };
  if (kind === 'tasks') return { tasks: [5, 8, 12][step]!, points: 0 };
  return { tasks: [7, 11, 15][step]!, points: [15, 30, 42][step]! };
}

const DIFFICULTY: Record<TaskDocRequest['difficulty'], string> = {
  easy: 'Grundlagen: Wissen und einfaches Verständnis, klare kurze Aufgaben',
  mixed: 'gemischt: von leicht (Wissen) bis anspruchsvoll (Anwenden, Begründen)',
  hard: 'anspruchsvoll: mehr Anwenden, Begründen, Vergleichen und Transfer auf neue Beispiele',
};

const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'intro', 'tasks'],
  properties: {
    title: { type: 'string' },
    intro: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'goal', 'prompt', 'options', 'answer', 'accepted', 'solution', 'points', 'lines'],
        properties: {
          type: { type: 'string', enum: ['choice', 'truefalse', 'short', 'open'] },
          goal: { type: 'integer', description: 'Nummer des Lernziels' },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          accepted: { type: 'array', items: { type: 'string' } },
          solution: { type: 'string' },
          points: { type: 'integer' },
          lines: { type: 'integer' },
        },
      },
    },
  },
} as const;

export function documentPrompt(request: TaskDocRequest): string {
  const { topic, kind, durationMin, difficulty } = request;
  const size = documentSize(kind, durationMin);
  const goals = topic.goals
    .map((goal, i) => (request.goalIds.includes(goal.id) ? `${i + 1}: ${goal.text}${goal.content ? ` – Kernstoff: ${goal.content}` : ''}` : null))
    .filter(Boolean)
    .join('\n');
  const task =
    kind === 'quiz'
      ? `WISSENSTEST mit genau ${size.tasks} kurzen Fragen, gemischt: choice (4 Antworten, genau eine richtig),
  truefalse (eine Aussage; answer «richtig» oder «falsch») und short (Antwort ein Wort, eine Zahl, ein Begriff oder
  ein kurzer Ausdruck). Jede Frage 1 Punkt. Er zeigt schnell, was schon sitzt.`
      : kind === 'tasks'
        ? `ÜBUNGSAUFGABEN: genau ${size.tasks} Aufgaben, von leicht nach schwierig geordnet – vor allem open (erklären,
  begründen, vergleichen, anwenden, rechnen), dazu einige short. Punkte 1 bis 6 je nach Aufwand. Die Musterlösung
  zeigt den Lösungsweg so, dass man daraus lernt.`
        : `PROBEPRÜFUNG wie eine echte Prüfung der Lehrperson: genau ${size.tasks} Aufgaben, zusammen etwa ${size.points} Punkte.
  Zuerst einige choice, truefalse und short zum Einstieg, dann open-Aufgaben zu Verständnis, Anwendung und Transfer.
  Punkte pro Aufgabe nach Aufwand.`;
  return `Du erstellst Unterlagen zur Prüfungsvorbereitung für Kinder und Jugendliche in der Schweiz.
Art: ${KIND_LABEL[kind]}, Bearbeitungszeit ${durationMin} Minuten.
Stufe: ${levelHint(topic.level)}.${topic.subject ? `\nFach: ${topic.subject}.` : ''}
Thema: ${topic.title}.
Schwierigkeit: ${DIFFICULTY[difficulty]}.

Lernziele (Nummer: Lernziel – Kernstoff):
${goals}

Auftrag: ${task}

Regeln:
- Verteile die Aufgaben auf alle genannten Lernziele. goal ist die Nummer des Lernziels, um das es geht.
- Orientiere dich am Lehrplan 21 bzw. an der Stufe: Inhalt, Fachbegriffe und Sprache passend für dieses Alter.
- Nur fachlich korrekte, eindeutige Aufgaben, die sich mit dem Kernstoff lösen lassen. Die Antwort darf nicht in
  der Aufgabe stehen. Keine Aufgabe doppelt.
- prompt: klare Aufgabenstellung in der Du-Form. Bei Rechnungen Formeln mit Unicode-Zeichen (x², ½, √, ·, ÷, ≤),
  kein LaTeX. Keine Bilder oder Skizzen voraussetzen.
- options: nur bei choice, sonst leer. answer: bei choice der genaue Text der richtigen Antwort; bei truefalse
  «richtig» oder «falsch»; bei short die erwartete Antwort; bei open die Kernaussage der Lösung in einem Satz.
- accepted: bei short weitere richtige Schreibweisen, sonst leer.
- solution: die Musterlösung. Bei open vollständig – Lösungsweg, Begründung, Rechenschritte – und wofür es wie
  viele Punkte gibt. Bei den anderen kurz, warum die Antwort stimmt.
- lines: Platz für die Antwort auf Papier in Zeilen – short 1, open 3 bis 10 je nach erwarteter Länge (Rechnungen
  mit Lösungsweg eher mehr), choice und truefalse 0.
- title: z. B. «${KIND_LABEL[kind]}: ${topic.title}». intro: ein bis zwei Sätze Anleitung (Zeit, was erlaubt ist).
- Schweizer Rechtschreibung (ss statt ß). Fremdsprachige Wörter exakt.
Antworte ausschliesslich mit JSON nach dem Schema.`;
}

const TYPES: readonly DocTaskType[] = ['choice', 'truefalse', 'short', 'open'];
const plain = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const longText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** The model's tasks, cleaned: broken ones are dropped, the rest made consistent. */
export function toTasks(raw: unknown, goals: Pick<TopicGoal, 'id'>[], kind: TaskDocKind): DocTask[] {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tasks: DocTask[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.tasks) ? data.tasks : []) {
    if (!item || typeof item !== 'object') continue;
    const task = item as Record<string, unknown>;
    let type: DocTaskType = TYPES.includes(task.type as DocTaskType) ? (task.type as DocTaskType) : 'open';
    const prompt = longText(task.prompt, 1200);
    let answer = longText(task.answer, 600);
    if (!prompt || seen.has(plain(prompt))) continue;
    let options = type === 'choice' ? [...new Set((Array.isArray(task.options) ? task.options : []).map((o) => text(o, 200)).filter(Boolean))].slice(0, 5) : [];
    if (type === 'choice') {
      const right = options.find((o) => plain(o) === plain(answer));
      if (right && options.length >= 2) answer = right;
      else {
        // The right answer is not among the options: still a good question, asked openly.
        type = 'short';
        options = [];
      }
    }
    if (type === 'truefalse') {
      const value = plain(answer);
      if (value.startsWith('richtig') || value === 'wahr' || value === 'true') answer = 'richtig';
      else if (value.startsWith('falsch') || value === 'false') answer = 'falsch';
      else continue;
    }
    if (!answer) continue;
    seen.add(plain(prompt));
    const goalNumber = typeof task.goal === 'number' ? task.goal : NaN;
    const goal = goals[goalNumber - 1];
    const defaultLines = type === 'open' ? 5 : type === 'short' ? 1 : 0;
    tasks.push({
      id: `t${tasks.length + 1}`,
      type,
      goalId: goal?.id ?? null,
      prompt,
      options,
      answer,
      accepted: type === 'short' ? texts(task.accepted, 6).filter((a) => plain(a) !== plain(answer)) : [],
      solution: longText(task.solution, 3000),
      points: kind === 'quiz' && type !== 'open' ? 1 : clamp(task.points, 1, 20, type === 'open' ? 3 : 1),
      lines: type === 'choice' || type === 'truefalse' ? 0 : clamp(task.lines, 1, 16, defaultLines),
      doubt: '',
    });
    if (tasks.length >= LIMITS.tasksPerDocument) break;
  }
  return tasks;
}

const texts = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? [...new Set(value.map((v) => text(v, 300)).filter(Boolean))].slice(0, max) : [];

const DOC_CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['checks'],
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'correct', 'reason', 'answer', 'solution'],
        properties: {
          index: { type: 'integer' },
          correct: { type: 'boolean' },
          reason: { type: 'string' },
          answer: { type: 'string', description: 'Die richtige Antwort, wenn die bisherige falsch ist – sonst leer' },
          solution: { type: 'string', description: 'Die korrigierte Musterlösung – sonst leer' },
        },
      },
    },
  },
} as const;

export const DOC_CHECK_PROMPT = `Du bist eine kritische Lehrperson in der Schweiz und prüfst Prüfungsaufgaben mit Lösungen, bevor sie gedruckt werden.
Prüfe jede Aufgabe einzeln: Ist die Aufgabenstellung eindeutig und fachlich korrekt? Stimmt die Antwort (bei choice:
genau eine Antwort richtig, die angegebene)? Stimmt die Musterlösung, auch jede Rechnung? correct = false, sobald
etwas falsch, irreführend oder mehrdeutig ist. Dann: reason in einem kurzen Satz, und wenn du die richtige Lösung
sicher kennst, answer und solution korrigiert (bei choice muss answer genau einer der Antworten entsprechen; bei
truefalse «richtig» oder «falsch»). Bist du unsicher, lass answer und solution leer. Antworte nur mit JSON.`;

/** A second look at every task: fixes wrong answers and solutions, marks what it cannot fix. */
async function checkTasks(config: LearnConfig, tasks: DocTask[], log: FastifyBaseLogger): Promise<DocTask[]> {
  const raw = (await chat(
    config,
    {
      messages: [
        { role: 'system', content: DOC_CHECK_PROMPT },
        {
          role: 'user',
          content: tasks
            .map(
              (task, i) =>
                `${i}. [${task.type}] ${task.prompt}${task.options.length ? ` | Antworten: ${task.options.join(' / ')}` : ''} | Antwort: ${task.answer} | Musterlösung: ${task.solution}`,
            )
            .join('\n'),
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'kontrolle', strict: true, schema: DOC_CHECK_SCHEMA } },
      reasoning_effort: 'none',
      temperature: 0,
      max_tokens: 8000,
    },
    'document check',
    log,
  )) as { checks?: unknown };
  return applyChecks(tasks, raw?.checks);
}

/** Puts the corrections of the check into the tasks. */
export function applyChecks(tasks: DocTask[], checks: unknown): DocTask[] {
  const result = tasks.map((task) => ({ ...task }));
  for (const item of Array.isArray(checks) ? checks : []) {
    const check = item as { index?: unknown; correct?: unknown; reason?: unknown; answer?: unknown; solution?: unknown };
    const task = typeof check.index === 'number' ? result[check.index] : undefined;
    if (!task || check.correct !== false) continue;
    const reason = shorten(text(check.reason, 400), 160) || 'Bitte prüfen.';
    let answer = text(check.answer, 600);
    if (task.type === 'choice') answer = task.options.find((o) => plain(o) === plain(answer)) ?? '';
    if (task.type === 'truefalse') answer = ['richtig', 'falsch'].includes(plain(answer)) ? plain(answer) : '';
    const solution = longText(check.solution, 3000);
    if (answer) {
      task.answer = answer;
      if (solution) task.solution = solution;
      task.accepted = [];
    } else if (solution && task.type === 'open') {
      task.solution = solution;
    } else {
      task.doubt = reason;
    }
  }
  return result;
}

/* ------------------------------------------------------------- results */

const half = (value: number) => Math.round(value * 2) / 2;

/** A result as the app sends it, made safe: only tasks of the document, points between 0 and the maximum. */
export function toAttempt(doc: Pick<TaskDocument, 'tasks'>, input: Omit<DocAttempt, 'scores'> & { scores: Record<string, number> }): DocAttempt {
  const scores: Record<string, number> = {};
  for (const task of doc.tasks) {
    const value = input.scores[task.id];
    if (typeof value === 'number' && Number.isFinite(value)) scores[task.id] = Math.min(task.points, Math.max(0, half(value)));
  }
  return { id: input.id, at: Math.min(input.at, Date.now() + 60_000), mode: input.mode, learner: input.learner.trim().slice(0, LIMITS.nameMax), scores };
}

/** Keeps a result (a newer one with the same id replaces it) and only the latest ones. */
export function withAttempt(attempts: DocAttempt[], attempt: DocAttempt): DocAttempt[] {
  return [...attempts.filter((a) => a.id !== attempt.id), attempt].sort((a, b) => a.at - b.at).slice(-LIMITS.attemptsPerDocument);
}

const attemptSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Ungültiges Ergebnis.'),
  at: z.number().int().positive(),
  mode: z.enum(['app', 'paper']),
  learner: z.string().max(LIMITS.nameMax).default(''),
  scores: z.record(z.string().max(16), z.number().min(0).max(1000)).refine((value) => Object.keys(value).length <= LIMITS.tasksPerDocument),
});

/* ---------------------------------------------------------- Lernkarten */

/** Lernkarten on the core content of the learning goals – for the Kartenkasten and the games of «Lernen». */
export function cardsPrompt(level: string, count: number): string {
  return `Du erstellst Lernkarten für ein Lernspiel für Kinder und Jugendliche in der Schweiz.
Stufe: ${levelHint(level)}.

Auftrag: LERNKARTEN ZU LERNZIELEN.
- Du bekommst das Thema einer Prüfung mit seinen Lernzielen und dem Kernstoff.
- Erstelle genau ${count} Lernkarten, die den Kernstoff abfragen – verteilt auf alle Lernziele.
- Kurze, eindeutige Fragen mit kurzen Antworten: Fachbegriffe, Fakten, Jahreszahlen, Wörter. Zusammenhänge aus
  Merktexten als Lückentext (cloze). Bei Wörtli (Fremdsprachen) Karten der Art translation.
- Alles muss fachlich korrekt, sprachlich richtig (Artikel!) und für die Stufe passend sein. Bist du bei einer Karte
  nicht sicher, lass sie weg. Die Antwort darf nicht schon in der Frage stehen.
- title: das Thema, z. B. «Die Römer».

Regeln:
${BASE_RULES}`;
}

function goalsText(request: { topic: TaskDocRequest['topic']; goalIds: string[] }): string {
  const chosen = request.topic.goals.filter((goal) => request.goalIds.length === 0 || request.goalIds.includes(goal.id));
  return [
    `Thema: ${request.topic.title}${request.topic.subject ? ` (${request.topic.subject})` : ''}`,
    'Lernziele:',
    ...chosen.map((goal, i) => `${i + 1}. ${goal.text}${goal.content ? `\n   Kernstoff: ${goal.content}` : ''}`),
  ].join('\n');
}

const topicShape = z.object({
  title: z.string().trim().min(1).max(LIMITS.stackTitleMax),
  subject: z.string().trim().max(40),
  level: z.string().trim().max(40),
  goals: z.array(topicGoalSchema).min(1, 'Das Thema hat keine Lernziele.').max(LIMITS.goalsPerTopic),
});

const cardsSchema = z.object({
  topic: topicShape,
  goalIds: z.array(z.string().max(64)).max(LIMITS.goalsPerTopic).default([]),
  count: z.number().int().min(5).max(30).default(15),
});

const docRequestSchema = z.object({
  topicId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Ungültiges Thema.'),
  topic: topicShape,
  kind: z.enum(['quiz', 'tasks', 'exam']),
  durationMin: z.union([z.literal(15), z.literal(30), z.literal(45)]),
  difficulty: z.enum(['easy', 'mixed', 'hard']),
  goalIds: z.array(z.string().max(64)).max(LIMITS.goalsPerTopic),
});

const docIdSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/, 'Ungültige Unterlage.') });

/** A document still «pending» after this long was lost (e.g. a restart) – it shows as failed. */
const STALE_MS = 5 * 60 * 1000;

function freshDocument(db: Database, userId: string, doc: TaskDocument): TaskDocument {
  if (doc.status !== 'pending' || Date.now() - doc.updatedAt < STALE_MS) return doc;
  return saveDocument(db, userId, { ...doc, status: 'failed', error: 'Das hat zu lange gedauert. Versuch es nochmals.', updatedAt: Date.now() });
}

export const taskRoutes: FastifyPluginAsync<{ rateLimit: boolean; learn: LearnConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const running = new Set<string>();

  /** A topic from photos and/or keywords: the AI suggests the learning goals, the person checks them. */
  app.post(
    '/topic',
    { preHandler: app.requireAccess, config: limit(20), bodyLimit: 16 * 1024 * 1024 },
    async (request): Promise<TopicDraftResponse> => {
      const learn = opts.learn;
      if (!learn) throw new HttpError(503, 'learn_unavailable', 'Die KI-Auswertung ist auf diesem Server nicht eingerichtet.');
      const userId = request.user!.id;
      const body = topicSchema.parse(request.body);
      if (!body.images.every(looksLikeImage)) throw new HttpError(400, 'invalid_image', 'Mindestens ein Foto ist kein gültiges Bild.');
      assertAnalysisLeft(app.db, learn, userId);
      if (running.has(userId)) throw new HttpError(429, 'learn_running', 'Eine Auswertung läuft bereits.');

      running.add(userId);
      try {
        let draft: TopicDraft | null = null;
        for (let attempt = 0; attempt < 2 && !draft; attempt++) {
          try {
            draft = toTopicDraft(await draftTopic(learn, body, request.log), body.level, body.subject);
          } catch (error) {
            if (!(error instanceof UpstreamError)) throw error;
            if (attempt === 1) throw new HttpError(502, 'learn_failed', 'Die Auswertung hat leider nicht geklappt. Versuch es nochmals.');
          }
        }
        if (!draft || draft.goals.length === 0) {
          throw new HttpError(
            422,
            'learn_empty',
            body.images.length > 0
              ? 'Auf den Fotos habe ich keinen Lernstoff gefunden. Versuch es mit schärferen Fotos oder mit Stichworten.'
              : 'Zu diesen Stichworten habe ich keine Lernziele gefunden. Beschreib das Thema etwas genauer.',
          );
        }
        countLearnUsage(app.db, userId, currentMonth());
        return { draft, usage: learnUsage(app.db, learn, userId) };
      } finally {
        running.delete(userId);
      }
    },
  );

  const taskUsage = (userId: string): TaskUsage => {
    const month = currentMonth();
    const limitPerMonth = opts.learn ? (opts.learn.taskMonthlyLimit ?? 20) : 0;
    const used = getTaskUsage(app.db, userId, month);
    return { available: !!opts.learn, used, limit: limitPerMonth, remaining: Math.max(0, limitPerMonth - used), resetsOn: nextMonthStart(month) };
  };
  const writing = new Set<string>();

  app.get('/usage', { preHandler: app.requireAccess, config: limit(120) }, async (request): Promise<TaskUsage> => taskUsage(request.user!.id));

  /** The documents of a topic, newest first. */
  app.get('/documents', { preHandler: app.requireAccess, config: limit(300) }, async (request): Promise<{ documents: TaskDocument[] }> => {
    const { topicId } = z.object({ topicId: z.string().max(64) }).parse(request.query);
    const userId = request.user!.id;
    return { documents: listDocuments(app.db, userId, topicId).map((doc) => freshDocument(app.db, userId, doc)) };
  });

  app.get('/documents/:id', { preHandler: app.requireAccess, config: limit(600) }, async (request): Promise<{ document: TaskDocument }> => {
    const { id } = docIdSchema.parse(request.params);
    const doc = getDocument(app.db, request.user!.id, id);
    if (!doc) throw new HttpError(404, 'document_not_found', 'Diese Unterlage gibt es nicht mehr.');
    return { document: freshDocument(app.db, request.user!.id, doc) };
  });

  app.delete('/documents/:id', { preHandler: app.requireAccess }, async (request, reply) => {
    const { id } = docIdSchema.parse(request.params);
    if (!deleteDocument(app.db, request.user!.id, id)) throw new HttpError(404, 'document_not_found', 'Diese Unterlage gibt es nicht mehr.');
    return reply.status(204).send();
  });

  /** A result: solved in the app, or the points of a sheet solved on paper. */
  app.post('/documents/:id/attempts', { preHandler: app.requireAccess, config: limit(120) }, async (request): Promise<{ document: TaskDocument }> => {
    const { id } = docIdSchema.parse(request.params);
    const userId = request.user!.id;
    const doc = getDocument(app.db, userId, id);
    if (!doc) throw new HttpError(404, 'document_not_found', 'Diese Unterlage gibt es nicht mehr.');
    if (doc.status !== 'ready') throw new HttpError(409, 'document_not_ready', 'Die Unterlage ist noch nicht fertig.');
    const attempt = toAttempt(doc, attemptSchema.parse(request.body));
    return { document: saveDocument(app.db, userId, { ...doc, attempts: withAttempt(doc.attempts, attempt), updatedAt: Date.now() }) };
  });

  app.delete('/documents/:id/attempts/:attemptId', { preHandler: app.requireAccess }, async (request): Promise<{ document: TaskDocument }> => {
    const { id, attemptId } = docIdSchema.extend({ attemptId: z.string().max(64) }).parse(request.params);
    const userId = request.user!.id;
    const doc = getDocument(app.db, userId, id);
    if (!doc) throw new HttpError(404, 'document_not_found', 'Diese Unterlage gibt es nicht mehr.');
    const attempts = doc.attempts.filter((a) => a.id !== attemptId);
    return { document: attempts.length === doc.attempts.length ? doc : saveDocument(app.db, userId, { ...doc, attempts, updatedAt: Date.now() }) };
  });

  /** Lernkarten from the learning goals – a draft to review, counted like a photo analysis. */
  app.post('/cards', { preHandler: app.requireAccess, config: limit(20), bodyLimit: 256 * 1024 }, async (request): Promise<LearnExtractResponse> => {
    const learn = opts.learn;
    if (!learn) throw new HttpError(503, 'learn_unavailable', 'Die KI ist auf diesem Server nicht eingerichtet.');
    const userId = request.user!.id;
    const body = cardsSchema.parse(request.body);
    assertAnalysisLeft(app.db, learn, userId);
    if (running.has(userId)) throw new HttpError(429, 'learn_running', 'Eine Auswertung läuft bereits.');

    running.add(userId);
    try {
      let draft: LearnDraft | null = null;
      for (let attempt = 0; attempt < 2 && !draft; attempt++) {
        try {
          const raw = await chat(
            learn,
            {
              messages: [
                { role: 'system', content: cardsPrompt(body.topic.level, body.count) },
                { role: 'user', content: goalsText(body) },
              ],
              response_format: { type: 'json_schema', json_schema: { name: 'lernstapel', strict: true, schema: CARD_SCHEMA } },
              reasoning_effort: 'none',
              temperature: 0.5,
              max_tokens: 8000,
            },
            'cards',
            request.log,
          );
          draft = toDraft(raw, true);
          // The topic names the stack when the model leaves title or subject out.
          const named = raw as { title?: unknown; subject?: unknown } | null;
          if (!text(named?.title)) draft.title = body.topic.title.slice(0, LIMITS.stackTitleMax);
          if (!text(named?.subject)) draft.subject = body.topic.subject;
        } catch (error) {
          if (!(error instanceof UpstreamError)) throw error;
          if (attempt === 1) throw new HttpError(502, 'learn_failed', 'Das hat leider nicht geklappt. Versuch es nochmals.');
        }
      }
      if (!draft || draft.cards.length === 0) throw new HttpError(422, 'learn_empty', 'Zu diesen Lernzielen habe ich keine Lernkarten gefunden.');
      try {
        const issues = await checkCards(learn, draft.cards, request.log);
        for (const [index, reason] of issues) draft.cards[index]!.uncertain = `Möglicherweise falsch – ${reason}`.slice(0, 200);
      } catch (error) {
        if (!(error instanceof UpstreamError)) throw error;
      }
      countLearnUsage(app.db, userId, currentMonth());
      return { draft, usage: learnUsage(app.db, learn, userId) };
    } finally {
      running.delete(userId);
    }
  });

  /**
   * Writes a test, task sheet or practice exam. Answers at once with the document «pending»; the AI
   * writes and checks it in the background (about a minute) – the app asks again until it is ready.
   */
  app.post('/documents', { preHandler: app.requireAccess, config: limit(30), bodyLimit: 256 * 1024 }, async (request): Promise<{ document: TaskDocument; usage: TaskUsage }> => {
    const learn = opts.learn;
    if (!learn) throw new HttpError(503, 'learn_unavailable', 'Die KI ist auf diesem Server nicht eingerichtet.');
    const userId = request.user!.id;
    const body = docRequestSchema.parse(request.body) as TaskDocRequest;
    const known = new Set(body.topic.goals.map((g) => g.id));
    const goalIds = body.goalIds.filter((id) => known.has(id));
    const chosen: TaskDocRequest = { ...body, goalIds: goalIds.length > 0 ? goalIds : body.topic.goals.map((g) => g.id) };
    const usage = taskUsage(userId);
    if (usage.remaining <= 0) {
      throw new HttpError(429, 'task_limit', `Du hast diesen Monat alle ${usage.limit} Unterlagen erstellt. Ab dem ${formatDay(usage.resetsOn)} geht es wieder.`);
    }
    if (writing.has(userId)) throw new HttpError(429, 'task_running', 'Phoni schreibt schon an einer Unterlage. Warte kurz, bis sie fertig ist.');

    const now = Date.now();
    const doc: TaskDocument = saveDocument(app.db, userId, {
      id: randomToken(16),
      topicId: chosen.topicId,
      kind: chosen.kind,
      status: 'pending',
      error: '',
      title: `${KIND_LABEL[chosen.kind]}: ${chosen.topic.title}`,
      intro: '',
      durationMin: chosen.durationMin,
      difficulty: chosen.difficulty,
      goalIds: chosen.goalIds,
      tasks: [],
      attempts: [],
      createdAt: now,
      updatedAt: now,
    });
    writing.add(userId);
    const log = request.log;
    void (async () => {
      try {
        const done = await writeDocument(learn, chosen, log);
        if (!getDocument(app.db, userId, doc.id)) return; // deleted meanwhile
        saveDocument(app.db, userId, { ...doc, ...done, status: 'ready', updatedAt: Date.now() });
        // Only finished documents count towards the limit.
        countTaskUsage(app.db, userId, currentMonth());
      } catch (error) {
        const message = error instanceof HttpError ? error.message : 'Das hat leider nicht geklappt. Versuch es nochmals.';
        if (!(error instanceof HttpError) && !(error instanceof UpstreamError)) log.error({ err: error }, 'tasks: document failed');
        if (getDocument(app.db, userId, doc.id)) saveDocument(app.db, userId, { ...doc, status: 'failed', error: message, updatedAt: Date.now() });
      } finally {
        writing.delete(userId);
      }
    })();
    return { document: doc, usage };
  });
};

/** The AI writes the tasks, then checks them once more; one retry when the answer is broken. */
async function writeDocument(
  config: LearnConfig,
  request: TaskDocRequest,
  log: FastifyBaseLogger,
): Promise<Pick<TaskDocument, 'title' | 'intro' | 'tasks'>> {
  const goals = request.topic.goals;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = (await chat(
        config,
        {
          messages: [
            { role: 'system', content: documentPrompt(request) },
            { role: 'user', content: 'Erstelle die Unterlage mit Musterlösungen.' },
          ],
          response_format: { type: 'json_schema', json_schema: { name: 'unterlage', strict: true, schema: DOC_SCHEMA } },
          reasoning_effort: 'none',
          temperature: 0.4,
          max_tokens: 14000,
        },
        'document',
        log,
      )) as Record<string, unknown>;
      let tasks = toTasks(raw, goals, request.kind);
      if (tasks.length < 3) throw new UpstreamError('too few tasks');
      try {
        tasks = await checkTasks(config, tasks, log);
      } catch (error) {
        if (!(error instanceof UpstreamError)) throw error;
        // Without the check the tasks stay as they are – the document says the solutions are from an AI.
      }
      return {
        title: text(raw.title, 120) || `${KIND_LABEL[request.kind]}: ${request.topic.title}`,
        intro: text(raw.intro, 400),
        tasks,
      };
    } catch (error) {
      if (!(error instanceof UpstreamError) || attempt === 1) throw error;
    }
  }
  throw new UpstreamError('unreachable');
}
