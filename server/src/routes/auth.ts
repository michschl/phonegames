import type { FastifyPluginAsync } from 'fastify';
import type { BillingConfig } from '../billing.ts';
import { HttpError, SESSION_COOKIE } from '../http.ts';
import { countShareSignup, createSession, createUser, deleteSession, findUserByEmail, getShare, toPublicUser } from '../repo.ts';
import { getDummyHash, hashPassword, matchesInviteCode, randomId, verifyPassword } from '../security.ts';
import { loginSchema, registerSchema } from '../schemas.ts';
import type { AuthOptions, PublicUser } from '../../../shared/types.ts';

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
  /** The yearly subscription, or null when the server takes no payments. */
  billing: BillingConfig | null;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  // Without payments and with codes set, nobody gets in without a code.
  const inviteRequired = opts.inviteCodes.length > 0 && !opts.billing;

  app.get('/options', async (): Promise<AuthOptions> => ({
    inviteRequired,
    passkeys: opts.passkeys,
    tts: opts.tts,
    billing: opts.billing ? { pricePerYear: opts.billing.pricePerYear, currency: 'CHF', trialDays: opts.billing.trialDays } : null,
  }));

  /**
   * An invitation code gives a free account. Without one the account needs the yearly subscription
   * (after registering, «Abo» opens Stripe's payment page) – also through a shared stack link.
   */
  app.post('/register', { config: limit(20) }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const code = body.inviteCode?.trim() ?? '';
    let plan: PublicUser['plan'];
    // Checked before the e-mail so that strangers cannot probe for existing accounts.
    if (code) {
      if (!matchesInviteCode(code, opts.inviteCodes)) {
        throw new HttpError(403, 'invalid_invite', 'Dieser Einladungscode stimmt leider nicht.');
      }
      plan = 'free';
    } else if (opts.billing) {
      plan = 'paid';
    } else if (inviteRequired) {
      throw new HttpError(403, 'invite_required', 'Für die Registrierung brauchst du einen Einladungscode.');
    } else {
      plan = 'free'; // open registration without payments (development)
    }
    const share = body.shareId ? getShare(app.db, body.shareId) : null;
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
      plan,
      termsVersion: body.termsVersion ?? null,
    });
    // How many accounts a shared stack brought – for its owner.
    if (share) countShareSignup(app.db, share.id);
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

  app.get('/me', { preHandler: app.requireAuth }, async (request) => ({
    user: toPublicUser(await app.currentUser(request.user!)),
  }));
};
