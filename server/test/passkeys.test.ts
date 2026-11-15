import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { ChallengeStore } from '../src/routes/passkeys.ts';
import { SoftAuthenticator } from './softAuthenticator.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
const WEBAUTHN = { rpID: 'localhost', rpName: 'Phonegames', origins: ['http://localhost:3000'] };

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, webauthn: WEBAUTHN });
});

afterEach(async () => {
  await app.close();
});

function cookieFrom(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === 'phonegames_session');
  if (!cookie) throw new Error('no session cookie');
  return `phonegames_session=${cookie.value}`;
}

async function signUp(email = 'lea@example.ch') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Lea', email, password: 'geheim123' },
  });
  expect(res.statusCode).toBe(201);
  return { cookie: cookieFrom(res), user: res.json().user };
}

const post = (url: string, payload: unknown, cookie?: string) =>
  app.inject({ method: 'POST', url, headers: { ...HEADERS, ...(cookie ? { cookie } : {}) }, payload: payload as object });

/** Runs the whole "set up a passkey" ceremony and returns the server's answer. */
async function addPasskey(cookie: string, authenticator: SoftAuthenticator) {
  const options = await post('/api/passkeys/register/options', {}, cookie);
  expect(options.statusCode).toBe(200);
  return post('/api/passkeys/register/verify', { response: authenticator.register(options.json()) }, cookie);
}

async function signInWith(authenticator: SoftAuthenticator, origin?: string) {
  const options = await post('/api/passkeys/login/options', {});
  expect(options.statusCode).toBe(200);
  return post('/api/passkeys/login/verify', { response: authenticator.signIn(options.json(), origin) });
}

