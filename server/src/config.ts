import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
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
} as const;

export type AppConfig = typeof config;
