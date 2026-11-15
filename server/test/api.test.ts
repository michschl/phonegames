import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import type { PlayerGroup, SyncResponse } from '../../shared/types.ts';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
});

afterEach(async () => {
  await app.close();
});

const HEADERS = { 'x-requested-with': 'plausch' };
/** Realistic base timestamp – very old tombstones would be pruned. */
const T = Date.now() - 60_000;

function cookieFrom(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === 'plausch_session');
  if (!cookie) throw new Error('no session cookie');
  return `plausch_session=${cookie.value}`;
}

async function register(email = 'anna@example.ch', password = 'geheim123') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Anna', email, password },
  });
  expect(res.statusCode).toBe(201);
  return { cookie: cookieFrom(res), user: res.json().user };
}

function group(overrides: Partial<PlayerGroup> = {}): PlayerGroup {
  return {
    id: 'group-0001',
    name: 'WG-Abend',
    emoji: '🎉',
    players: [
      { id: 'player-01', name: 'Mia', color: '#ff3d8b' },
      { id: 'player-02', name: 'Luca', color: '#2de2e6' },
    ],
    createdAt: T,
    updatedAt: T,
    deleted: false,
    ...overrides,
  };
}

describe('auth', () => {
  it('registers, reads the profile and logs out', async () => {
    const { cookie, user } = await register();
    expect(user).toMatchObject({ name: 'Anna', email: 'anna@example.ch' });
    expect(user).not.toHaveProperty('passwordHash');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe(user.id);

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...HEADERS, cookie } });
    expect(logout.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects duplicate e-mails case-insensitively', async () => {
    await register('anna@example.ch');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Anna 2', email: 'ANNA@example.ch', password: 'geheim123' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain('bereits');
  });

  it('validates input with German messages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Anna', email: 'keine-mail', password: 'kurz' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/E-Mail/);
  });

  it('logs in with correct credentials only', async () => {
    await register();
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: HEADERS,
      payload: { email: 'anna@example.ch', password: 'falsch!!' },
    });
    expect(wrong.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: HEADERS,
      payload: { email: ' Anna@Example.ch ', password: 'geheim123' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.cookies.find((c) => c.name === 'plausch_session')?.httpOnly).toBe(true);
  });

  it('blocks state changing requests without the CSRF header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'anna@example.ch', password: 'geheim123' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('account', () => {
  it('updates the profile and requires the password for e-mail changes', async () => {
    const { cookie } = await register();
    const profile = await app.inject({
      method: 'PATCH',
      url: '/api/account',
      headers: { ...HEADERS, cookie },
      payload: { name: 'Anna B.', avatar: '🐸', color: '#3ddc97' },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user).toMatchObject({ name: 'Anna B.', avatar: '🐸', color: '#3ddc97' });

    const noPassword = await app.inject({
      method: 'PATCH',
      url: '/api/account',
      headers: { ...HEADERS, cookie },
      payload: { email: 'neu@example.ch' },
    });
    expect(noPassword.statusCode).toBe(403);

    const withPassword = await app.inject({
      method: 'PATCH',
      url: '/api/account',
      headers: { ...HEADERS, cookie },
      payload: { email: 'neu@example.ch', password: 'geheim123' },
    });
    expect(withPassword.json().user.email).toBe('neu@example.ch');
  });

  it('changes the password and logs out other sessions', async () => {
    const { cookie } = await register();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: HEADERS,
      payload: { email: 'anna@example.ch', password: 'geheim123' },
    });
    const otherDevice = cookieFrom(login);

    const change = await app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: { ...HEADERS, cookie },
      payload: { currentPassword: 'geheim123', newPassword: 'noch-geheimer' },
    });
    expect(change.statusCode).toBe(204);

    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: otherDevice } })).statusCode).toBe(401);
  });

  it('deletes the account including all data', async () => {
    const { cookie } = await register();
    await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...HEADERS, cookie },
      payload: { library: [], groups: [group()] },
    });
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      headers: { ...HEADERS, cookie },
      payload: { password: 'geheim123' },
    });
    expect(del.statusCode).toBe(204);
    const rows = app.db.prepare('SELECT COUNT(*) AS n FROM player_groups').get() as { n: number };
    expect(rows.n).toBe(0);
    await register(); // the e-mail can be used again
  });
});

describe('sync', () => {
  it('requires a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: HEADERS,
      payload: { library: [], groups: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('merges records with last-write-wins', async () => {
    const { cookie } = await register();
    const sync = async (payload: object) => {
      const res = await app.inject({ method: 'POST', url: '/api/sync', headers: { ...HEADERS, cookie }, payload });
      expect(res.statusCode).toBe(200);
      return res.json() as SyncResponse;
    };

    const first = await sync({
      library: [{ gameId: 'bombe', addedAt: T, updatedAt: T, deleted: false }],
      groups: [group()],
    });
    expect(first.library).toHaveLength(1);
    expect(first.groups[0]!.players).toHaveLength(2);

    // An older version from another device must not overwrite the newer one.
    const second = await sync({ library: [], groups: [group({ name: 'Alt', updatedAt: T - 500 })] });
    expect(second.groups[0]!.name).toBe('WG-Abend');

    // A newer deletion wins.
    const third = await sync({
      library: [{ gameId: 'bombe', addedAt: T, updatedAt: T + 1000, deleted: true }],
      groups: [],
    });
    expect(third.library[0]!.deleted).toBe(true);
  });

  it('isolates data between users', async () => {
    const anna = await register('anna@example.ch');
    await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...HEADERS, cookie: anna.cookie },
      payload: { library: [], groups: [group()] },
    });
    const ben = await register('ben@example.ch');
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: { ...HEADERS, cookie: ben.cookie },
      payload: { library: [], groups: [] },
    });
    expect((res.json() as SyncResponse).groups).toHaveLength(0);
  });
});