describe('passkeys', () => {
  it('tells the client whether passkeys are available', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/options' });
    expect(res.json()).toMatchObject({ passkeys: { rpID: 'localhost' } });

    const off = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
    expect((await off.inject({ method: 'GET', url: '/api/auth/options' })).json()).toMatchObject({ passkeys: null });
    const login = await off.inject({ method: 'POST', url: '/api/passkeys/login/options', headers: HEADERS });
    expect(login.statusCode).toBe(503);
    await off.close();
  });

  it('needs a session to set one up', async () => {
    expect((await post('/api/passkeys/register/options', {})).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/passkeys' })).statusCode).toBe(401);
  });

  it('creates options for a discoverable passkey with user verification', async () => {
    const { cookie } = await signUp();
    const res = await post('/api/passkeys/register/options', {}, cookie);
    expect(res.json()).toMatchObject({
      rp: { id: 'localhost', name: 'Phonegames' },
      user: { name: 'lea@example.ch', displayName: 'Lea' },
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
    });
    expect(res.json().challenge).toEqual(expect.any(String));
  });

  it('sets up a passkey and signs in with it', async () => {
    const { cookie, user } = await signUp();
    expect(user).toMatchObject({ passkeys: 0, passkeyHintDismissed: false });
    const authenticator = new SoftAuthenticator();

    const added = await addPasskey(cookie, authenticator);
    expect(added.statusCode).toBe(201);
    expect(added.json().passkey).toMatchObject({ id: authenticator.id, name: 'iCloud-Schlüsselbund', synced: true, lastUsedAt: null });
    expect(added.json().user.passkeys).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/passkeys', headers: { cookie } });
    expect(list.json().passkeys).toHaveLength(1);
    expect(list.json().userHandle).toBe(Buffer.from(user.id).toString('base64url'));

    const login = await signInWith(authenticator);
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ id: user.id, passkeys: 1 });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookieFrom(login) } });
    expect(me.json().user.email).toBe('lea@example.ch');

    const after = await app.inject({ method: 'GET', url: '/api/passkeys', headers: { cookie } });
    expect(after.json().passkeys[0].lastUsedAt).toEqual(expect.any(Number));
  });

  it('names passkeys after the device when the provider is unknown', async () => {
    const { cookie } = await signUp();
    const authenticator = new SoftAuthenticator();
    authenticator.aaguid = Buffer.alloc(16);
    const options = await post('/api/passkeys/register/options', {}, cookie);
    const res = await app.inject({
      method: 'POST',
      url: '/api/passkeys/register/verify',
      headers: { ...HEADERS, cookie, 'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140.0' },
      payload: { response: authenticator.register(options.json()) },
    });
    expect(res.json().passkey.name).toBe('Passkey auf Android');
  });

  it('rejects the same passkey twice and forged or foreign responses', async () => {
    const { cookie } = await signUp();
    const authenticator = new SoftAuthenticator();
    expect((await addPasskey(cookie, authenticator)).statusCode).toBe(201);
    expect((await addPasskey(cookie, authenticator)).json().error).toBe('passkey_exists');

    // Wrong origin (phishing site).
    const other = new SoftAuthenticator();
    const options = await post('/api/passkeys/register/options', {}, cookie);
    const phished = await post('/api/passkeys/register/verify', { response: other.register(options.json(), 'https://evil.example') }, cookie);
    expect(phished.json().error).toBe('passkey_invalid');

    // Challenge never issued.
    const forged = await post('/api/passkeys/register/verify', { response: other.register({ challenge: 'bm9wZQ', user: { id: 'eA' } }) }, cookie);
    expect(forged.json().error).toBe('passkey_invalid');
  });

  it('requires user verification (Face ID, fingerprint or PIN)', async () => {
    const { cookie } = await signUp();
    const authenticator = new SoftAuthenticator();
    authenticator.userVerified = false;
    expect((await addPasskey(cookie, authenticator)).json().error).toBe('passkey_invalid');
  });

  it('rejects replayed, foreign-origin and unknown sign-ins', async () => {
    const { cookie } = await signUp();
    const authenticator = new SoftAuthenticator();
    await addPasskey(cookie, authenticator);

    const options = (await post('/api/passkeys/login/options', {})).json();
    expect(options).toMatchObject({ rpId: 'localhost', userVerification: 'required' });
    const response = authenticator.signIn(options);
    expect((await post('/api/passkeys/login/verify', { response })).statusCode).toBe(200);
    // The same challenge cannot be used twice.
    expect((await post('/api/passkeys/login/verify', { response })).json().error).toBe('passkey_invalid');

    expect((await signInWith(authenticator, 'https://evil.example')).json().error).toBe('passkey_invalid');

    const unknown = await signInWith(new SoftAuthenticator());
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error).toBe('unknown_passkey');
  });

  it('deletes passkeys – only your own – and with the account', async () => {
    const lea = await signUp();
    const ben = await signUp('ben@example.ch');
    const authenticator = new SoftAuthenticator();
    await addPasskey(lea.cookie, authenticator);

    const foreign = await app.inject({ method: 'DELETE', url: `/api/passkeys/${authenticator.id}`, headers: { ...HEADERS, cookie: ben.cookie } });
    expect(foreign.statusCode).toBe(404);

    const removed = await app.inject({ method: 'DELETE', url: `/api/passkeys/${authenticator.id}`, headers: { ...HEADERS, cookie: lea.cookie } });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ user: { passkeys: 0 }, remaining: [] });
    expect((await signInWith(authenticator)).json().error).toBe('unknown_passkey');

    const second = new SoftAuthenticator();
    await addPasskey(lea.cookie, second);
    await app.inject({ method: 'DELETE', url: '/api/account', headers: { ...HEADERS, cookie: lea.cookie }, payload: { password: 'geheim123' } });
    expect((await signInWith(second)).json().error).toBe('unknown_passkey');
  });

  it('remembers on the account that the hint was dismissed', async () => {
    const { cookie } = await signUp();
    const res = await app.inject({ method: 'PATCH', url: '/api/account', headers: { ...HEADERS, cookie }, payload: { passkeyHintDismissed: true } });
    expect(res.json().user.passkeyHintDismissed).toBe(true);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.passkeyHintDismissed).toBe(true);
  });
});

describe('ChallengeStore', () => {
  it('accepts a challenge once, for its owner and before it expires', () => {
    const store = new ChallengeStore(1000, 3);
    store.add('a', 'user-1');
    expect(store.take('a', 'user-2')).toBe(false);
    store.add('b', 'user-1');
    expect(store.take('b', 'user-1')).toBe(true);
    expect(store.take('b', 'user-1')).toBe(false);

    const expired = new ChallengeStore(-1);
    expired.add('c', 'login');
    expect(expired.take('c', 'login')).toBe(false);
  });

  it('drops the oldest challenge when full', () => {
    const store = new ChallengeStore(60_000, 2);
    store.add('1', 'x');
    store.add('2', 'x');
    store.add('3', 'x');
    expect(store.take('1', 'x')).toBe(false);
    expect(store.take('3', 'x')).toBe(true);
  });
});
