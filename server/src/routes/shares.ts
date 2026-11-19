import type { FastifyPluginAsync } from 'fastify';
import { HttpError } from '../http.ts';
import { countShareImport, deleteShare, getShare, listShares, saveShare, toShareInfo, type ShareRecord } from '../repo.ts';
import { shareIdSchema, shareSchema } from '../schemas.ts';
import { randomToken } from '../security.ts';
import { LIMITS, type LearnShareInfo, type LearnSharePreview, type LearnShareStack } from '../../../shared/types.ts';

/**
 * Sharing learning stacks by link. The link carries an unguessable id (128 bit);
 * there is no list or search of shared stacks. Anybody with the link sees a short
 * preview, signed-in people can take over a copy. While registration needs an
 * invitation code, the link counts as one (up to LIMITS.shareSignups accounts).
 */
export const shareRoutes: FastifyPluginAsync<{ rateLimit: boolean; inviteRequired: boolean }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });

  const find = (id: string): ShareRecord => {
    const share = getShare(app.db, id);
    if (!share) throw new HttpError(404, 'share_not_found', 'Dieser Link ist nicht mehr gültig. Vielleicht wurde die Freigabe beendet.');
    return share;
  };

  /** The owner's shared stacks. */
  app.get('/mine', { preHandler: app.requireAuth }, async (request): Promise<{ shares: LearnShareInfo[] }> => ({
    shares: listShares(app.db, request.user!.id).map(toShareInfo),
  }));

  /** Share a stack – or update the cards behind its existing link. */
  app.post('/', { preHandler: app.requireAuth, config: limit(60), bodyLimit: 2 * 1024 * 1024 }, async (request) => {
    const body = shareSchema.parse(request.body);
    const userId = request.user!.id;
    const existing = listShares(app.db, userId);
    if (!existing.some((s) => s.stackId === body.stackId) && existing.length >= LIMITS.stacks) {
      throw new HttpError(429, 'share_limit', 'Du teilst schon sehr viele Stapel. Beende zuerst eine Freigabe.');
    }
    const { stackId, ...stack } = body;
    return { share: toShareInfo(saveShare(app.db, userId, stackId, stack, randomToken(16))) };
  });

  /** End sharing – the link stops working at once. */
  app.delete('/:id', { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = shareIdSchema.parse(request.params);
    if (!deleteShare(app.db, request.user!.id, id)) throw new HttpError(404, 'share_not_found', 'Diese Freigabe gibt es nicht.');
    return reply.status(204).send();
  });

  /** Preview for anybody with the link. */
  app.get('/:id', { config: limit(300) }, async (request, reply): Promise<LearnSharePreview> => {
    const { id } = shareIdSchema.parse(request.params);
    const share = find(id);
    reply.header('X-Robots-Tag', 'noindex');
    return {
      id: share.id,
      title: share.stack.title,
      subject: share.stack.subject,
      cardCount: share.stack.cards.length,
      sample: share.stack.cards.slice(0, 3).map(({ prompt, answer }) => ({ prompt, answer })),
      invites: opts.inviteRequired && share.signups < LIMITS.shareSignups,
    };
  });

  /** Take over a copy of the cards. */
  app.post('/:id/import', { preHandler: app.requireAuth, config: limit(60) }, async (request): Promise<{ stack: LearnShareStack }> => {
    const { id } = shareIdSchema.parse(request.params);
    const share = find(id);
    if (share.ownerId !== request.user!.id) countShareImport(app.db, share.id);
    return { stack: share.stack };
  });
};
