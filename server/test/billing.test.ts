import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.ts';
import { formEncode, mapStatus, PRICE_PER_YEAR, TRIAL_DAYS } from '../src/billing.ts';
import { openDatabase } from '../src/db.ts';
import { ACCESS_GRACE_MS } from '../src/repo.ts';
import type { PublicUser } from '../../shared/types.ts';
import { FAKE_STRIPE_KEY, startFakeStripe, type FakeStripe } from './fakeStripe.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };
const DAY = 24 * 60 * 60 * 1000;

let stripe: FakeStripe;
let app: FastifyInstance;

beforeAll(async () => {
  stripe = await startFakeStripe();
});
afterAll(async () => {
  await stripe.close();
});

beforeEach(async () => {
  app = await buildApp({
    db: openDatabase(':memory:'),
    rateLimit: false,
    inviteCodes: ['PARTY-2026'],
    billing: { secretKey: FAKE_STRIPE_KEY, apiUrl: stripe.url, pricePerYear: PRICE_PER_YEAR, trialDays: TRIAL_DAYS },
    appUrl: 'https://phonegames.app',
  });
});
afterEach(async () => {
  await app.close();
});

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

async function register(email: string, extra: Record<string, string> = {}): Promise<{ cookie: string; user: PublicUser }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Lea', email, password: 'geheim123', ...extra },
  });
  expect(res.statusCode).toBe(201);
  return { cookie: cookieFrom(res), user: res.json().user };
}

