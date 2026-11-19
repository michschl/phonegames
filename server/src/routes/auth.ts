import type { FastifyPluginAsync } from 'fastify';
import { HttpError, SESSION_COOKIE } from '../http.ts';
import { countShareSignup, createSession, createUser, deleteSession, findUserByEmail, getShare, toPublicUser } from '../repo.ts';
import { getDummyHash, hashPassword, matchesInviteCode, randomId, verifyPassword } from '../security.ts';
import { loginSchema, registerSchema } from '../schemas.ts';
import { LIMITS, type AuthOptions } from '../../../shared/types.ts';

const AVATARS = ['🦊', '🐼', '🦄', '🐸', '🐙', '🦁', '🐵', '🐧', '🦉', '🐯', '🐨', '🦖', '👾', '🤖', '🎃', '🌵'];
const COLORS = ['#ff3d8b', '#ff8a3d', '#ffd23f', '#3ddc97', '#2de2e6', '#8b5cf6', '#5b8cff', '#ff5e5e'];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export interface AuthRoutesOptions {
  rateLimit: boolean;
  /** Valid invitation codes. Empty = anyone may register. */
  inviteCodes: readonly string[];
  /** Passkey relying party, or null when passkeys are switched off. */
  passkeys: { rpID: string } | null;
  /** Server narrator voices, or null without a TTS service. */
  tts: AuthOptions['tts'];
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const inviteRequired = opts.inviteCodes.length > 0;

  app.get('/options', async (): Promise<AuthOptions> => ({ inviteRequired, passkeys: opts.passkeys, tts: opts.tts }));

  app.post('/register', { config: limit(20) }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    // A shared stack link counts as an invitation, up to a limit per link.
    const share = body.shareId ? getShare(app.db, body.shareId) : null;
    const invitedByShare = !!share && share.signups < LIMITS.shareSignups;
    // Checked before the e-mail so that strangers cannot probe for existing accounts.
    if (inviteRequired && !invitedByShare) {
      const code = body.inviteCode?.trim() ?? '';
      if (!code) {
        throw new HttpError(403, 'invite_required', 'Für die Registrierung brauchst du einen Einladungscode.');
      }
      if (!matchesInviteCode(code, opts.inviteCodes)) {
        throw new HttpError(403, 'invalid_invite', 'Dieser Einladungscode stimmt leider nicht.');
      }
    }
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
    if (inviteRequired && invitedByShare) countShareSignup(app.db, share.id);
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
