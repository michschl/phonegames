import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import type { Database } from './db.ts';
import { HttpError, SESSION_COOKIE } from './http.ts';
import { purgeExpiredSessions, resolveSession, SESSION_TTL_MS, type UserRecord } from './repo.ts';
import { authRoutes } from './routes/auth.ts';
import { accountRoutes } from './routes/account.ts';
import { syncRoutes } from './routes/sync.ts';

export interface AppOptions {
  db: Database;
  logger?: boolean | { level: string };
  cookieSecure?: boolean;
  trustProxy?: boolean;
  serveClient?: boolean;
  clientDir?: string;
  version?: string;
  /** Disable rate limiting (tests). */
  rateLimit?: boolean;
  /** Valid invitation codes for registering. Empty or missing = open registration. */
  inviteCodes?: readonly string[];
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    setSessionCookie(reply: FastifyReply, token: string): void;
    clearSessionCookie(reply: FastifyReply): void;
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
  interface FastifyRequest {
    user: UserRecord | null;
    sessionToken: string | null;
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "media-src 'self' blob: data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
    bodyLimit: 512 * 1024,
  });

  app.decorate('db', options.db);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'rate_limited',
      message: 'Zu viele Versuche. Bitte warte einen Moment.',
    }),
  });

  const cookieOptions = {
    httpOnly: true,
    secure: options.cookieSecure ?? false,
    sameSite: 'lax' as const,
    path: '/',
  };

  app.decorate('setSessionCookie', (reply: FastifyReply, token: string) => {
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS / 1000 });
  });
  app.decorate('clearSessionCookie', (reply: FastifyReply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
  });

  app.decorate('requireAuth', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = token ? resolveSession(app.db, token) : null;
    if (!token || !session) {
      if (token) app.clearSessionCookie(reply);
      throw new HttpError(401, 'unauthorized', 'Bitte melde dich an.');
    }
    request.user = session.user;
    request.sessionToken = token;
    if (session.refreshed) app.setSessionCookie(reply, token);
  });

  // CSRF protection: state changing API calls must carry a custom header,
  // which browsers only allow for same-origin requests (no CORS is enabled).
  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/')) return;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (request.headers['x-requested-with'] !== 'phonegames') {
      throw new HttpError(403, 'forbidden', 'Anfrage abgelehnt.');
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Content-Security-Policy', CSP);
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? 'Ungültige Eingabe.';
      return reply.status(400).send({ error: 'validation', message });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    const err = error as { statusCode?: number; message?: string; error?: string; code?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error(error);
      return reply.status(500).send({ error: 'internal', message: 'Da ist etwas schiefgelaufen.' });
    }
    if (status === 429) {
      return reply.status(429).send({ error: 'rate_limited', message: err.message ?? 'Zu viele Anfragen.' });
    }
    return reply.status(status).send({ error: err.code ?? err.error ?? 'bad_request', message: 'Ungültige Anfrage.' });
  });

  app.get('/api/health', async () => ({ ok: true, version: options.version ?? 'dev' }));

  await app.register(authRoutes, {
    prefix: '/api/auth',
    rateLimit: options.rateLimit ?? true,
    inviteCodes: options.inviteCodes ?? [],
  });
  await app.register(accountRoutes, { prefix: '/api/account', rateLimit: options.rateLimit ?? true });
  await app.register(syncRoutes, { prefix: '/api' });

  if (options.serveClient && options.clientDir) {
    registerClient(app, options.clientDir);
  } else {
    app.setNotFoundHandler((_request, reply) => {
      reply.status(404).send({ error: 'not_found', message: 'Nicht gefunden.' });
    });
  }

  // Housekeeping once an hour.
  const timer = setInterval(() => purgeExpiredSessions(app.db), 60 * 60 * 1000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));

  return app;
}

/** Serve the built PWA with sensible cache headers and an SPA fallback. */
function registerClient(app: FastifyInstance, clientDir: string): void {
  const indexFile = path.join(clientDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    app.log.warn(`Client build not found in ${clientDir} – run "npm run build" first.`);
  }

  const noCache = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);

  void app.register(fastifyStatic, {
    root: clientDir,
    wildcard: true,
    index: false,
    cacheControl: false,
    setHeaders(reply, filePath) {
      const name = path.basename(filePath);
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (noCache.has(name) || name.startsWith('workbox-')) {
        reply.header('Cache-Control', 'no-cache');
      } else {
        reply.header('Cache-Control', 'public, max-age=86400');
      }
    },
  });

  const sendIndex = (reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-cache');
    return reply.type('text/html; charset=utf-8').send(fs.createReadStream(indexFile));
  };

  // The directory index is disabled in @fastify/static, so serve "/" explicitly.
  app.get('/', (_request, reply) => sendIndex(reply));

  // SPA fallback: unknown page URLs (no file extension) get the app shell.
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0]!;
    const isPage =
      (request.method === 'GET' || request.method === 'HEAD') && !pathname.startsWith('/api/') && !path.extname(pathname);
    if (!isPage) {
      return reply.status(404).send({ error: 'not_found', message: 'Nicht gefunden.' });
    }
    return sendIndex(reply);
  });
}
