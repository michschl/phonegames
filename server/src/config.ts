import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  isProd,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
  /** Directory for the SQLite database (mounted as a volume in Docker). */
  dataDir: path.resolve(env.DATA_DIR ?? 'data'),
  /** Built PWA (output of `vite build`). Served by the API server in production. */
  clientDir: path.resolve(env.CLIENT_DIR ?? 'dist/client'),
  serveClient: bool(env.SERVE_CLIENT, isProd),
  /** Secure cookies require HTTPS. Caddy terminates TLS in production. */
  cookieSecure: bool(env.COOKIE_SECURE, isProd),
  /** Trust X-Forwarded-* headers from the reverse proxy (Caddy). */
  trustProxy: bool(env.TRUST_PROXY, isProd),
  logLevel: env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  version: env.APP_VERSION ?? 'dev',
  /** Comma separated invitation codes. When set, registering requires one of them. */
  inviteCodes: list(env.INVITE_CODES),
  /**
   * Public address(es) of the app, e.g. https://phonegames.app (comma separated).
   * Passkeys are bound to this domain; without it they are switched off in production.
   */
  appOrigins: list(env.APP_ORIGIN ?? (isProd ? '' : 'http://localhost:5173,http://localhost:3000')),
  /** Piper TTS service for the narrator voice, e.g. http://tts:5000 (empty = device voices only). */
  ttsUrl: env.TTS_URL ?? '',
  /** Photo analysis for learning stacks (Infomaniak AI). Switched off without token and product id. */
  learn: {
    url: env.LEARN_AI_URL || 'https://api.infomaniak.com',
    token: env.INFOMANIAK_AI_TOKEN ?? '',
    productId: env.INFOMANIAK_AI_PRODUCT_ID ?? '',
    model: env.LEARN_AI_MODEL || 'Qwen/Qwen3.8-27B-FP8',
    monthlyLimit: int(env.LEARN_MONTHLY_LIMIT, 5),
    globalMonthlyLimit: int(env.LEARN_GLOBAL_MONTHLY_LIMIT, 2000),
  },
  /** Yearly subscription through Stripe (CHF 5, 7 days trial). Switched off without a secret key. */
  billing: {
    secretKey: env.STRIPE_SECRET_KEY ?? '',
    apiUrl: env.STRIPE_API_URL || 'https://api.stripe.com',
  },
} as const;

export type AppConfig = typeof config;
