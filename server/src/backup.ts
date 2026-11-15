/**
 * Creates a consistent copy of the SQLite database while the app is running.
 *
 *   node server/src/backup.ts [target-file]
 *
 * In Docker: docker compose exec -T app node server/src/backup.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

const source = path.join(config.dataDir, 'phonegames.db');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.resolve(process.argv[2] ?? path.join(config.dataDir, 'backups', `phonegames-${stamp}.db`));

fs.mkdirSync(path.dirname(target), { recursive: true });
const db = new DatabaseSync(source);
db.prepare('VACUUM INTO ?').run(target);
db.close();
console.log(`Backup written to ${target}`);
