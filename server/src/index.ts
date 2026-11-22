import path from 'node:path';
import { buildApp } from './app.ts';
import { PRICE_PER_YEAR, TRIAL_DAYS } from './billing.ts';
import { config } from './config.ts';
import { openDatabase } from './db.ts';

const db = openDatabase(path.join(config.dataDir, 'phonegames.db'));

const app = await buildApp({
  db,
  logger: { level: config.logLevel },
  cookieSecure: config.cookieSecure,
  trustProxy: config.trustProxy,
  serveClient: config.serveClient,
  clientDir: config.clientDir,
  version: config.version,
  inviteCodes: config.inviteCodes,
  tts: config.ttsUrl ? { url: config.ttsUrl, cacheDir: path.join(config.dataDir, 'tts-cache') } : null,
  learn: config.learn.token && config.learn.productId ? config.learn : null,
  billing: config.billing.secretKey
    ? { secretKey: config.billing.secretKey, apiUrl: config.billing.apiUrl, pricePerYear: PRICE_PER_YEAR, trialDays: TRIAL_DAYS }
    : null,
  appUrl: config.appOrigins[0] ?? null,
  webauthn: config.appOrigins.length
    ? { rpID: new URL(config.appOrigins[0]!).hostname, rpName: 'Phonegames', origins: config.appOrigins }
    : null,
});

app.log.info(
  config.billing.secretKey
    ? `Jahresabo über Stripe aktiv${config.billing.secretKey.startsWith('sk_test_') ? ' (Testmodus)' : ''}; Einladungscodes geben kostenlose Konten (${config.inviteCodes.length})`
    : config.inviteCodes.length > 0
      ? `Registrierung nur mit Einladungscode (${config.inviteCodes.length} Code(s) aktiv), kein Abo (STRIPE_SECRET_KEY nicht gesetzt)`
      : 'Registrierung offen für alle (INVITE_CODES und STRIPE_SECRET_KEY nicht gesetzt)',
);
app.log.info(
  config.appOrigins.length
    ? `Passkeys aktiv für ${config.appOrigins.join(', ')}`
    : 'Passkeys ausgeschaltet (APP_ORIGIN nicht gesetzt)',
);
app.log.info(config.ttsUrl ? `Erzählstimme über ${config.ttsUrl}` : 'Erzählstimme: nur Gerätestimmen (TTS_URL nicht gesetzt)');
app.log.info(
  config.learn.token && config.learn.productId
    ? `Foto-Auswertung mit ${config.learn.model}, ${config.learn.monthlyLimit} pro Person und Monat`
    : 'Foto-Auswertung ausgeschaltet (INFOMANIAK_AI_TOKEN / INFOMANIAK_AI_PRODUCT_ID nicht gesetzt)',
);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
