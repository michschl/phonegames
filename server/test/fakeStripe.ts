/*
 * A stand-in for Stripe in the tests: Checkout sessions with a payment page, subscriptions and
 * the customer portal – just enough of the API the app uses (see server/src/billing.ts).
 * The payment page and the portal are tiny HTML pages a browser test can click through.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_STRIPE_KEY = 'sk_test_fake';
const DAY = 24 * 60 * 60;

interface FakeSubscription {
  id: string;
  object: 'subscription';
  status: string;
  customer: string;
  trial_end: number | null;
  cancel_at_period_end: boolean;
  items: { data: { current_period_end: number }[] };
}

interface FakeSession {
  id: string;
  status: 'open' | 'complete';
  params: Record<string, string>;
  customer: string | null;
  subscription: string | null;
}

export interface FakeStripe {
  url: string;
  sessions: Map<string, FakeSession>;
  subscriptions: Map<string, FakeSubscription>;
  /** Completes a payment page like a person paying (what the page's button does). */
  pay(sessionId: string): FakeSubscription;
  close(): Promise<void>;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;

export async function startFakeStripe(port = 0): Promise<FakeStripe> {
  const sessions = new Map<string, FakeSession>();
  const subscriptions = new Map<string, FakeSubscription>();
  let counter = 0;
  const next = (prefix: string) => `${prefix}_test_${(++counter).toString().padStart(6, '0')}`;
  let base = '';

  const pay = (sessionId: string): FakeSubscription => {
    const session = sessions.get(sessionId)!;
    const now = Math.floor(Date.now() / 1000);
    const trialDays = Number(session.params['subscription_data[trial_period_days]'] ?? 0);
    const customer = session.params.customer ?? next('cus');
    const subscription: FakeSubscription = {
      id: next('sub'),
      object: 'subscription',
      status: trialDays > 0 ? 'trialing' : 'active',
      customer,
      trial_end: trialDays > 0 ? now + trialDays * DAY : null,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: now + (trialDays > 0 ? trialDays : 365) * DAY }] },
    };
    subscriptions.set(subscription.id, subscription);
    Object.assign(session, { status: 'complete', customer, subscription: subscription.id });
    return subscription;
  };

  const json = (res: http.ServerResponse, status: number, body: unknown) =>
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  const html = (res: http.ServerResponse, body: string) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
  const redirect = (res: http.ServerResponse, to: string) => res.writeHead(303, { Location: to }).end();

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', base);
      const parts = url.pathname.split('/').filter(Boolean);
      const form = Object.fromEntries(new URLSearchParams(raw));

      // The pages a person sees (no API key).
      if (parts[0] === 'pay' && parts[1]) {
        const session = sessions.get(parts[1]);
        if (!session) return json(res, 404, {});
        if (req.method === 'POST') {
          pay(session.id);
          return redirect(res, session.params.success_url!.replace('{CHECKOUT_SESSION_ID}', session.id));
        }
        const trial = session.params['subscription_data[trial_period_days]'];
        return html(
          res,
          page(
            'Fake Stripe Checkout',
            `<p>${session.params['line_items[0][price_data][product_data][name]']} · CHF ${Number(session.params['line_items[0][price_data][unit_amount]']) / 100} pro Jahr${trial ? ` · ${trial} Tage gratis` : ''}</p>
             <form method="post"><button type="submit">Bezahlen</button></form>
             <a href="${session.params.cancel_url}">Zurück</a>`,
          ),
        );
      }
      if (parts[0] === 'portal' && parts[1]) {
        const customer = parts[1];
        const returnUrl = url.searchParams.get('return') ?? '/';
        if (req.method === 'POST') {
          for (const sub of subscriptions.values()) if (sub.customer === customer) sub.cancel_at_period_end = true;
          return redirect(res, returnUrl);
        }
        return html(
          res,
          page('Fake Stripe Kundenportal', `<form method="post"><button type="submit">Abo kündigen</button></form><a href="${returnUrl}">Zurück</a>`),
        );
      }

      if (req.headers.authorization !== `Bearer ${FAKE_STRIPE_KEY}`) return json(res, 401, { error: { message: 'Invalid API key' } });

      if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
        if (form.mode !== 'subscription' || !form.success_url) return json(res, 400, { error: { message: 'bad params' } });
        const session: FakeSession = { id: next('cs'), status: 'open', params: form, customer: form.customer ?? null, subscription: null };
        sessions.set(session.id, session);
        return json(res, 200, { id: session.id, object: 'checkout.session', url: `${base}/pay/${session.id}` });
      }
      if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'checkout' && parts[2] === 'sessions' && parts[3]) {
        const session = sessions.get(parts[3]);
        if (!session) return json(res, 404, { error: { message: 'No such checkout session' } });
        const expanded = url.searchParams.get('expand[0]') === 'subscription';
        const subscription = session.subscription ? subscriptions.get(session.subscription)! : null;
        return json(res, 200, {
          id: session.id,
          object: 'checkout.session',
          status: session.status,
          client_reference_id: session.params.client_reference_id,
          customer: session.customer,
          subscription: expanded ? subscription : session.subscription,
        });
      }
      if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'subscriptions' && parts[2]) {
        const subscription = subscriptions.get(parts[2]);
        return subscription ? json(res, 200, subscription) : json(res, 404, { error: { message: 'No such subscription' } });
      }
      if (req.method === 'DELETE' && parts[0] === 'v1' && parts[1] === 'subscriptions' && parts[2]) {
        const subscription = subscriptions.get(parts[2]);
        if (!subscription) return json(res, 404, { error: { message: 'No such subscription' } });
        subscription.status = 'canceled';
        return json(res, 200, subscription);
      }
      if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
        return json(res, 200, { url: `${base}/portal/${form.customer}?return=${encodeURIComponent(form.return_url ?? '/')}` });
      }
      // For tests: change a subscription as if time had passed (renewed, failed, ended).
      if (req.method === 'POST' && parts[0] === 'test' && parts[1] === 'subscriptions' && parts[2]) {
        const subscription = subscriptions.get(parts[2]);
        if (!subscription) return json(res, 404, {});
        Object.assign(subscription, JSON.parse(raw || '{}'));
        return json(res, 200, subscription);
      }
      return json(res, 404, { error: { message: `Unknown ${req.method} ${url.pathname}` } });
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: base,
    sessions,
    subscriptions,
    pay,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
