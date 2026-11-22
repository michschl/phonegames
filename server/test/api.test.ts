import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import type { PlayerGroup, SyncResponse } from '../../shared/types.ts';
import { TERMS_VERSION } from '../../shared/legal.ts';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
});

afterEach(async () => {
  await app.close();
});

const HEADERS = { 'x-requested-with': 'phonegames' };
/** Realistic base timestamp – very old tombstones would be pruned. */
const T = Date.now() - 60_000;

function cookieFrom(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === 'phonegames_session');
  if (!cookie) throw new Error('no session cookie');
  return `phonegames_session=${cookie.value}`;
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

describe('terms of use', () => {
  it('stores the consent from registering, and asks again for a new version', async () => {
    const withConsent = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Lea', email: 'lea@example.ch', password: 'geheim123', termsVersion: TERMS_VERSION },
    });
    expect(withConsent.json().user).toMatchObject({ termsAccepted: true });
    expect(withConsent.json().user.termsAcceptedAt).toBeGreaterThan(0);

    // Older apps send no consent: the app asks before anything else.
    const { cookie, user } = await register('ben@example.ch');
    expect(user).toMatchObject({ termsAccepted: false, termsAcceptedAt: null });
    const accept = (version: string) =>
      app.inject({ method: 'POST', url: '/api/account/terms', headers: { ...HEADERS, cookie }, payload: { version } });
    expect((await accept('2999-01-01')).statusCode).toBe(400);
    expect((await accept('2020-01-01')).json().user).toMatchObject({ termsAccepted: false });
    expect((await accept(TERMS_VERSION)).json().user).toMatchObject({ termsAccepted: true });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.termsAccepted).toBe(true);
  });
});

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
    expect(ok.cookies.find((c) => c.name === 'phonegames_session')?.httpOnly).toBe(true);
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

describe('invitation codes', () => {
  let gated: FastifyInstance;

  beforeEach(async () => {
    gated = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, inviteCodes: ['PARTY-2026', 'Familie'] });
  });

  afterEach(async () => {
    await gated.close();
  });

  const attempt = (inviteCode?: string, email = 'ben@example.ch') =>
    gated.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Ben', email, password: 'geheim123', ...(inviteCode !== undefined ? { inviteCode } : {}) },
    });

  it('tells the client whether a code is needed', async () => {
    const open = await app.inject({ method: 'GET', url: '/api/auth/options' });
    expect(open.json()).toEqual({ inviteRequired: false, passkeys: null, tts: null, billing: null });
    const closed = await gated.inject({ method: 'GET', url: '/api/auth/options' });
    expect(closed.json()).toMatchObject({ inviteRequired: true });
  });

  it('rejects registrations without or with a wrong code', async () => {
    const missing = await attempt();
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error).toBe('invite_required');

    const blank = await attempt('   ');
    expect(blank.json().error).toBe('invite_required');

    const wrong = await attempt('PARTY-2025');
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toMatchObject({ error: 'invalid_invite', message: expect.stringContaining('Einladungscode') });
    expect(wrong.cookies.find((c) => c.name === 'phonegames_session')).toBeUndefined();
  });

  it('accepts any valid code, ignoring case and spaces', async () => {
    expect((await attempt('party-2026')).statusCode).toBe(201);
    expect((await attempt(' FAMI LIE ', 'carla@example.ch')).statusCode).toBe(201);
  });

  it('checks the code before revealing that an e-mail exists', async () => {
    expect((await attempt('PARTY-2026')).statusCode).toBe(201);
    const probe = await attempt('falsch');
    expect(probe.json().error).toBe('invalid_invite');
    const duplicate = await attempt('PARTY-2026');
    expect(duplicate.statusCode).toBe(409);
  });

  it('does not affect logging in', async () => {
    await attempt('PARTY-2026');
    const res = await gated.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: HEADERS,
      payload: { email: 'ben@example.ch', password: 'geheim123' },
    });
    expect(res.statusCode).toBe(200);
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
