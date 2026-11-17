import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { currentMonth, shorten, toDraft, type LearnConfig } from '../src/routes/learn.ts';
import type { LearnExtractResponse, LearnStack, LearnUsage, SyncResponse } from '../../shared/types.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
/** Smallest possible JPEG header – enough for the magic-byte check. */
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64')}`;
const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d', 'hex').toString('base64')}`;

const GOOD_ANSWER = {
  title: 'Unité 5 – Vocabulaire',
  subject: 'Französisch',
  languages: ['fr', 'de'],
  cards: [
    { kind: 'translation', prompt: 'le chien', answer: 'der Hund', accepted: ['der Hund'], distractors: ['die Katze', 'das Haus', 'der Bruder'], uncertain: '' },
    { kind: 'translation', prompt: 'beaucoup', answer: 'viel, sehr', accepted: ['viel', 'sehr'], distractors: ['wenig', 'nie', 'immer'], uncertain: '' },
    { kind: 'translation', prompt: 'le chien', answer: 'der Hund', accepted: [], distractors: [], uncertain: '' },
    { kind: 'weird', prompt: 'toujours', answer: 'immer', accepted: [], distractors: ['immer', 'nie', 'oft', 'heute', 'morgen'], uncertain: 'Schrift unklar' },
    { kind: 'qa', prompt: '   ', answer: 'leer', accepted: [], distractors: [], uncertain: '' },
  ],
  suggested_modes: ['blitz', 'duell'],
  removed_personal_data: true,
};

type Reply = { status?: number; content?: string };

/** Stand-in for the Infomaniak OpenAI-compatible endpoint. */
function fakeAi() {
  const calls: { url: string; auth: string | undefined; body: Record<string, any> }[] = [];
  const replies: Reply[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      calls.push({ url: req.url!, auth: req.headers.authorization, body: JSON.parse(body) });
      const reply = replies.shift() ?? { content: JSON.stringify(GOOD_ANSWER) };
      if (reply.status && reply.status !== 200) {
        res.writeHead(reply.status).end('{"error":"boom"}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          model: 'Qwen/Qwen3.8-27B-FP8',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: reply.content } }],
          usage: { prompt_tokens: 2367, completion_tokens: 780 },
        }),
      );
    });
  });
  return {
    calls,
    replies,
    start: () => new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let app: FastifyInstance;
let ai: ReturnType<typeof fakeAi>;
let cookie: string;
let learn: LearnConfig;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

async function register(target: FastifyInstance, email = 'lea@example.ch'): Promise<string> {
  const res = await target.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Lea', email, password: 'geheim123' },
  });
  return cookieFrom(res);
}

const extract = (images: string[] = [JPEG], withCookie = cookie) =>
  app.inject({ method: 'POST', url: '/api/learn/extract', headers: { ...HEADERS, cookie: withCookie }, payload: { images } });

const usage = async () =>
  (await app.inject({ method: 'GET', url: '/api/learn/usage', headers: { cookie } })).json() as LearnUsage;

beforeEach(async () => {
  ai = fakeAi();
  const url = await ai.start();
  learn = { url, productId: '112859', token: 'test-token', model: 'Qwen/Qwen3.8-27B-FP8', monthlyLimit: 3, globalMonthlyLimit: 100 };
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, learn });
  cookie = await register(app);
});

afterEach(async () => {
  await app.close();
  await ai.stop();
});

