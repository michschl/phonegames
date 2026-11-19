import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { LIMITS, type LearnShareInfo, type LearnSharePreview, type LearnShareStack } from '../../shared/types.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
const STACK = {
  stackId: 'stack-0001',
  title: 'Unité 5',
  subject: 'Französisch',
  languages: ['fr', 'de'],
  suggestedModes: ['kasten', 'blitz'],
  cards: [
    { id: 'card-0001', kind: 'translation', prompt: 'le chien', answer: 'der Hund', accepted: [], distractors: ['die Katze'] },
    { id: 'card-0002', kind: 'translation', prompt: 'la maison', answer: 'das Haus', accepted: [], distractors: [] },
    { id: 'card-0003', kind: 'translation', prompt: 'manger', answer: 'essen', accepted: [], distractors: [] },
    { id: 'card-0004', kind: 'translation', prompt: 'toujours', answer: 'immer', accepted: [], distractors: [] },
  ],
};

let app: FastifyInstance;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

async function register(email: string, extra: Record<string, string> = { inviteCode: 'PARTY-2026' }) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Lea', email, password: 'geheim123', ...extra },
  });
  return { res, cookie: res.statusCode === 201 ? cookieFrom(res) : '' };
}

const share = async (cookie: string, payload: object = STACK) =>
  app.inject({ method: 'POST', url: '/api/shares', headers: { ...HEADERS, cookie }, payload });

beforeEach(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, inviteCodes: ['PARTY-2026'] });
});

afterEach(async () => {
  await app.close();
});

describe('sharing learning stacks', () => {
  it('creates one link per stack and updates the cards behind it', async () => {
    const { cookie } = await register('owner@example.ch');
    const first = await share(cookie);
    expect(first.statusCode).toBe(200);
    const info = first.json().share as LearnShareInfo;
    expect(info.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(info.stackId).toBe('stack-0001');

    const updated = await share(cookie, { ...STACK, title: 'Unité 5 (neu)' });
    expect((updated.json().share as LearnShareInfo).id).toBe(info.id);

    const mine = await app.inject({ method: 'GET', url: '/api/shares/mine', headers: { cookie } });
    expect(mine.json().shares).toHaveLength(1);

    const preview = await app.inject({ method: 'GET', url: `/api/shares/${info.id}` });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['x-robots-tag']).toBe('noindex');
    expect(preview.json()).toMatchObject({
      title: 'Unité 5 (neu)',
      subject: 'Französisch',
      cardCount: 4,
      invites: true,
      sample: [
        { prompt: 'le chien', answer: 'der Hund' },
        { prompt: 'la maison', answer: 'das Haus' },
        { prompt: 'manger', answer: 'essen' },
      ],
    } satisfies Partial<LearnSharePreview>);
  });

  it('lets signed-in people take over a copy, without progress or names', async () => {
    const { cookie } = await register('owner@example.ch');
    const id = ((await share(cookie)).json().share as LearnShareInfo).id;
    const other = await register('ben@example.ch');

    expect((await app.inject({ method: 'POST', url: `/api/shares/${id}/import`, headers: HEADERS })).statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: `/api/shares/${id}/import`, headers: { ...HEADERS, cookie: other.cookie } });
    expect(res.statusCode).toBe(200);
    const stack = res.json().stack as LearnShareStack;
    expect(stack.cards).toHaveLength(4);
    expect(Object.keys(stack).sort()).toEqual(['cards', 'languages', 'subject', 'suggestedModes', 'title']);

    const mine = await app.inject({ method: 'GET', url: '/api/shares/mine', headers: { cookie } });
    expect(mine.json().shares[0].imports).toBe(1);
  });

  it('only the owner can end sharing, and the link stops working', async () => {
    const { cookie } = await register('owner@example.ch');
    const id = ((await share(cookie)).json().share as LearnShareInfo).id;
    const other = await register('ben@example.ch');

    expect((await app.inject({ method: 'DELETE', url: `/api/shares/${id}`, headers: { ...HEADERS, cookie: other.cookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/shares/${id}`, headers: { ...HEADERS, cookie } })).statusCode).toBe(204);
    const gone = await app.inject({ method: 'GET', url: `/api/shares/${id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error).toBe('share_not_found');

    // Sharing again gives a new link – the old one stays dead.
    const again = ((await share(cookie)).json().share as LearnShareInfo).id;
    expect(again).not.toBe(id);
  });

  it('counts the link as an invitation, up to the limit', async () => {
    const { cookie } = await register('owner@example.ch');
    const id = ((await share(cookie)).json().share as LearnShareInfo).id;

    const without = await register('nocode@example.ch', {});
    expect(without.res.statusCode).toBe(403);
    const wrongLink = await register('wrong@example.ch', { shareId: 'xxxxxxxxxxxxxxxxxxxxxx' });
    expect(wrongLink.res.statusCode).toBe(403);

    const invited = await register('friend@example.ch', { shareId: id });
    expect(invited.res.statusCode).toBe(201);
    const mine = await app.inject({ method: 'GET', url: '/api/shares/mine', headers: { cookie } });
    expect(mine.json().shares[0].signups).toBe(1);

    // Used up: the link no longer replaces the invitation code.
    app.db.prepare('UPDATE learn_shares SET signups = ? WHERE id = ?').run(LIMITS.shareSignups, id);
    expect((await app.inject({ method: 'GET', url: `/api/shares/${id}` })).json().invites).toBe(false);
    expect((await register('late@example.ch', { shareId: id })).res.statusCode).toBe(403);
    // A valid code still works together with the link.
    expect((await register('late2@example.ch', { shareId: id, inviteCode: 'PARTY-2026' })).res.statusCode).toBe(201);
  });

  it('validates the shared cards', async () => {
    const { cookie } = await register('owner@example.ch');
    expect((await share(cookie, { ...STACK, cards: [] })).statusCode).toBe(400);
    expect((await share(cookie, { ...STACK, title: '' })).statusCode).toBe(400);
    expect((await share('', STACK)).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/shares/<script>' })).statusCode).toBe(400);
  });

  it('keeps shared stack pages out of search engines', async () => {
    const withClient = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, serveClient: true, clientDir: '/nonexistent' });
    const res = await withClient.inject({ method: 'GET', url: '/s/abcdefghijklmnop' });
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    await withClient.close();
  });
});
