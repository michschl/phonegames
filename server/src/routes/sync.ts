import type { FastifyPluginAsync } from 'fastify';
import { syncUserData } from '../repo.ts';
import { syncSchema } from '../schemas.ts';
import type { SyncResponse } from '../../../shared/types.ts';

export const syncRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Bidirectional sync: the client sends all its records (including
   * tombstones), the server merges them and answers with the merged state.
   */
  app.post('/sync', { preHandler: app.requireAuth }, async (request): Promise<SyncResponse> => {
    const payload = syncSchema.parse(request.body);
    const merged = syncUserData(app.db, request.user!.id, payload);
    return { ...merged, serverTime: Date.now() };
  });
};
