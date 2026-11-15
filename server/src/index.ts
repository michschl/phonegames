import path from 'node:path';
import { buildApp } from './app.ts';
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
});

app.log.info(
  config.inviteCodes.length > 0
    ? `Registrierung nur mit Einladungscode (${config.inviteCodes.length} Code(s) aktiv)`
    : 'Registrierung offen für alle (INVITE_CODES nicht gesetzt)',
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
