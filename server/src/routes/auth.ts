import type { FastifyPluginAsync } from 'fastify';
import { HttpError, SESSION_COOKIE } from '../http.ts';
import { createSession, createUser, deleteSession, findUserByEmail, toPublicUser } from '../repo.ts';
import { getDummyHash, hashPassword, randomId, verifyPassword } from '../security.ts';
import { loginSchema, registerSchema } from '../schemas.ts';

const AVATARS = ['🦊', '🐼', '🦄', '🐸', '🐙', '🦁', '🐵', '🐧', '🦉', '🐯', '🐨', '🦖', '👾', '🤖', '🎃', '🌵'];
const COLORS = ['#ff3d8b', '#ff8a3d', '#ffd23f', '#3ddc97', '#2de2e6', '#8b5cf6', '#5b8cff', '#ff5e5e'];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export const authRoutes: FastifyPluginAsync<{ rateLimit: boolean }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });

  app.post('/register', { config: limit(20) }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    if (findUserByEmail(app.db, body.email)) {
      throw new HttpError(409, 'email_taken', 'Mit dieser E-Mail-Adresse gibt es bereits ein Konto.');
    }
    const user = createUser(app.db, {
      id: randomId(),
      email: body.email,
      name: body.name,
      avatar: pick(AVATARS),
      color: pick(COLORS),
      passwordHash: await hashPassword(body.password),
    });
    const token = createSession(app.db, user.id, request.headers['user-agent']);
    app.setSessionCookie(reply, token);
    return reply.status(201).send({ user: toPublicUser(user) });
  });

  app.post('/login', { config: limit(30) }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = findUserByEmail(app.db, body.email);
    // Always run a hash comparison so response times do not reveal whether an e-mail exists.
    const valid = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) {
      throw new HttpError(401, 'invalid_credentials', 'E-Mail oder Passwort ist falsch.');
    }
    const token = createSession(app.db, user.id, request.headers['user-agent']);
    app.setSessionCookie(reply, token);
    return { user: toPublicUser(user) };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) deleteSession(app.db, token);
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: app.requireAuth }, async (request) => ({ user: toPublicUser(request.user!) }));
};