const post = (url: string, cookie: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: { ...HEADERS, cookie }, payload });
const me = async (cookie: string): Promise<PublicUser> => (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user;
const sync = (cookie: string) => post('/api/sync', cookie, { library: [], groups: [] });

/** Registers without a code, opens the payment page and pays – like a new person with the trial. */
async function subscribe(email = 'lea@example.ch') {
  const { cookie } = await register(email);
  const checkout = await post('/api/billing/checkout', cookie);
  expect(checkout.statusCode).toBe(200);
  const sessionId = new URL(checkout.json().url).pathname.split('/').pop()!;
  const subscription = stripe.pay(sessionId);
  const confirm = await post('/api/billing/confirm', cookie, { sessionId });
  expect(confirm.statusCode).toBe(200);
  return { cookie, sessionId, subscription, user: confirm.json().user as PublicUser };
}

describe('yearly subscription', () => {
  it('tells the app the price and the trial', async () => {
    const options = (await app.inject({ method: 'GET', url: '/api/auth/options' })).json();
    expect(options).toMatchObject({ inviteRequired: false, billing: { pricePerYear: 500, currency: 'CHF', trialDays: 7 } });
  });

  it('gives a free account with an invitation code, a paid one without – also through a shared link', async () => {
    const free = await register('free@example.ch', { inviteCode: 'party-2026' });
    expect(free.user).toMatchObject({ plan: 'free', access: true, subscription: null });
    expect((await sync(free.cookie)).statusCode).toBe(200);

    const paid = await register('paid@example.ch');
    expect(paid.user).toMatchObject({
      plan: 'paid',
      access: false,
      subscription: { status: 'none', until: null, trialAvailable: true, manageable: false },
    });
    // Without a subscription: no data, no photos, no sharing – but the account itself works.
    const locked = await sync(paid.cookie);
    expect(locked.statusCode).toBe(402);
    expect(locked.json().error).toBe('subscription_required');
    expect((await app.inject({ method: 'GET', url: '/api/learn/usage', headers: { cookie: paid.cookie } })).statusCode).toBe(402);
    expect((await app.inject({ method: 'GET', url: '/api/account/export', headers: { cookie: paid.cookie } })).statusCode).toBe(200);

    // A wrong code is still an error, not a paid account.
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Tim', email: 'tim@example.ch', password: 'geheim123', inviteCode: 'FALSCH' },
    });
    expect(wrong.statusCode).toBe(403);
  });

  it('starts with seven free days on Stripe’s payment page, CHF 5 a year after', async () => {
    const { cookie, sessionId, user } = await subscribe();
    const params = stripe.sessions.get(sessionId)!.params;
    expect(params).toMatchObject({
      mode: 'subscription',
      locale: 'de',
      customer_email: 'lea@example.ch',
      'line_items[0][price_data][currency]': 'chf',
      'line_items[0][price_data][unit_amount]': '500',
      'line_items[0][price_data][recurring][interval]': 'year',
      'subscription_data[trial_period_days]': '7',
      success_url: 'https://phonegames.app/abo?checkout={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://phonegames.app/abo',
    });
    expect(params.client_reference_id).toBe(user.id);
    // No payment method list: Stripe offers what is switched on in the dashboard (TWINT, cards, wallets).
    expect(Object.keys(params).some((key) => key.startsWith('payment_method_types'))).toBe(false);

    expect(user).toMatchObject({ access: true, subscription: { status: 'trialing', trialAvailable: false, manageable: true } });
    expect(user.subscription!.until! - Date.now()).toBeGreaterThan(6.9 * DAY);
    expect((await sync(cookie)).statusCode).toBe(200);
    // Running: no second payment page.
    expect((await post('/api/billing/checkout', cookie)).statusCode).toBe(409);
  });

  it('only confirms payments of the same account, and free accounts need none', async () => {
    const { sessionId } = await subscribe();
    const other = await register('ben@example.ch');
    expect((await post('/api/billing/confirm', other.cookie, { sessionId })).statusCode).toBe(403);
    expect((await post('/api/billing/confirm', other.cookie, { sessionId: 'nope' })).statusCode).toBe(400);
    const free = await register('free@example.ch', { inviteCode: 'PARTY-2026' });
    expect((await post('/api/billing/checkout', free.cookie)).statusCode).toBe(409);
  });

  it('asks Stripe again when the period is over: renewed, then ended', async () => {
    const { cookie, subscription, user } = await subscribe();
    const expire = () => app.db.prepare('UPDATE users SET subscription_until = ?, subscription_checked_at = NULL WHERE id = ?').run(Date.now() - ACCESS_GRACE_MS - 1000, user.id);

    // The trial is over and Stripe charged the first year.
    const yearEnd = Math.floor((Date.now() + 365 * DAY) / 1000);
    subscription.status = 'active';
    subscription.items.data[0]!.current_period_end = yearEnd;
    expire();
    expect(await me(cookie)).toMatchObject({ access: true, subscription: { status: 'active', until: yearEnd * 1000 } });

    // Cancelled in the portal and the year is over.
    subscription.status = 'canceled';
    expire();
    expect(await me(cookie)).toMatchObject({ access: false, subscription: { status: 'canceled' } });
    expect((await sync(cookie)).statusCode).toBe(402);

    // Back again: a new payment page without the trial, for the same Stripe customer.
    const again = await post('/api/billing/checkout', cookie);
    const params = stripe.sessions.get(new URL(again.json().url).pathname.split('/').pop()!)!.params;
    expect(params['subscription_data[trial_period_days]']).toBeUndefined();
    expect(params.customer).toBe(subscription.customer);
  });

  it('notices a first payment that was still open when coming back from Stripe', async () => {
    const { cookie } = await register('lea@example.ch');
    const checkout = await post('/api/billing/checkout', cookie);
    const sessionId = new URL(checkout.json().url).pathname.split('/').pop()!;
    const subscription = stripe.pay(sessionId);
    subscription.status = 'incomplete';
    const confirm = await post('/api/billing/confirm', cookie, { sessionId });
    expect(confirm.json().user).toMatchObject({ access: false, subscription: { status: 'none' } });

    // Paid a little later (e.g. confirmed in the TWINT app): the next check finds it.
    subscription.status = 'active';
    app.db.prepare('UPDATE users SET subscription_checked_at = NULL').run();
    expect(await me(cookie)).toMatchObject({ access: true, subscription: { status: 'active' } });
  });

  it('keeps access when Stripe cannot be asked, for a few days', async () => {
    const { cookie, user } = await subscribe();
    const broken = await buildApp({
      db: app.db,
      rateLimit: false,
      billing: { secretKey: 'sk_test_wrong', apiUrl: stripe.url, pricePerYear: PRICE_PER_YEAR, trialDays: TRIAL_DAYS },
    });
    app.db.prepare('UPDATE users SET subscription_until = ?, subscription_checked_at = NULL WHERE id = ?').run(Date.now() - DAY, user.id);
    const res = await broken.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.json().user).toMatchObject({ access: true, subscription: { status: 'trialing' } });
    await broken.close();
  });

  it('opens Stripe’s customer portal and notices the cancellation', async () => {
    const { cookie, subscription } = await subscribe();
    const portal = await post('/api/billing/portal', cookie);
    expect(portal.statusCode).toBe(200);
    expect(portal.json().url).toContain(`/portal/${subscription.customer}`);
    expect(decodeURIComponent(portal.json().url)).toContain('https://phonegames.app/konto?abo=1');

    subscription.cancel_at_period_end = true;
    const refreshed = await post('/api/billing/refresh', cookie);
    expect(refreshed.json().user).toMatchObject({ access: true, subscription: { status: 'trialing', cancelAtPeriodEnd: true } });

    const free = await register('free@example.ch', { inviteCode: 'PARTY-2026' });
    expect((await post('/api/billing/portal', free.cookie)).statusCode).toBe(409);
  });

  it('ends the subscription at Stripe when the account is deleted', async () => {
    const { cookie, subscription } = await subscribe();
    const res = await app.inject({ method: 'DELETE', url: '/api/account', headers: { ...HEADERS, cookie }, payload: { password: 'geheim123' } });
    expect(res.statusCode).toBe(204);
    expect(subscription.status).toBe('canceled');
  });

  it('switches off without a Stripe key – then only invitation codes let people in', async () => {
    const off = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, inviteCodes: ['PARTY-2026'] });
    const options = (await off.inject({ method: 'GET', url: '/api/auth/options' })).json();
    expect(options).toMatchObject({ inviteRequired: true, billing: null });
    const res = await off.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: HEADERS,
      payload: { name: 'Lea', email: 'lea@example.ch', password: 'geheim123' },
    });
    expect(res.json().error).toBe('invite_required');
    await off.close();
  });
});

describe('Stripe helpers', () => {
  it('encodes nested parameters the way Stripe expects', () => {
    expect(formEncode({ a: 1, b: { c: 'x y', d: { 0: true } }, e: undefined })).toEqual(['a=1', 'b%5Bc%5D=x%20y', 'b%5Bd%5D%5B0%5D=true']);
  });

  it('boils Stripe’s states down to what the app distinguishes', () => {
    expect(['trialing', 'active', 'past_due', 'incomplete', 'unpaid', 'incomplete_expired', 'canceled', 'paused'].map(mapStatus)).toEqual([
      'trialing',
      'active',
      'past_due',
      'none',
      'canceled',
      'canceled',
      'canceled',
      'canceled',
    ]);
  });
});
