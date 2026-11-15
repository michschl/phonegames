import type { Database } from './db.ts';
import { transaction } from './db.ts';
import { randomToken, sha256 } from './security.ts';
import { TOMBSTONE_TTL_MS, shouldReplace } from '../../shared/sync.ts';
import type { LibraryItem, Player, PlayerGroup, PublicUser, SyncPayload } from '../../shared/types.ts';

export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** Sessions are extended at most once per day to limit writes. */
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar: string;
  color: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface UserRecord extends PublicUser {
  passwordHash: string;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    createdAt: row.created_at,
    passwordHash: row.password_hash,
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

/* ------------------------------------------------------------------ users */

export function findUserByEmail(db: Database, email: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function findUserById(db: Database, id: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createUser(
  db: Database,
  user: { id: string; email: string; name: string; avatar: string; color: string; passwordHash: string },
): UserRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, email, name, avatar, color, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(user.id, user.email, user.name, user.avatar, user.color, user.passwordHash, now, now);
  return findUserById(db, user.id)!;
}

export function updateUser(
  db: Database,
  id: string,
  patch: Partial<{ email: string; name: string; avatar: string; color: string; passwordHash: string }>,
): UserRecord {
  const columns: Record<string, string> = {
    email: 'email',
    name: 'name',
    avatar: 'avatar',
    color: 'color',
    passwordHash: 'password_hash',
  };
  const sets: string[] = [];
  const values: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${columns[key]} = ?`);
    values.push(value);
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, Date.now(), id);
  }
  return findUserById(db, id)!;
}

export function deleteUser(db: Database, id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/* --------------------------------------------------------------- sessions */

export function createSession(db: Database, userId: string, userAgent: string | undefined): string {
  const token = randomToken();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), userId, now, now + SESSION_TTL_MS, now, userAgent?.slice(0, 200) ?? null);
  return token;
}

/**
 * Resolve a session token to its user. Extends the session (sliding expiry)
 * and reports whether the cookie should be re-issued.
 */
export function resolveSession(db: Database, token: string): { user: UserRecord; refreshed: boolean } | null {
  const tokenHash = sha256(token);
  const now = Date.now();
  const session = db
    .prepare('SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash) as { user_id: string; expires_at: number; last_seen_at: number } | undefined;
  if (!session) return null;
  if (session.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  const user = findUserById(db, session.user_id);
  if (!user) return null;
  let refreshed = false;
  if (now - session.last_seen_at > SESSION_REFRESH_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(
      now,
      now + SESSION_TTL_MS,
      tokenHash,
    );
    refreshed = true;
  }
  return { user, refreshed };
}

export function deleteSession(db: Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** Log out all other devices, e.g. after a password change. */
export function deleteOtherSessions(db: Database, userId: string, keepToken: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, sha256(keepToken));
}

export function purgeExpiredSessions(db: Database): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

/* ------------------------------------------------------------- user data */

interface LibraryRow {
  game_id: string;
  added_at: number;
  updated_at: number;
  deleted: number;
}

interface GroupRow {
  id: string;
  name: string;
  emoji: string;
  players: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

export function getLibrary(db: Database, userId: string): LibraryItem[] {
  const rows = db
    .prepare('SELECT game_id, added_at, updated_at, deleted FROM library WHERE user_id = ? ORDER BY added_at')
    .all(userId) as unknown as LibraryRow[];
  return rows.map((row) => ({
    gameId: row.game_id,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  }));
}

export function getGroups(db: Database, userId: string): PlayerGroup[] {
  const rows = db
    .prepare(
      'SELECT id, name, emoji, players, created_at, updated_at, deleted FROM player_groups WHERE user_id = ? ORDER BY created_at',
    )
    .all(userId) as unknown as GroupRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    players: JSON.parse(row.players) as Player[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  }));
}

/**
 * Merge the client's state into the database (last write wins per record)
 * and return the complete, merged state for this user.
 */
export function syncUserData(db: Database, userId: string, incoming: SyncPayload): SyncPayload {
  const now = Date.now();
  // Never accept timestamps from the (far) future – a wrong device clock would
  // otherwise make a record impossible to change from other devices.
  const clamp = (ts: number) => Math.min(ts, now + 60_000);

  transaction(db, () => {
    const library = new Map(getLibrary(db, userId).map((item) => [item.gameId, item]));
    const upsertLibrary = db.prepare(
      `INSERT INTO library (user_id, game_id, added_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, game_id) DO UPDATE SET
         added_at = excluded.added_at, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.library) {
      const item = { ...raw, updatedAt: clamp(raw.updatedAt) };
      if (!shouldReplace(library.get(item.gameId), item)) continue;
      upsertLibrary.run(userId, item.gameId, item.addedAt, item.updatedAt, item.deleted ? 1 : 0);
    }

    const groups = new Map(getGroups(db, userId).map((group) => [group.id, group]));
    const upsertGroup = db.prepare(
      `INSERT INTO player_groups (user_id, id, name, emoji, players, created_at, updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         name = excluded.name, emoji = excluded.emoji, players = excluded.players,
         created_at = excluded.created_at, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.groups) {
      const group = { ...raw, updatedAt: clamp(raw.updatedAt) };
      if (!shouldReplace(groups.get(group.id), group)) continue;
      upsertGroup.run(
        userId,
        group.id,
        group.name,
        group.emoji,
        JSON.stringify(group.players),
        group.createdAt,
        group.updatedAt,
        group.deleted ? 1 : 0,
      );
    }

    const cutoff = now - TOMBSTONE_TTL_MS;
    db.prepare('DELETE FROM library WHERE user_id = ? AND deleted = 1 AND updated_at < ?').run(userId, cutoff);
    db.prepare('DELETE FROM player_groups WHERE user_id = ? AND deleted = 1 AND updated_at < ?').run(userId, cutoff);
  });

  return { library: getLibrary(db, userId), groups: getGroups(db, userId) };
}
