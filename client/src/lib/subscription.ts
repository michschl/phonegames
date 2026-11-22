import type { PublicUser, SubscriptionInfo } from '../../../shared/types.ts';
import { hasAccess } from './session.ts';

/** «CHF 5» or «CHF 4.50» – the price is stored in Rappen. */
export function formatPrice(rappen: number): string {
  const francs = rappen / 100;
  return `CHF ${Number.isInteger(francs) ? francs : francs.toFixed(2)}`;
}

export function formatDate(time: number): string {
  return new Date(time).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}

/*
 * Where to go after Stripe's payment page – e.g. back to a shared stack. Stripe sends the person to
 * /abo; the wish survives the trip in this tab's sessionStorage.
 */
const AFTER_KEY = 'phonegames-after-abo';

export function rememberAfterSubscribe(path: string | null): void {
  try {
    if (path && path !== '/') sessionStorage.setItem(AFTER_KEY, path);
    else sessionStorage.removeItem(AFTER_KEY);
  } catch {
    /* private mode – then it goes to the start page */
  }
}

export function takeAfterSubscribe(): string {
  try {
    const path = sessionStorage.getItem(AFTER_KEY);
    sessionStorage.removeItem(AFTER_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : '/';
  } catch {
    return '/';
  }
}

/** After signing in or registering: on to `next` – or first to «Abo» when the account needs one. */
export function afterSignIn(user: PublicUser, next: string): string {
  if (hasAccess(user)) return next;
  rememberAfterSubscribe(next);
  return '/abo';
}

/** One sentence about a running subscription, for «Konto». */
export function subscriptionSummary(subscription: SubscriptionInfo, price: string): string {
  const until = subscription.until ? formatDate(subscription.until) : null;
  if (subscription.cancelAtPeriodEnd) return until ? `Gekündigt – läuft bis ${until}.` : 'Gekündigt.';
  if (subscription.status === 'trialing') return until ? `Gratis bis ${until}, danach ${price} pro Jahr.` : `Gratis-Testphase, danach ${price} pro Jahr.`;
  if (subscription.status === 'active') return until ? `Läuft – verlängert sich am ${until} für ${price}.` : 'Läuft.';
  if (subscription.status === 'past_due') return 'Die letzte Zahlung hat nicht geklappt.';
  return 'Kein Abo.';
}
