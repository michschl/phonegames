import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import type { LearnConfig } from '../src/routes/learn.ts';
import { applyChecks, documentPrompt, documentSize, levelHint, toAttempt, toTasks, toTopicDraft, withAttempt } from '../src/routes/tasks.ts';
import type { DocAttempt, DocTask, LearnExtractResponse, LearnTopic, SyncResponse, TaskDocRequest, TaskDocument, TaskUsage, TopicDraftResponse } from '../../shared/types.ts';
import { fakeAi } from './fakeAi.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64')}`;

export const TOPIC_ANSWER = {
  title: 'Die Römer',
  subject: 'Geschichte',
  goals: [
    { text: 'Du kannst die Gründungssage Roms erzählen.', content: 'Romulus und Remus, 753 v. Chr., Wölfin.', uncertain: '' },
    { text: 'Du kannst erklären, wie die Republik regiert wurde.', content: 'Senat, zwei Konsuln, Volksversammlung.', uncertain: '' },
    { text: 'Du kannst erklären, wie die Republik regiert wurde.', content: 'doppelt', uncertain: '' },
    { text: '   ', content: 'leer', uncertain: '' },
    { text: 'Du kannst Spuren der Römer in der Schweiz nennen.', content: 'Augusta Raurica, Aventicum.', uncertain: 'Foto unscharf' },
  ],
  removed_personal_data: true,
};

const DOC_ANSWER = {
  title: 'Wissenstest: Die Römer',
  intro: 'Du hast 15 Minuten Zeit. Keine Hilfsmittel.',
  tasks: [
    { type: 'choice', goal: 1, prompt: 'Wer gründete der Sage nach Rom?', options: ['Romulus', 'Caesar', 'Nero', 'Augustus'], answer: 'Romulus', accepted: [], solution: 'Romulus, nach der Sage 753 v. Chr.', points: 3, lines: 0 },
    { type: 'truefalse', goal: 2, prompt: 'Die Republik wurde von zwei Konsuln geführt.', options: [], answer: 'Richtig', accepted: [], solution: 'Zwei Konsuln, jährlich gewählt.', points: 1, lines: 0 },
    { type: 'short', goal: 3, prompt: 'Wie hiess die römische Stadt bei Augst?', options: [], answer: 'Augusta Raurica', accepted: ['Augusta Rauracorum'], solution: 'Augusta Raurica.', points: 1, lines: 1 },
    { type: 'open', goal: 2, prompt: 'Erkläre, wer in der Republik die Gesetze beschloss.', options: [], answer: 'Die Volksversammlung', accepted: [], solution: 'Volksversammlung (1 P.), Senat berät (1 P.).', points: 2, lines: 4 },
    { type: 'choice', goal: 1, prompt: 'Wann wurde Rom gegründet?', options: ['753 v. Chr.', '44 v. Chr.'], answer: '1291', accepted: [], solution: '753 v. Chr.', points: 1, lines: 0 },
    { type: 'truefalse', goal: 9, prompt: 'Rom liegt am Rhein.', options: [], answer: 'vielleicht', accepted: [], solution: '', points: 1, lines: 0 },
  ],
};

const CARDS_ANSWER = {
  title: '',
  subject: '',
  languages: [],
  cards: [
    { kind: 'qa', prompt: 'Wer gründete der Sage nach Rom?', answer: 'Romulus', accepted: [], distractors: ['Remus', 'Caesar', 'Nero'], uncertain: '' },
    { kind: 'number', prompt: 'In welchem Jahr wurde Rom der Sage nach gegründet?', answer: '753 v. Chr.', accepted: [], distractors: [], uncertain: '' },
    { kind: 'cloze', prompt: 'Die Republik wurde von zwei ___ geführt.', answer: 'Konsuln', accepted: [], distractors: ['Kaisern'], uncertain: '' },
  ],
  suggested_modes: ['kasten', 'blitz'],
  removed_personal_data: false,
};

const CARD_CHECK = { checks: [{ index: 1, correct: false, reason: 'Jahreszahl prüfen.' }] };

const DOC_CHECK = { checks: [{ index: 3, correct: false, reason: 'Nicht ganz.', answer: 'Die Volksversammlung', solution: 'Die Volksversammlung beschliesst Gesetze; der Senat berät.' }] };

let app: FastifyInstance;
let ai: ReturnType<typeof fakeAi>;
let cookie: string;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { ...HEADERS, cookie }, payload });

beforeEach(async () => {
  ai = fakeAi((call) =>
    call.system.includes('prüfst Prüfungsaufgaben')
      ? DOC_CHECK
      : call.system.includes('Unterlagen zur Prüfungsvorbereitung')
        ? DOC_ANSWER
        : call.system.includes('LERNKARTEN ZU LERNZIELEN')
          ? CARDS_ANSWER
          : call.system.includes('prüfst Lernkarten')
            ? CARD_CHECK
            : TOPIC_ANSWER,
  );
  const url = await ai.start();
  const learn: LearnConfig = { url, productId: '112859', token: 'test-token', model: 'Qwen', monthlyLimit: 3, globalMonthlyLimit: 100 };
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, learn });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Lea', email: 'lea@example.ch', password: 'geheim123' },
  });
  cookie = cookieFrom(res);
});

afterEach(async () => {
  await app.close();
  await ai.stop();
});

describe('topics of «Aufgaben»', () => {
  it('writes learning goals from keywords, for the school level (Lehrplan 21)', async () => {
    const res = await post('/api/tasks/topic', { text: 'Römer: Gründung, Republik, Römer in der Schweiz', level: '5. Klasse', subject: '' });
    expect(res.statusCode).toBe(200);
    const { draft, usage } = res.json() as TopicDraftResponse;
    expect(draft).toMatchObject({ title: 'Die Römer', subject: 'Geschichte', level: '5. Klasse', removedPersonalData: true });
    // Doubles and empty goals are dropped, doubts kept for the review.
    expect(draft.goals.map((g) => g.text)).toEqual([
      'Du kannst die Gründungssage Roms erzählen.',
      'Du kannst erklären, wie die Republik regiert wurde.',
      'Du kannst Spuren der Römer in der Schweiz nennen.',
    ]);
    expect(draft.goals[2]!.uncertain).toBe('Foto unscharf');
    expect(usage).toMatchObject({ used: 1, remaining: 2 });

    const call = ai.calls[0]!;
    expect(call.system).toContain('Lehrplan 21 Zyklus 2');
    expect(call.system).toContain('gesichertes Schulwissen');
    expect(call.body.messages[1].content[0].text).toContain('Römer: Gründung');
  });

  it('reads photos too, and needs photos or keywords', async () => {
    const res = await post('/api/tasks/topic', { images: [JPEG], text: '', level: '2. Sek', subject: 'Geschichte' });
    expect(res.statusCode).toBe(200);
    expect(ai.calls[0]!.system).toContain('Zyklus 3');
    expect(ai.calls[0]!.system).toContain('Auf den Fotos stehen Lernziele');
    expect(ai.calls[0]!.body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: JPEG } });

    expect((await post('/api/tasks/topic', { text: 'x', level: '5. Klasse' })).statusCode).toBe(400);
    expect((await post('/api/tasks/topic', { images: ['data:image/jpeg;base64,AAAA'], text: '', level: '5. Klasse' })).statusCode).toBe(400);
  });

  it('does not count an answer without goals', async () => {
    ai.replies.push({ content: JSON.stringify({ ...TOPIC_ANSWER, goals: [] }) });
    const res = await post('/api/tasks/topic', { text: 'Nichts Bestimmtes', level: '5. Klasse' });
    expect(res.statusCode).toBe(422);
    const usage = await app.inject({ method: 'GET', url: '/api/learn/usage', headers: { cookie } });
    expect(usage.json().used).toBe(0);
  });

  it('synchronises topics like the stacks; a deleted one keeps no goals', async () => {
    const topic: LearnTopic = {
      id: 'topic-0001',
      title: 'Die Römer',
      subject: 'Geschichte',
      level: '5. Klasse',
      goals: [{ id: 'goal-0001', text: 'Du kannst …', content: 'Stoff' }],
      notes: 'Römer',
      examDate: '2026-12-03',
      source: 'text',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      deleted: false,
    };
    const sync = async (topics: LearnTopic[]) => (await post('/api/sync', { library: [], groups: [], topics })).json() as SyncResponse;
    expect((await sync([topic])).topics).toEqual([topic]);
    // Older apps send no topics: nothing is lost.
    expect((await post('/api/sync', { library: [], groups: [] })).json().topics).toHaveLength(1);
    const gone = (await sync([{ ...topic, deleted: true, updatedAt: Date.now() }])).topics![0]!;
    expect(gone).toMatchObject({ deleted: true, goals: [], notes: '' });
  });
});

describe('topic helpers', () => {
  it('knows the cycle of each level', () => {
    expect(levelHint('1. Klasse')).toContain('Zyklus 1');
    expect(levelHint('6. Klasse')).toContain('Zyklus 2');
    expect(levelHint('3. Sek')).toContain('Zyklus 3');
    expect(levelHint('Gymnasium')).toContain('Maturitätsschule');
  });

  it('cleans what the model answered', () => {
    expect(toTopicDraft(null, '5. Klasse', 'NMG')).toEqual({ title: 'Neues Thema', subject: 'NMG', level: '5. Klasse', goals: [], removedPersonalData: false });
  });
});

const TOPIC_FOR_DOC: TaskDocRequest['topic'] = {
  title: 'Die Römer',
  subject: 'Geschichte',
  level: '5. Klasse',
  goals: [
    { id: 'goal-0001', text: 'Du kannst die Gründungssage erzählen.', content: 'Romulus und Remus.' },
    { id: 'goal-0002', text: 'Du kannst die Republik erklären.', content: 'Senat, Konsuln.' },
    { id: 'goal-0003', text: 'Du kannst Spuren in der Schweiz nennen.', content: 'Augusta Raurica.' },
  ],
};

const docRequest = (patch: Partial<TaskDocRequest> = {}): TaskDocRequest => ({
  topicId: 'topic-0001',
  topic: TOPIC_FOR_DOC,
  kind: 'quiz',
  durationMin: 15,
  difficulty: 'mixed',
  goalIds: [],
  ...patch,
});

async function waitForDocument(id: string): Promise<TaskDocument> {
  for (let i = 0; i < 100; i++) {
    const doc = (await app.inject({ method: 'GET', url: `/api/tasks/documents/${id}`, headers: { cookie } })).json().document as TaskDocument;
    if (doc.status !== 'pending') return doc;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('still pending');
}

describe('documents of «Aufgaben»', () => {
  it('writes a test in the background, checks it, and counts it once it is ready', async () => {
    const res = await post('/api/tasks/documents', docRequest());
    expect(res.statusCode).toBe(200);
    const pending = res.json().document as TaskDocument;
    expect(pending).toMatchObject({ status: 'pending', kind: 'quiz', title: 'Wissenstest: Die Römer', goalIds: ['goal-0001', 'goal-0002', 'goal-0003'] });

    const doc = await waitForDocument(pending.id);
    expect(doc.status).toBe('ready');
    expect(doc.intro).toBe('Du hast 15 Minuten Zeit. Keine Hilfsmittel.');
    expect(doc.tasks.map((t) => t.type)).toEqual(['choice', 'truefalse', 'short', 'open', 'short']);
    // The check corrected the open task.
    expect(doc.tasks[3]!.solution).toBe('Die Volksversammlung beschliesst Gesetze; der Senat berät.');
    const prompt = ai.calls.find((c) => c.system.includes('Unterlagen zur Prüfungsvorbereitung'))!.system;
    expect(prompt).toContain('WISSENSTEST mit genau 10 kurzen Fragen');
    expect(prompt).toContain('3: Du kannst Spuren in der Schweiz nennen. – Kernstoff: Augusta Raurica.');
    expect(prompt).toContain('Lehrplan 21 Zyklus 2');

    const usage = (await app.inject({ method: 'GET', url: '/api/tasks/usage', headers: { cookie } })).json() as TaskUsage;
    expect(usage).toMatchObject({ used: 1, limit: 20, remaining: 19 });
    const list = await app.inject({ method: 'GET', url: '/api/tasks/documents?topicId=topic-0001', headers: { cookie } });
    expect(list.json().documents.map((d: TaskDocument) => d.id)).toEqual([doc.id]);

    expect((await app.inject({ method: 'DELETE', url: `/api/tasks/documents/${doc.id}`, headers: { ...HEADERS, cookie } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/documents/${doc.id}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it('uses only the chosen goals, and writes one document at a time', async () => {
    const first = await post('/api/tasks/documents', docRequest({ kind: 'exam', durationMin: 45, goalIds: ['goal-0002', 'unknown'] }));
    expect(first.json().document.goalIds).toEqual(['goal-0002']);
    const second = await post('/api/tasks/documents', docRequest());
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toBe('task_running');
    const doc = await waitForDocument(first.json().document.id);
    expect(doc.status).toBe('ready');
    const prompt = ai.calls.find((c) => c.system.includes('Unterlagen zur Prüfungsvorbereitung'))!.system;
    expect(prompt).toContain('PROBEPRÜFUNG');
    expect(prompt).toContain('2: Du kannst die Republik erklären.');
    expect(prompt).not.toContain('1: Du kannst die Gründungssage');
  });

  it('says when it did not work, without counting', async () => {
    ai.replies.push({ status: 500 }, { status: 500 });
    const res = await post('/api/tasks/documents', docRequest());
    const doc = await waitForDocument(res.json().document.id);
    expect(doc).toMatchObject({ status: 'failed', error: 'Das hat leider nicht geklappt. Versuch es nochmals.' });
    expect((await app.inject({ method: 'GET', url: '/api/tasks/usage', headers: { cookie } })).json().used).toBe(0);
  });

  it('stops at the monthly limit', async () => {
    app.db.prepare("INSERT INTO task_usage (user_id, month, count) SELECT id, ?, 20 FROM users").run(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
    const res = await post('/api/tasks/documents', docRequest());
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('task_limit');
  });

  it('needs a topic with goals', async () => {
    expect((await post('/api/tasks/documents', docRequest({ topic: { ...TOPIC_FOR_DOC, goals: [] } }))).statusCode).toBe(400);
  });
});

describe('results and Lernkarten of «Aufgaben»', () => {
  it('keeps the results of a document: in the app or entered after paper, points within the task', async () => {
    const doc = await waitForDocument((await post('/api/tasks/documents', docRequest())).json().document.id);
    const [t1, , , t4] = doc.tasks;
    const res = await post(`/api/tasks/documents/${doc.id}/attempts`, {
      id: 'attempt-01',
      at: Date.now(),
      mode: 'paper',
      learner: 'Lea',
      scores: { [t1!.id]: 1, [t4!.id]: 7.3, unknown: 3 },
    });
    expect(res.statusCode).toBe(200);
    const saved = res.json().document as TaskDocument;
    expect(saved.attempts).toHaveLength(1);
    // More than the task gives is cut to its points; unknown tasks are dropped.
    expect(saved.attempts[0]).toMatchObject({ mode: 'paper', learner: 'Lea', scores: { [t1!.id]: 1, [t4!.id]: 2 } });

    const again = await post(`/api/tasks/documents/${doc.id}/attempts`, { id: 'attempt-02', at: Date.now(), mode: 'app', scores: { [t1!.id]: 0 } });
    expect(again.json().document.attempts.map((a: DocAttempt) => a.id)).toEqual(['attempt-01', 'attempt-02']);
    const removed = await app.inject({ method: 'DELETE', url: `/api/tasks/documents/${doc.id}/attempts/attempt-01`, headers: { ...HEADERS, cookie } });
    expect(removed.json().document.attempts.map((a: DocAttempt) => a.id)).toEqual(['attempt-02']);
    expect((await post('/api/tasks/documents/unknown-document/attempts', { id: 'attempt-03', at: 1, mode: 'app', scores: {} })).statusCode).toBe(404);
  });

  it('writes Lernkarten from the learning goals, marks doubtful ones and counts like a photo analysis', async () => {
    const res = await post('/api/tasks/cards', { topic: TOPIC_FOR_DOC, goalIds: ['goal-0001', 'goal-0002'], count: 12 });
    expect(res.statusCode).toBe(200);
    const { draft, usage } = res.json() as LearnExtractResponse;
    expect(draft).toMatchObject({ title: 'Die Römer', subject: 'Geschichte', generated: true });
    expect(draft.cards.map((c) => c.kind)).toEqual(['qa', 'number', 'cloze']);
    expect(draft.cards[1]!.uncertain).toBe('Möglicherweise falsch – Jahreszahl prüfen.');
    expect(usage.used).toBe(1);
    const call = ai.calls.find((c) => c.system.includes('LERNKARTEN ZU LERNZIELEN'))!;
    expect(call.system).toContain('genau 12 Lernkarten');
    const question = String(call.body.messages[1].content);
    expect(question).toContain('Kernstoff: Senat, Konsuln.');
    expect(question).not.toContain('Spuren in der Schweiz');
  });
});

describe('document helpers', () => {
  const goals = TOPIC_FOR_DOC.goals;
  it('fits the number of tasks to the time', () => {
    expect(documentSize('quiz', 15)).toEqual({ tasks: 10, points: 10 });
    expect(documentSize('exam', 45)).toEqual({ tasks: 15, points: 42 });
    expect(documentPrompt(docRequest({ kind: 'tasks', durationMin: 30 }))).toContain('genau 8 Aufgaben');
  });

  it('cleans the tasks: right answer among the options, «richtig»/«falsch», goals, points and space', () => {
    const tasks = toTasks(DOC_ANSWER, goals, 'quiz');
    expect(tasks).toHaveLength(5);
    expect(tasks[0]).toMatchObject({ id: 't1', type: 'choice', goalId: 'goal-0001', points: 1, lines: 0 });
    expect(tasks[1]).toMatchObject({ type: 'truefalse', answer: 'richtig' });
    expect(tasks[2]).toMatchObject({ type: 'short', accepted: ['Augusta Rauracorum'], lines: 1 });
    expect(tasks[3]).toMatchObject({ type: 'open', points: 2, lines: 4 });
    // The right answer was not among the options: asked as a short question.
    expect(tasks[4]).toMatchObject({ type: 'short', options: [], answer: '1291' });
    // In a task sheet, choice questions keep their points.
    expect(toTasks(DOC_ANSWER, goals, 'exam')[0]!.points).toBe(3);
  });

  it('keeps at most 20 results, the latest, ordered by time', () => {
    const tasks = toTasks(DOC_ANSWER, goals, 'exam');
    let attempts: DocAttempt[] = [];
    for (let i = 0; i < 25; i++) attempts = withAttempt(attempts, toAttempt({ tasks }, { id: `a${i}`, at: 1000 + i, mode: 'app', learner: '', scores: {} }));
    expect(attempts).toHaveLength(20);
    expect(attempts[0]!.id).toBe('a5');
    expect(toAttempt({ tasks }, { id: 'x', at: 1, mode: 'app', learner: ' Lea ', scores: { t1: 1.26, t2: -1 } }).scores).toEqual({ t1: 1.5, t2: 0 });
  });

  it('takes over the corrections of the check, and marks what it cannot fix', () => {
    const tasks = toTasks(DOC_ANSWER, goals, 'exam') as DocTask[];
    const checked = applyChecks(tasks, [
      { index: 0, correct: false, reason: 'Falsche Antwort.', answer: 'Caesar', solution: 'Caesar …' },
      { index: 1, correct: false, reason: 'Mehrdeutig.', answer: '', solution: '' },
      { index: 2, correct: true, reason: '', answer: '', solution: '' },
      { index: 99, correct: false, reason: 'x', answer: 'y', solution: '' },
    ]);
    expect(checked[0]).toMatchObject({ answer: 'Caesar', solution: 'Caesar …', doubt: '' });
    expect(checked[1]).toMatchObject({ answer: 'richtig', doubt: 'Mehrdeutig.' });
    expect(checked[2]).toEqual(tasks[2]);
  });
});