describe('photo analysis (learning stacks)', () => {
  it('turns photos into a reviewed draft and counts the analysis', async () => {
    expect(await usage()).toMatchObject({ available: true, used: 0, limit: 3, remaining: 3, maxPhotos: 6 });

    const res = await extract([JPEG, PNG]);
    expect(res.statusCode).toBe(200);
    const { draft, usage: after } = res.json() as LearnExtractResponse;
    expect(after).toMatchObject({ used: 1, remaining: 2 });
    expect(draft.title).toBe('Unité 5 – Vocabulaire');
    expect(draft.languages).toEqual(['fr', 'de']);
    expect(draft.removedPersonalData).toBe(true);
    // Duplicates and empty cards are dropped, the answer is not repeated in accepted/distractors.
    expect(draft.cards.map((c) => c.prompt)).toEqual(['le chien', 'beaucoup', 'toujours']);
    expect(draft.cards[0]).toMatchObject({ accepted: [], distractors: ['die Katze', 'das Haus', 'der Bruder'] });
    expect(draft.cards[1]!.accepted).toEqual(['viel', 'sehr']);
    expect(draft.cards[2]).toMatchObject({ kind: 'qa', distractors: ['nie', 'oft', 'heute'], uncertain: 'Schrift unklar' });
    expect(draft.suggestedModes).toEqual(['blitz', 'duell', 'kasten']);

    // What was sent to the AI service.
    const call = ai.calls[0]!;
    expect(call.url).toBe('/2/ai/112859/openai/v1/chat/completions');
    expect(call.auth).toBe('Bearer test-token');
    expect(call.body.model).toBe('Qwen/Qwen3.8-27B-FP8');
    expect(call.body.reasoning_effort).toBe('none');
    expect(call.body.response_format.type).toBe('json_schema');
    const images = call.body.messages[1].content.filter((part: { type: string }) => part.type === 'image_url');
    expect(images.map((part: { image_url: { url: string } }) => part.image_url.url)).toEqual([JPEG, PNG]);
  });

  it('takes over exactly by default and invents new cards on request', async () => {
    const exact = (await extract()).json() as LearnExtractResponse;
    expect(exact.draft.generated).toBe(false);
    expect(ai.calls[0]!.body.messages[0].content).toContain('Übernimm nur Lerninhalte, die auf den Fotos stehen.');
    expect(ai.calls[0]!.body.temperature).toBe(0.2);

    // Invented cards are checked once more – the second call has no photos and marks doubtful cards.
    ai.replies.push({ content: JSON.stringify(GOOD_ANSWER) });
    ai.replies.push({
      content: JSON.stringify({ checks: [{ index: 0, correct: true, reason: '' }, { index: 1, correct: false, reason: '«beaucoup» heisst «viel».' }] }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/learn/extract',
      headers: { ...HEADERS, cookie },
      payload: { images: [JPEG], mode: 'creative', count: 12 },
    });
    expect(res.statusCode).toBe(200);
    const creative = (res.json() as LearnExtractResponse).draft;
    expect(creative.generated).toBe(true);
    expect(creative.cards.map((c) => c.uncertain)).toEqual(['', 'Möglicherweise falsch – «beaucoup» heisst «viel».', 'Schrift unklar']);
    const check = ai.calls[2]!;
    expect(check.body.messages[1].content).toContain('1. Frage/Satz: beaucoup | Antwort: viel, sehr');
    expect(JSON.stringify(check.body)).not.toContain('image_url');
    expect(check.body.temperature).toBe(0);
    const call = ai.calls[1]!;
    expect(call.body.messages[0].content).toContain('NEUE AUFGABEN ERFINDEN');
    expect(call.body.messages[0].content).toContain('genau 12 neue Lernkarten');
    expect(call.body.messages[0].content).not.toContain('Übernimm nur Lerninhalte');
    expect(call.body.messages[1].content[0].text).toContain('Erfinde 12 neue Lernkarten');
    expect(call.body.temperature).toBe(0.7);
    // Both count towards the monthly limit.
    expect(await usage()).toMatchObject({ used: 2 });

    const tooMany = await app.inject({
      method: 'POST',
      url: '/api/learn/extract',
      headers: { ...HEADERS, cookie },
      payload: { images: [JPEG], mode: 'creative', count: 500 },
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('is only available when signed in', async () => {
    expect((await extract([JPEG], '')).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/learn/usage' })).statusCode).toBe(401);
  });

  it('accepts only real images, at most six', async () => {
    const fakeJpeg = `data:image/jpeg;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
    expect((await extract([fakeJpeg])).statusCode).toBe(400);
    expect((await extract(['https://example.com/a.jpg'])).statusCode).toBe(400);
    expect((await extract([])).statusCode).toBe(400);
    expect((await extract(Array(7).fill(JPEG))).statusCode).toBe(400);
    expect(ai.calls).toHaveLength(0);
    expect((await usage()).used).toBe(0);
  });

  it('stops at the monthly limit per person', async () => {
    for (let i = 0; i < 3; i++) expect((await extract()).statusCode).toBe(200);
    const res = await extract();
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe('learn_limit');
    expect(res.json().message).toMatch(/alle 3 Auswertungen/);
    expect(ai.calls).toHaveLength(3);

    // Another person still has their own allowance.
    const other = await register(app, 'tim@example.ch');
    expect((await extract([JPEG], other)).statusCode).toBe(200);
  });

  it('stops for everybody at the global monthly limit', async () => {
    await app.close();
    app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, learn: { ...learn, globalMonthlyLimit: 1 } });
    cookie = await register(app);
    expect((await extract()).statusCode).toBe(200);
    const other = await register(app, 'tim@example.ch');
    const res = await extract([JPEG], other);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('learn_busy');
  });

  it('retries once and does not count failed analyses', async () => {
    ai.replies.push({ status: 500 }, { content: JSON.stringify(GOOD_ANSWER) });
    expect((await extract()).statusCode).toBe(200);
    expect(ai.calls).toHaveLength(2);

    ai.replies.push({ content: 'kein json' }, { status: 503 });
    const res = await extract();
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('learn_failed');
    expect((await usage()).used).toBe(1);
  });

  it('says so when the photos contain no learning material', async () => {
    ai.replies.push({ content: JSON.stringify({ ...GOOD_ANSWER, cards: [] }) });
    const res = await extract();
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('learn_empty');
    expect((await usage()).used).toBe(0);
  });

  it('is switched off without an AI service', async () => {
    const off = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
    const offCookie = await register(off);
    const res = await off.inject({ method: 'POST', url: '/api/learn/extract', headers: { ...HEADERS, cookie: offCookie }, payload: { images: [JPEG] } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('learn_unavailable');
    const status = await off.inject({ method: 'GET', url: '/api/learn/usage', headers: { cookie: offCookie } });
    expect(status.json()).toMatchObject({ available: false, remaining: 0 });
    await off.close();
  });
});

describe('draft clean-up', () => {
  it('falls back to safe values for nonsense', () => {
    const draft = toDraft({ title: 42, cards: 'nope', languages: ['Französisch', 'de'], suggested_modes: ['party'] });
    expect(draft).toEqual({
      title: 'Neuer Stapel',
      subject: '',
      languages: [],
      cards: [],
      suggestedModes: ['kasten'],
      removedPersonalData: false,
      generated: false,
    });
  });

  it('keeps Lückentext cards only with exactly one gap', () => {
    const card = (kind: string, prompt: string, answer: string) => ({ kind, prompt, answer, accepted: [], distractors: [], uncertain: '' });
    const draft = toDraft({
      title: 'Die Schweiz',
      cards: [
        card('cloze', 'Die Schweiz hat _____ Kantone.', '26'),
        card('cloze', 'Die Hauptstadt der Schweiz ist … .', 'Bern'),
        card('cloze', 'Die Aare fliesst durch Bern.', 'Aare'),
        card('qa', 'Der Rhein entspringt im Kanton ___.', 'Graubünden'),
        card('cloze', 'Zwischen ___ und ___ liegt der Gotthard.', 'Uri, Tessin'),
        card('cloze', 'Wie hoch ist der Säntis?', '2502 m'),
        card('number', 'Wie heisst das höchste Gebirge der Schweiz?', 'Alpen'),
        card('number', 'Wie hoch ist der Pilatus?', '2128 m'),
      ],
      suggested_modes: ['luecke', 'schaetzen', 'kasten'],
    });
    expect(draft.cards.map((c) => [c.kind, c.prompt])).toEqual([
      ['cloze', 'Die Schweiz hat ___ Kantone.'],
      ['cloze', 'Die Hauptstadt der Schweiz ist ___ .'],
      ['cloze', 'Die ___ fliesst durch Bern.'],
      ['cloze', 'Der Rhein entspringt im Kanton ___.'],
      ['qa', 'Zwischen ___ und ___ liegt der Gotthard.'],
      ['qa', 'Wie hoch ist der Säntis?'],
      ['qa', 'Wie heisst das höchste Gebirge der Schweiz?'],
      ['number', 'Wie hoch ist der Pilatus?'],
    ]);
    expect(draft.suggestedModes).toEqual(['kasten', 'schaetzen', 'luecke']);
  });

  it('shortens long reasons at a word boundary', () => {
    expect(shorten('kurz', 10)).toBe('kurz');
    expect(shorten('Die Schweiz hat 26 Kantone, aber nicht alle Hauptorte', 30)).toBe('Die Schweiz hat 26 Kantone…');
  });

  it('uses the calendar month in Switzerland', () => {
    // 23:30 UTC on 31 October is already November in Zurich.
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
  });
});

describe('syncing learning stacks', () => {
  const T = 1_790_000_000_000;
  const stack = (patch: Partial<LearnStack> = {}): LearnStack => ({
    id: 'stack-0001',
    title: 'Unité 5',
    subject: 'Französisch',
    languages: ['fr', 'de'],
    cards: [{ id: 'card-0001', kind: 'translation', prompt: 'le chien', answer: 'der Hund', accepted: [], distractors: ['die Katze'] }],
    suggestedModes: ['kasten'],
    source: 'photo',
    createdAt: T,
    updatedAt: T,
    deleted: false,
    ...patch,
  });
  const sync = async (payload: object) => {
    const res = await app.inject({ method: 'POST', url: '/api/sync', headers: { ...HEADERS, cookie }, payload });
    expect(res.statusCode).toBe(200);
    return res.json() as SyncResponse;
  };

  it('stores stacks and progress with last-write-wins', async () => {
    const progress = { id: 'p-stack-0001-abc123', stackId: 'stack-0001', player: 'Lea', cards: { 'card-0001': { box: 2, due: T } }, updatedAt: T, deleted: false };
    const first = await sync({ library: [], groups: [], stacks: [stack()], progress: [progress] });
    expect(first.stacks).toHaveLength(1);
    expect(first.stacks[0]!.cards[0]!.prompt).toBe('le chien');
    expect(first.progress[0]!.cards['card-0001']!.box).toBe(2);
    // Older versions send no learning days – they come back as an empty list.
    expect(first.progress[0]!.days).toEqual([]);

    const withDays = await sync({ library: [], groups: [], stacks: [], progress: [{ ...progress, days: ['2026-11-15', '2026-11-16'], updatedAt: T + 5 }] });
    expect(withDays.progress[0]!.days).toEqual(['2026-11-15', '2026-11-16']);

    const older = await sync({ library: [], groups: [], stacks: [stack({ title: 'Alt', updatedAt: T - 1 })], progress: [] });
    expect(older.stacks[0]!.title).toBe('Unité 5');

    const deleted = await sync({ library: [], groups: [], stacks: [stack({ deleted: true, updatedAt: T + 1 })], progress: [] });
    expect(deleted.stacks[0]).toMatchObject({ deleted: true, cards: [] });
  });

  it('keeps who was removed from a stack, with an empty Kartenkasten, until it is cleared', async () => {
    const progress = { id: 'p-stack-0001-ben001', stackId: 'stack-0001', player: 'Ben', cards: { 'card-0001': { box: 3, due: T } }, days: ['2026-11-16'], updatedAt: T, deleted: false };
    await sync({ library: [], groups: [], stacks: [stack()], progress: [progress] });
    const removed = await sync({ library: [], groups: [], stacks: [], progress: [{ ...progress, removed: true, updatedAt: T + 1 }] });
    expect(removed.progress.find((p) => p.id === progress.id)).toMatchObject({ removed: true, cards: {}, days: [], deleted: false });
    // Added again: a deleted record removes nobody.
    const back = await sync({ library: [], groups: [], stacks: [], progress: [{ ...progress, cards: {}, removed: false, deleted: true, updatedAt: T + 2 }] });
    const entry = back.progress.find((p) => p.id === progress.id)!;
    expect(entry.deleted).toBe(true);
    expect(entry.removed).toBeUndefined();
  });

  it('still accepts the payload of older app versions', async () => {
    const res = await sync({ library: [], groups: [] });
    expect(res.stacks).toEqual([]);
    expect(res.progress).toEqual([]);
  });

  it('rejects invalid learning days', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...HEADERS, cookie },
      payload: { library: [], groups: [], stacks: [], progress: [{ id: 'p-x-123456', stackId: 'stack-0001', player: 'Lea', cards: {}, days: ['gestern'], updatedAt: T, deleted: false }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid boxes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...HEADERS, cookie },
      payload: { library: [], groups: [], stacks: [], progress: [{ id: 'p-x-123456', stackId: 'stack-0001', player: 'Lea', cards: { 'card-0001': { box: 9, due: T } }, updatedAt: T, deleted: false }] },
    });
    expect(res.statusCode).toBe(400);
  });
});
