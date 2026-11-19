import type { FastifyPluginAsync } from 'fastify';
import { cancelSubscription, type BillingConfig } from '../billing.ts';
import { HttpError } from '../http.ts';
import {
  deleteOtherSessions,
  deleteUser,
  findUserByEmail,
  getGroups,
  getProgress,
  getStacks,
  listShares,
  toShareInfo,
  getLibrary,
  listPasskeys,
  toPasskeyInfo,
  toPublicUser,
  updateUser,
} from '../repo.ts';
import { hashPassword, verifyPassword } from '../security.ts';
import { changePasswordSchema, deleteAccountSchema, updateAccountSchema } from '../schemas.ts';

export const accountRoutes: FastifyPluginAsync<{ rateLimit: boolean; billing: BillingConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });

  app.addHook('preHandler', app.requireAuth);

  app.patch('/', { config: limit(60) }, async (request) => {
    const user = request.user!;
    const body = updateAccountSchema.parse(request.body);

    const emailChanged = body.email !== undefined && body.email !== user.email.toLowerCase();
    if (emailChanged) {
      if (!body.password || !(await verifyPassword(body.password, user.passwordHash))) {
        throw new HttpError(403, 'invalid_password', 'Bitte bestätige die Änderung mit deinem aktuellen Passwort.');
      }
      const other = findUserByEmail(app.db, body.email!);
      if (other && other.id !== user.id) {
        throw new HttpError(409, 'email_taken', 'Diese E-Mail-Adresse wird bereits verwendet.');
      }
    }

    const updated = updateUser(app.db, user.id, {
      name: body.name,
      avatar: body.avatar,
      color: body.color,
      email: emailChanged ? body.email : undefined,
      passkeyHintDismissed: body.passkeyHintDismissed,
    });
    return { user: toPublicUser(updated) };
  });

  app.post('/password', { config: limit(10) }, async (request, reply) => {
    const user = request.user!;
    const body = changePasswordSchema.parse(request.body);
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new HttpError(403, 'invalid_password', 'Das aktuelle Passwort ist falsch.');
    }
    updateUser(app.db, user.id, { passwordHash: await hashPassword(body.newPassword) });
    deleteOtherSessions(app.db, user.id, request.sessionToken!);
    return reply.status(204).send();
  });

  app.delete('/', { config: limit(10) }, async (request, reply) => {
    const user = request.user!;
    const body = deleteAccountSchema.parse(request.body);
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(403, 'invalid_password', 'Das Passwort ist falsch.');
    }
    // A running subscription ends with the account – otherwise Stripe would go on charging.
    const status = user.subscription?.status;
    if (user.stripe.subscriptionId && status && status !== 'canceled' && status !== 'none') {
      if (!opts.billing) throw new HttpError(409, 'subscription_running', 'Dein Abo läuft noch. Kündige es zuerst unter «Abo verwalten».');
      await cancelSubscription(opts.billing, user.stripe.subscriptionId);
    }
    deleteUser(app.db, user.id); // sessions, passkeys, library and groups are deleted via ON DELETE CASCADE
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  /** Data export (Auskunftsrecht nach DSG/DSGVO). */
  app.get('/export', async (request, reply) => {
    const user = request.user!;
    const data = {
      exportedAt: new Date().toISOString(),
      user: toPublicUser(user),
      library: getLibrary(app.db, user.id).filter((item) => !item.deleted),
      groups: getGroups(app.db, user.id).filter((group) => !group.deleted),
      learnStacks: getStacks(app.db, user.id).filter((stack) => !stack.deleted),
      learnProgress: getProgress(app.db, user.id).filter((entry) => !entry.deleted),
      learnShares: listShares(app.db, user.id).map((share) => ({ ...toShareInfo(share), cards: share.stack.cards.length })),
      passkeys: listPasskeys(app.db, user.id).map(toPasskeyInfo),
    };
    reply.header('Content-Disposition', 'attachment; filename="phonegames-export.json"');
    return data;
  });
};
