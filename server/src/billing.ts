import type { Database } from './db.ts';
import { HttpError } from './http.ts';
import { markSubscriptionChecked, saveSubscription, type SubscriptionState, type UserRecord } from './repo.ts';
import type { SubscriptionStatus } from '../../shared/types.ts';

/*
 * The yearly subscription through Stripe. Stripe hosts the payment page (Checkout: TWINT, cards,
 * Apple Pay, Google Pay – whatever is switched on in the Stripe dashboard) and the customer portal
 * (cancel, change payment method, receipts). The app never sees payment details.
 *
 * No webhooks: after the payment page the app confirms the Checkout session, and when the stored
 * period has run out it asks Stripe for the subscription again (renewed, failed or ended).
 * Plain HTTPS requests – no SDK.
 */

export interface BillingConfig {
  secretKey: string;
  /** https://api.stripe.com – a fake server in the tests. */
  apiUrl: string;
  /** In Rappen. */
  pricePerYear: number;
  trialDays: number;
}

export const PRICE_PER_YEAR = 500;
export const TRIAL_DAYS = 7;

interface Params {
  [key: string]: string | number | boolean | Params | undefined;
}

/** Stripe's form encoding: nested objects as `a[b][c]=…`. */
export function formEncode(params: Params, prefix = ''): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') parts.push(...formEncode(value, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts;
}

async function stripe<T>(config: BillingConfig, method: 'GET' | 'POST' | 'DELETE', path: string, params: Params = {}): Promise<T> {
  const query = formEncode(params).join('&');
  const url = `${config.apiUrl.replace(/\/$/, '')}/v1/${path}${method !== 'POST' && query ? `?${query}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: method === 'POST' ? query : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, 'billing_unavailable', 'Die Zahlung ist gerade nicht erreichbar. Bitte versuche es gleich nochmals.');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new HttpError(502, 'billing_failed', 'Die Zahlung konnte nicht vorbereitet werden. Bitte versuche es später nochmals.', {
      cause: body.error?.message ?? `HTTP ${res.status}`,
    });
  }
  return body;
}

interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  /** Older API versions. */
  current_period_end?: number;
  /** Newer API versions keep the period on the items. */
  items?: { data?: { current_period_end?: number }[] };
}

interface StripeCheckoutSession {
  id: string;
  url?: string;
  status?: string;
  client_reference_id?: string | null;
  customer?: string | null;
  subscription?: StripeSubscription | string | null;
}

/** Stripe's many states boiled down to what the app distinguishes. */
export function mapStatus(status: string): SubscriptionStatus {
  if (status === 'trialing' || status === 'active' || status === 'past_due') return status;
  // incomplete: the first payment is still open – no access yet, like a subscription that never started.
  if (status === 'incomplete') return 'none';
  return 'canceled'; // canceled, unpaid, incomplete_expired, paused
}

export function toState(subscription: StripeSubscription, trialUsed: boolean): SubscriptionState {
  const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  const ends = [periodEnd, subscription.trial_end ?? null].filter((t): t is number => typeof t === 'number');
  return {
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    status: mapStatus(subscription.status),
    until: ends.length > 0 ? Math.max(...ends) * 1000 : null,
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
    trialUsed: trialUsed || subscription.status === 'trialing' || !!subscription.trial_end,
  };
}

/**
 * Stripe's payment page for the yearly subscription. The first one starts with the free trial;
 * payment details are asked for right away, the first payment is due after the trial.
 */
export async function createCheckout(
  config: BillingConfig,
  user: { id: string; email: string; customerId: string | null; trialAvailable: boolean },
  appUrl: string,
): Promise<string> {
  const session = await stripe<StripeCheckoutSession>(config, 'POST', 'checkout/sessions', {
    mode: 'subscription',
    locale: 'de',
    client_reference_id: user.id,
    ...(user.customerId ? { customer: user.customerId } : { customer_email: user.email }),
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: 'chf',
          unit_amount: config.pricePerYear,
          recurring: { interval: 'year' },
          product_data: { name: 'phonegames Jahresabo' },
        },
      },
    },
    subscription_data: {
      metadata: { userId: user.id },
      ...(user.trialAvailable ? { trial_period_days: config.trialDays } : {}),
    },
    success_url: `${appUrl}/abo?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/abo`,
  });
  if (!session.url) throw new HttpError(502, 'billing_failed', 'Die Zahlung konnte nicht vorbereitet werden.');
  return session.url;
}

/** After the payment page: the subscription of a completed Checkout session of this person. */
export async function confirmCheckout(config: BillingConfig, sessionId: string, userId: string): Promise<SubscriptionState | null> {
  const session = await stripe<StripeCheckoutSession>(config, 'GET', `checkout/sessions/${encodeURIComponent(sessionId)}`, {
    expand: { 0: 'subscription' },
  });
  if (session.client_reference_id !== userId) {
    throw new HttpError(403, 'checkout_foreign', 'Diese Zahlung gehört zu einem anderen Konto.');
  }
  if (session.status !== 'complete' || !session.subscription || typeof session.subscription === 'string') return null;
  return toState(session.subscription, false);
}

/** The subscription as Stripe sees it now – renewed, failed or ended. */
export async function fetchSubscription(config: BillingConfig, subscriptionId: string, trialUsed: boolean): Promise<SubscriptionState> {
  const subscription = await stripe<StripeSubscription>(config, 'GET', `subscriptions/${encodeURIComponent(subscriptionId)}`);
  return toState(subscription, trialUsed);
}

/** Ends the subscription at once (the account is deleted) – nothing is charged any more. */
export async function cancelSubscription(config: BillingConfig, subscriptionId: string): Promise<void> {
  await stripe(config, 'DELETE', `subscriptions/${encodeURIComponent(subscriptionId)}`);
}

/** Stripe's customer portal: cancel, change the payment method, receipts. */
export async function createPortal(config: BillingConfig, customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe<{ url: string }>(config, 'POST', 'billing_portal/sessions', { customer: customerId, return_url: returnUrl });
  return session.url;
}

/* ------------------------------------------------------- keeping it current */

const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Asks Stripe again when the stored period has run out (renewed? payment failed? ended?), a
 * payment failed or the first one was still open – at most once an hour. `force` after the customer portal. When Stripe does not
 * answer, the stored state stays (with ACCESS_GRACE_MS nobody is locked out by an outage).
 */
export async function refreshSubscription(
  db: Database,
  config: BillingConfig | null,
  user: UserRecord,
  force = false,
): Promise<UserRecord> {
  const subscription = user.subscription;
  if (!config || user.plan !== 'paid' || !subscription || !user.stripe.subscriptionId) return user;
  const now = Date.now();
  // past_due: paid again? none: the first payment was still open (e.g. confirmed later in the TWINT app).
  const due =
    subscription.status === 'past_due' ||
    subscription.status === 'none' ||
    (subscription.status !== 'canceled' && (subscription.until ?? 0) <= now);
  if (!force && (!due || (user.stripe.checkedAt !== null && now - user.stripe.checkedAt < CHECK_EVERY_MS))) return user;
  try {
    const state = await fetchSubscription(config, user.stripe.subscriptionId, !subscription.trialAvailable);
    return saveSubscription(db, user.id, state);
  } catch {
    markSubscriptionChecked(db, user.id);
    return user;
  }
}
