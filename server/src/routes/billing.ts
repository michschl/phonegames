import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { confirmCheckout, createCheckout, createPortal, refreshSubscription, type BillingConfig } from '../billing.ts';
import { HttpError } from '../http.ts';
import { saveSubscription, toPublicUser } from '../repo.ts';
import type { PublicUser } from '../../../shared/types.ts';

export interface BillingRoutesOptions {
  rateLimit: boolean;
  billing: BillingConfig | null;
  /** Public address of the app for Stripe's return links; null = taken from the request. */
  appUrl: string | null;
}

const confirmSchema = z.object({ sessionId: z.string().regex(/^cs_[A-Za-z0-9_]{6,200}$/, 'Ungültige Zahlung.') });

/** The yearly subscription: Stripe's payment page, confirming it, and Stripe's customer portal. */
export const billingRoutes: FastifyPluginAsync<BillingRoutesOptions> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const config = (): BillingConfig => {
    if (!opts.billing) throw new HttpError(404, 'billing_off', 'Hier gibt es kein Abo.');
    return opts.billing;
  };
  const appUrl = (request: FastifyRequest) => opts.appUrl ?? `${request.protocol}://${request.host}`;

  app.addHook('preHandler', app.requireAuth);

  /** Stripe's payment page – the trial the first time, else straight to the yearly payment. */
  app.post('/checkout', { config: limit(20) }, async (request): Promise<{ url: string }> => {
    const billing = config();
    const user = request.user!;
    if (user.plan !== 'paid') throw new HttpError(409, 'free_plan', 'Dein Konto ist kostenlos – du brauchst kein Abo.');
    const status = user.subscription?.status;
    if (user.access && (status === 'trialing' || status === 'active')) {
      throw new HttpError(409, 'already_subscribed', 'Dein Abo läuft schon.');
    }
    const url = await createCheckout(
      billing,
      { id: user.id, email: user.email, customerId: user.stripe.customerId, trialAvailable: user.subscription?.trialAvailable ?? true },
      appUrl(request),
    );
    return { url };
  });

  /** Back from the payment page: store the subscription right away (no webhook needed). */
  app.post('/confirm', { config: limit(30) }, async (request): Promise<{ user: PublicUser; confirmed: boolean }> => {
    const { sessionId } = confirmSchema.parse(request.body);
    const state = await confirmCheckout(config(), sessionId, request.user!.id);
    if (!state) return { user: toPublicUser(request.user!), confirmed: false };
    return { user: toPublicUser(saveSubscription(app.db, request.user!.id, state)), confirmed: true };
  });

  /** Stripe's customer portal: cancel, change the payment method, receipts. */
  app.post('/portal', { config: limit(20) }, async (request): Promise<{ url: string }> => {
    const customerId = request.user!.stripe.customerId;
    if (!customerId) throw new HttpError(409, 'no_subscription', 'Es gibt noch kein Abo zum Verwalten.');
    return { url: await createPortal(config(), customerId, `${appUrl(request)}/konto?abo=1`) };
  });

  /** Back from the customer portal: ask Stripe what changed (cancelled, new card …). */
  app.post('/refresh', { config: limit(30) }, async (request): Promise<{ user: PublicUser }> => ({
    user: toPublicUser(await refreshSubscription(app.db, config(), request.user!, true)),
  }));
};
