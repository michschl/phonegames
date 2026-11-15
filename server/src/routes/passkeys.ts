import type { FastifyPluginAsync } from 'fastify';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { HttpError } from '../http.ts';
import { passkeyName } from '../passkeyNames.ts';
import {
  createSession,
  deletePasskey,
  findPasskey,
  findUserById,
  insertPasskey,
  listPasskeys,
  markPasskeyUsed,
  toPasskeyInfo,
  toPublicUser,
} from '../repo.ts';
import { passkeyResponseSchema } from '../schemas.ts';

/** Where the app runs. The RP ID is the domain passkeys are bound to. */
export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origins: string[];
}

const LOGIN = 'login';
const TIMEOUT_MS = 120_000;

/** Issued challenges: single use, valid for five minutes, bound to a user (or to the login flow). */
export class ChallengeStore {
  private readonly items = new Map<string, { owner: string; expires: number }>();
  private readonly ttl: number;
  private readonly max: number;

  constructor(ttl = 5 * 60_000, max = 10_000) {
    this.ttl = ttl;
    this.max = max;
  }

  add(challenge: string, owner: string): void {
    const now = Date.now();
    for (const [key, item] of this.items) if (item.expires <= now) this.items.delete(key);
    if (this.items.size >= this.max) {
      const oldest = this.items.keys().next().value;
      if (oldest !== undefined) this.items.delete(oldest);
    }
    this.items.set(challenge, { owner, expires: now + this.ttl });
  }

  /** Consumes the challenge; true when it was issued to `owner` and has not expired. */
  take(challenge: string, owner: string): boolean {
    const item = this.items.get(challenge);
    this.items.delete(challenge);
    return !!item && item.owner === owner && item.expires > Date.now();
  }
}

/** WebAuthn user handle: the user id as bytes (base64url in the browser). */
const userHandle = (userId: string) => Buffer.from(userId, 'utf8').toString('base64url');

export const passkeyRoutes: FastifyPluginAsync<{ rateLimit: boolean; webauthn: WebAuthnConfig | null }> = async (
  app,
  opts,
) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const challenges = new ChallengeStore();

  const config = (): WebAuthnConfig => {
    if (!opts.webauthn) {
      throw new HttpError(503, 'passkeys_unavailable', 'Passkeys sind auf diesem Server nicht eingerichtet.');
    }
    return opts.webauthn;
  };

  /* ------------------------------------------------- manage (signed in) */

  app.get('/', { preHandler: app.requireAuth }, async (request) => ({
    passkeys: listPasskeys(app.db, request.user!.id).map(toPasskeyInfo),
    userHandle: userHandle(request.user!.id),
  }));

  app.post('/register/options', { preHandler: app.requireAuth, config: limit(30) }, async (request) => {
    const { rpID, rpName } = config();
    const user = request.user!;
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new Uint8Array(Buffer.from(user.id, 'utf8')),
      attestationType: 'none',
      excludeCredentials: listPasskeys(app.db, user.id).map((p) => ({
        id: p.id,
        transports: p.transports as AuthenticatorTransport[],
      })),
      // Discoverable credential (sign in without typing the e-mail) with Face ID, fingerprint or PIN.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: TIMEOUT_MS,
    });
    challenges.add(options.challenge, user.id);
    return options;
  });

  app.post('/register/verify', { preHandler: app.requireAuth, config: limit(30) }, async (request, reply) => {
    const { rpID, origins } = config();
    const user = request.user!;
    const body = passkeyResponseSchema.parse(request.body);
    const response = body.response as unknown as RegistrationResponseJSON;
    const rejected = new HttpError(400, 'passkey_invalid', 'Der Passkey konnte nicht bestätigt werden. Bitte versuche es nochmals.');

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) => challenges.take(challenge, user.id),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'passkey registration rejected');
      throw rejected;
    }
    if (!verification.verified) throw rejected;

    const info = verification.registrationInfo;
    if (findPasskey(app.db, info.credential.id)) {
      throw new HttpError(409, 'passkey_exists', 'Diesen Passkey hast du schon eingerichtet.');
    }
    const passkey = insertPasskey(app.db, {
      id: info.credential.id,
      userId: user.id,
      publicKey: info.credential.publicKey,
      counter: info.credential.counter,
      transports: info.credential.transports ?? response.response.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name: passkeyName(info.aaguid, request.headers['user-agent']),
    });
    return reply.status(201).send({ passkey: toPasskeyInfo(passkey), user: toPublicUser(findUserById(app.db, user.id)!) });
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: app.requireAuth }, async (request) => {
    const user = request.user!;
    if (!deletePasskey(app.db, user.id, request.params.id)) {
      throw new HttpError(404, 'not_found', 'Diesen Passkey gibt es nicht (mehr).');
    }
    return {
      user: toPublicUser(findUserById(app.db, user.id)!),
      remaining: listPasskeys(app.db, user.id).map((p) => p.id),
    };
  });

  /* ------------------------------------------------------------- sign in */

  app.post('/login/options', { config: limit(60) }, async () => {
    const { rpID } = config();
    // No allowCredentials: the device offers the passkeys it has for this site.
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: TIMEOUT_MS });
    challenges.add(options.challenge, LOGIN);
    return options;
  });

  app.post('/login/verify', { config: limit(30) }, async (request, reply) => {
    const { rpID, origins } = config();
    const body = passkeyResponseSchema.parse(request.body);
    const response = body.response as unknown as AuthenticationResponseJSON;
    const rejected = new HttpError(401, 'passkey_invalid', 'Die Anmeldung mit dem Passkey hat nicht geklappt. Bitte versuche es nochmals.');

    const passkey = findPasskey(app.db, response.id);
    if (!passkey) {
      throw new HttpError(
        404,
        'unknown_passkey',
        'Diesen Passkey kennen wir nicht – vielleicht wurde er gelöscht. Melde dich mit E-Mail und Passwort an.',
      );
    }
    const handle = response.response.userHandle;
    if (handle && handle !== userHandle(passkey.userId)) throw rejected;

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) => challenges.take(challenge, LOGIN),
        expectedOrigin: origins,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: passkey.publicKey,
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransport[],
        },
        requireUserVerification: true,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'passkey sign-in rejected');
      throw rejected;
    }
    if (!verification.verified) throw rejected;

    markPasskeyUsed(app.db, passkey.id, verification.authenticationInfo.newCounter);
    const user = findUserById(app.db, passkey.userId);
    if (!user) throw rejected;
    const token = createSession(app.db, user.id, request.headers['user-agent']);
    app.setSessionCookie(reply, token);
    return { user: toPublicUser(user) };
  });
};
