import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import type { LearnConfig } from '../src/routes/learn.ts';
import { levelHint, toTopicDraft } from '../src/routes/tasks.ts';
import type { LearnTopic, SyncResponse, TopicDraftResponse } from '../../shared/types.ts';
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

let app: FastifyInstance;
let ai: ReturnType<typeof fakeAi>;
let cookie: string;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { ...HEADERS, cookie }, payload });

beforeEach(async () => {
  ai = fakeAi(() => TOPIC_ANSWER);
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
