import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type Database = DatabaseSync;

/**
 * Schema migrations. Append new entries – never edit an entry that has
 * already been deployed. The index (+1) is the schema version.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    avatar        TEXT NOT NULL,
    color         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent   TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE library (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id    TEXT NOT NULL,
    added_at   INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, game_id)
  );

  CREATE TABLE player_groups (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    name       TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    players    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );
  `,
  `
  ALTER TABLE users ADD COLUMN passkey_hint_dismissed INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE passkeys (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key   BLOB NOT NULL,
    counter      INTEGER NOT NULL DEFAULT 0,
    transports   TEXT NOT NULL DEFAULT '[]',
    device_type  TEXT NOT NULL,
    backed_up    INTEGER NOT NULL DEFAULT 0,
    name         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX passkeys_user ON passkeys(user_id);
  `,
  `
  CREATE TABLE learn_stacks (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE learn_progress (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    stack_id   TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );

  -- Photo analyses per person and calendar month (Europe/Zurich), for the monthly limit.
  CREATE TABLE learn_usage (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month   TEXT NOT NULL,
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month)
  );
  CREATE INDEX learn_usage_month ON learn_usage(month);
  `,
  `
  -- Shared learning stacks: a snapshot of the cards behind an unguessable link.
  CREATE TABLE learn_shares (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stack_id   TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    imports    INTEGER NOT NULL DEFAULT 0,
    signups    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (owner_id, stack_id)
  );
  `,
  `
  -- Yearly subscription (Stripe). Accounts from before stay free; new ones without an invitation pay.
  ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
  ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
  ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
  ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'none';
  ALTER TABLE users ADD COLUMN subscription_until INTEGER;
  ALTER TABLE users ADD COLUMN subscription_cancel_at_end INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN subscription_checked_at INTEGER;
  ALTER TABLE users ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- Consent to the terms of use and the privacy notice (shared/legal.ts): version and time.
  ALTER TABLE users ADD COLUMN terms_version TEXT;
  ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
  `,
  `
  -- «Aufgaben»: larger topics (learning goals with their content), synchronised like the stacks.
  CREATE TABLE learn_topics (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );
  `,
];

export function openDatabase(file: string): Database {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version]!;
    transaction(db, () => {
      db.exec(sql);
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
    });
    version += 1;
  }
}

/** Run `fn` inside a transaction (synchronous, node:sqlite is synchronous). */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
