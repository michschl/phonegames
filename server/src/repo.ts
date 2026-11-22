import type { Database } from './db.ts';
import { transaction } from './db.ts';
import { randomToken, sha256 } from './security.ts';
import { TOMBSTONE_TTL_MS, shouldReplace } from '../../shared/sync.ts';
import { TERMS_VERSION } from '../../shared/legal.ts';
import { cleanRewards, cleanWallet, mergeWallet } from '../../shared/coins.ts';
import { LIMITS } from '../../shared/types.ts';
import type {
  CoinWallet,
  RewardSettings,
  TaskDocument,
  LearnTopic,
  LearnProgress,
  LearnShareInfo,
  LearnShareStack,
  LearnStack,
  LibraryItem,
  PasskeyInfo,
  Player,
  PlayerGroup,
  PublicUser,
  SubscriptionStatus,
  SyncPayload,
} from '../../shared/types.ts';

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
  passkey_hint_dismissed: number;
  passkey_count: number;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  subscription_until: number | null;
  subscription_cancel_at_end: number;
  subscription_checked_at: number | null;
  trial_used: number;
  terms_version: string | null;
  terms_accepted_at: number | null;
}

const SELECT_USER = 'SELECT u.*, (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkey_count FROM users u';

export interface UserRecord extends PublicUser {
  passwordHash: string;
  stripe: { customerId: string | null; subscriptionId: string | null; checkedAt: number | null };
}

/**
 * A running subscription keeps access a little past its end: Stripe renews at the end of the period,
 * and the app asks Stripe only then (see billing.ts) – an outage must not lock anybody out.
 */
export const ACCESS_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const STATUSES: readonly SubscriptionStatus[] = ['none', 'trialing', 'active', 'past_due', 'canceled'];

export function hasAccess(plan: PublicUser['plan'], status: SubscriptionStatus, until: number | null, now = Date.now()): boolean {
  if (plan === 'free') return true;
  if (status !== 'trialing' && status !== 'active') return false;
  return until === null || until + ACCESS_GRACE_MS > now;
}

function toUser(row: UserRow): UserRecord {
  const plan = row.plan === 'paid' ? 'paid' : 'free';
  const status = (STATUSES as readonly string[]).includes(row.subscription_status) ? (row.subscription_status as SubscriptionStatus) : 'none';
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    createdAt: row.created_at,
    passkeys: row.passkey_count,
    passkeyHintDismissed: row.passkey_hint_dismissed === 1,
    plan,
    access: hasAccess(plan, status, row.subscription_until),
    subscription:
      plan === 'paid'
        ? {
            status,
            until: row.subscription_until,
            cancelAtPeriodEnd: row.subscription_cancel_at_end === 1,
            trialAvailable: row.trial_used === 0,
            manageable: !!row.stripe_customer_id,
          }
        : null,
    termsAccepted: row.terms_version === TERMS_VERSION,
    termsAcceptedAt: row.terms_accepted_at,
    passwordHash: row.password_hash,
    stripe: { customerId: row.stripe_customer_id, subscriptionId: row.stripe_subscription_id, checkedAt: row.subscription_checked_at },
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _hash, stripe: _stripe, ...rest } = user;
  return rest;
}

/* ------------------------------------------------------------------ users */

export function findUserByEmail(db: Database, email: string): UserRecord | null {
  const row = db.prepare(`${SELECT_USER} WHERE u.email = ?`).get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function findUserById(db: Database, id: string): UserRecord | null {
  const row = db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createUser(
  db: Database,
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string;
    color: string;
    passwordHash: string;
    plan: PublicUser['plan'];
    /** The version of the terms agreed to when registering, or null (older app versions). */
    termsVersion: string | null;
  },
): UserRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (id, email, name, avatar, color, password_hash, plan, terms_version, terms_accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user.id,
    user.email,
    user.name,
    user.avatar,
    user.color,
    user.passwordHash,
    user.plan,
    user.termsVersion,
    user.termsVersion ? now : null,
    now,
    now,
  );
  return findUserById(db, user.id)!;
}

/** The person agreed to a version of the terms of use and the privacy notice. */
export function acceptTerms(db: Database, userId: string, version: string): UserRecord {
  const now = Date.now();
  db.prepare('UPDATE users SET terms_version = ?, terms_accepted_at = ?, updated_at = ? WHERE id = ?').run(version, now, now, userId);
  return findUserById(db, userId)!;
}

/** What Stripe says about a person's subscription – stored with the account. */
export interface SubscriptionState {
  customerId: string;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  until: number | null;
  cancelAtPeriodEnd: boolean;
  /** The subscription started with the free trial. */
  trialUsed: boolean;
}

export function saveSubscription(db: Database, userId: string, state: SubscriptionState): UserRecord {
  const now = Date.now();
  db.prepare(
    `UPDATE users SET stripe_customer_id = ?, stripe_subscription_id = ?, subscription_status = ?, subscription_until = ?,
       subscription_cancel_at_end = ?, subscription_checked_at = ?, trial_used = MAX(trial_used, ?), updated_at = ?
     WHERE id = ?`,
  ).run(
    state.customerId,
    state.subscriptionId,
    state.status,
    state.until,
    Number(state.cancelAtPeriodEnd),
    now,
    Number(state.trialUsed),
    now,
    userId,
  );
  return findUserById(db, userId)!;
}

/** Remembers that Stripe was asked (also when it did not answer) – at most one question per hour. */
export function markSubscriptionChecked(db: Database, userId: string): void {
  db.prepare('UPDATE users SET subscription_checked_at = ? WHERE id = ?').run(Date.now(), userId);
}

export function updateUser(
  db: Database,
  id: string,
  patch: Partial<{
    email: string;
    name: string;
    avatar: string;
    color: string;
    passwordHash: string;
    passkeyHintDismissed: boolean;
  }>,
): UserRecord {
  const columns: Record<string, string> = {
    email: 'email',
    name: 'name',
    avatar: 'avatar',
    color: 'color',
    passwordHash: 'password_hash',
    passkeyHintDismissed: 'passkey_hint_dismissed',
  };
  const sets: string[] = [];
  const values: (string | number)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${columns[key]} = ?`);
    values.push(typeof value === 'boolean' ? Number(value) : value);
  }
  if (sets.length > 0) {
    db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, Date.now(), id);
  }
  return findUserById(db, id)!;
}

export function deleteUser(db: Database, id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/* --------------------------------------------------------------- passkeys */

interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: Uint8Array;
  counter: number;
  transports: string;
  device_type: string;
  backed_up: number;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

/** Everything the server needs to verify a passkey sign-in. */
export interface PasskeyRecord extends PasskeyInfo {
  userId: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: string[];
}

function toPasskey(row: PasskeyRow): PasskeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    publicKey: new Uint8Array(row.public_key),
    counter: row.counter,
    transports: JSON.parse(row.transports) as string[],
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    synced: row.backed_up === 1,
  };
}

export function toPasskeyInfo({ id, name, createdAt, lastUsedAt, synced }: PasskeyRecord): PasskeyInfo {
  return { id, name, createdAt, lastUsedAt, synced };
}

export function listPasskeys(db: Database, userId: string): PasskeyRecord[] {
  const rows = db.prepare('SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at').all(userId) as unknown as PasskeyRow[];
  return rows.map(toPasskey);
}

export function findPasskey(db: Database, id: string): PasskeyRecord | null {
  const row = db.prepare('SELECT * FROM passkeys WHERE id = ?').get(id) as PasskeyRow | undefined;
  return row ? toPasskey(row) : null;
}

export function insertPasskey(
  db: Database,
  passkey: {
    id: string;
    userId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[];
    deviceType: string;
    backedUp: boolean;
    name: string;
  },
): PasskeyRecord {
  db.prepare(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    passkey.id,
    passkey.userId,
    passkey.publicKey,
    passkey.counter,
    JSON.stringify(passkey.transports),
    passkey.deviceType,
    Number(passkey.backedUp),
    passkey.name.slice(0, 80),
    Date.now(),
  );
  return findPasskey(db, passkey.id)!;
}

export function markPasskeyUsed(db: Database, id: string, counter: number): void {
  db.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').run(counter, Date.now(), id);
}

/** Deletes one of the user's passkeys; false when it does not exist (or belongs to someone else). */
export function deletePasskey(db: Database, userId: string, id: string): boolean {
  return db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
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
interface StackRow {
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

interface ProgressRow {
  id: string;
  stack_id: string;
  data: string;
  updated_at: number;
  deleted: number;
}

type StackData = Pick<LearnStack, 'title' | 'subject' | 'languages' | 'cards' | 'suggestedModes' | 'source'>;
type TopicData = Pick<LearnTopic, 'title' | 'subject' | 'level' | 'goals' | 'notes' | 'examDate' | 'source'>;

export function getTopics(db: Database, userId: string): LearnTopic[] {
  const rows = db
    .prepare('SELECT id, data, created_at, updated_at, deleted FROM learn_topics WHERE user_id = ? ORDER BY created_at')
    .all(userId) as unknown as StackRow[];
  return rows.map((row) => ({
    id: row.id,
    ...(JSON.parse(row.data) as TopicData),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  }));
}
type ProgressData = Pick<LearnProgress, 'player' | 'cards' | 'days' | 'removed'>;

export function getStacks(db: Database, userId: string): LearnStack[] {
  const rows = db
    .prepare('SELECT id, data, created_at, updated_at, deleted FROM learn_stacks WHERE user_id = ? ORDER BY created_at')
    .all(userId) as unknown as StackRow[];
  return rows.map((row) => ({
    id: row.id,
    ...(JSON.parse(row.data) as StackData),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  }));
}

export function getProgress(db: Database, userId: string): LearnProgress[] {
  const rows = db
    .prepare('SELECT id, stack_id, data, updated_at, deleted FROM learn_progress WHERE user_id = ?')
    .all(userId) as unknown as ProgressRow[];
  return rows.map((row) => ({
    id: row.id,
    stackId: row.stack_id,
    days: [],
    ...(JSON.parse(row.data) as ProgressData),
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  }));
}

/* --------------------------------------------------------- shared stacks */

interface ShareRow {
  id: string;
  owner_id: string;
  stack_id: string;
  data: string;
  created_at: number;
  updated_at: number;
  imports: number;
  signups: number;
}

export interface ShareRecord extends LearnShareInfo {
  ownerId: string;
  stack: LearnShareStack;
}

function toShare(row: ShareRow): ShareRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    stackId: row.stack_id,
    updatedAt: row.updated_at,
    imports: row.imports,
    signups: row.signups,
    stack: JSON.parse(row.data) as LearnShareStack,
  };
}

export function toShareInfo({ id, stackId, updatedAt, imports, signups }: ShareRecord): LearnShareInfo {
  return { id, stackId, updatedAt, imports, signups };
}

export function getShare(db: Database, id: string): ShareRecord | null {
  const row = db.prepare('SELECT * FROM learn_shares WHERE id = ?').get(id) as ShareRow | undefined;
  return row ? toShare(row) : null;
}

export function listShares(db: Database, ownerId: string): ShareRecord[] {
  const rows = db.prepare('SELECT * FROM learn_shares WHERE owner_id = ? ORDER BY created_at').all(ownerId) as unknown as ShareRow[];
  return rows.map(toShare);
}

/** Creates the link for a stack, or updates the cards behind the existing link. */
export function saveShare(db: Database, ownerId: string, stackId: string, stack: LearnShareStack, newId: string): ShareRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO learn_shares (id, owner_id, stack_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (owner_id, stack_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(newId, ownerId, stackId, JSON.stringify(stack), now, now);
  const row = db.prepare('SELECT * FROM learn_shares WHERE owner_id = ? AND stack_id = ?').get(ownerId, stackId) as unknown as ShareRow;
  return toShare(row);
}

export function deleteShare(db: Database, ownerId: string, id: string): boolean {
  return Number(db.prepare('DELETE FROM learn_shares WHERE id = ? AND owner_id = ?').run(id, ownerId).changes) > 0;
}

export function countShareImport(db: Database, id: string): void {
  db.prepare('UPDATE learn_shares SET imports = imports + 1 WHERE id = ?').run(id);
}

export function countShareSignup(db: Database, id: string): void {
  db.prepare('UPDATE learn_shares SET signups = signups + 1 WHERE id = ?').run(id);
}

/* ------------------------------------------------------- task documents */

interface DocumentRow {
  id: string;
  topic_id: string;
  kind: string;
  status: string;
  data: string;
  created_at: number;
  updated_at: number;
}

type DocumentData = Pick<TaskDocument, 'error' | 'title' | 'intro' | 'durationMin' | 'difficulty' | 'goalIds' | 'tasks' | 'attempts'>;

function toDocument(row: DocumentRow): TaskDocument {
  return {
    id: row.id,
    topicId: row.topic_id,
    kind: row.kind as TaskDocument['kind'],
    status: row.status as TaskDocument['status'],
    ...(JSON.parse(row.data) as DocumentData),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function documentData(doc: TaskDocument): string {
  const { error, title, intro, durationMin, difficulty, goalIds, tasks, attempts } = doc;
  return JSON.stringify({ error, title, intro, durationMin, difficulty, goalIds, tasks, attempts } satisfies DocumentData);
}

/** Stores a document – a new one or a newer state of it. */
export function saveDocument(db: Database, userId: string, doc: TaskDocument): TaskDocument {
  db.prepare(
    `INSERT INTO learn_documents (user_id, id, topic_id, kind, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE SET status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, doc.id, doc.topicId, doc.kind, doc.status, documentData(doc), doc.createdAt, doc.updatedAt);
  return doc;
}

export function getDocument(db: Database, userId: string, id: string): TaskDocument | null {
  const row = db.prepare('SELECT * FROM learn_documents WHERE user_id = ? AND id = ?').get(userId, id) as DocumentRow | undefined;
  return row ? toDocument(row) : null;
}

/** The documents of a topic, newest first. */
export function listDocuments(db: Database, userId: string, topicId: string): TaskDocument[] {
  const rows = db
    .prepare('SELECT * FROM learn_documents WHERE user_id = ? AND topic_id = ? ORDER BY created_at DESC')
    .all(userId, topicId) as unknown as DocumentRow[];
  return rows.map(toDocument);
}

export function deleteDocument(db: Database, userId: string, id: string): boolean {
  return Number(db.prepare('DELETE FROM learn_documents WHERE user_id = ? AND id = ?').run(userId, id).changes) > 0;
}

export function getTaskUsage(db: Database, userId: string, month: string): number {
  const row = db.prepare('SELECT count FROM task_usage WHERE user_id = ? AND month = ?').get(userId, month) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function countTaskUsage(db: Database, userId: string, month: string): void {
  db.prepare(
    `INSERT INTO task_usage (user_id, month, count) VALUES (?, ?, 1)
     ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1`,
  ).run(userId, month);
}

/* ------------------------------------------------------------ learn usage */

export function getLearnUsage(db: Database, userId: string, month: string): number {
  const row = db.prepare('SELECT count FROM learn_usage WHERE user_id = ? AND month = ?').get(userId, month) as
    | { count: number }
    | undefined;
  return row?.count ?? 0;
}

export function getTotalLearnUsage(db: Database, month: string): number {
  const row = db.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM learn_usage WHERE month = ?').get(month) as {
    total: number;
  };
  return row.total;
}

export function countLearnUsage(db: Database, userId: string, month: string): void {
  db.prepare(
    `INSERT INTO learn_usage (user_id, month, count) VALUES (?, ?, 1)
     ON CONFLICT (user_id, month) DO UPDATE SET count = count + 1`,
  ).run(userId, month);
}

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

    const stacks = new Map(getStacks(db, userId).map((stack) => [stack.id, stack]));
    const upsertStack = db.prepare(
      `INSERT INTO learn_stacks (user_id, id, data, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         data = excluded.data, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.stacks) {
      const stack = { ...raw, updatedAt: clamp(raw.updatedAt) };
      if (!shouldReplace(stacks.get(stack.id), stack)) continue;
      const data: StackData = {
        title: stack.title,
        subject: stack.subject,
        languages: stack.languages,
        cards: stack.deleted ? [] : stack.cards,
        suggestedModes: stack.suggestedModes,
        source: stack.source,
      };
      upsertStack.run(userId, stack.id, JSON.stringify(data), stack.createdAt, stack.updatedAt, stack.deleted ? 1 : 0);
    }

    const topics = new Map(getTopics(db, userId).map((topic) => [topic.id, topic]));
    const upsertTopic = db.prepare(
      `INSERT INTO learn_topics (user_id, id, data, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         data = excluded.data, created_at = excluded.created_at, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.topics ?? []) {
      const topic = { ...raw, updatedAt: clamp(raw.updatedAt) };
      if (!shouldReplace(topics.get(topic.id), topic)) continue;
      const data: TopicData = {
        title: topic.title,
        subject: topic.subject,
        level: topic.level,
        goals: topic.deleted ? [] : topic.goals,
        notes: topic.deleted ? '' : topic.notes,
        examDate: topic.examDate,
        source: topic.source,
      };
      upsertTopic.run(userId, topic.id, JSON.stringify(data), topic.createdAt, topic.updatedAt, topic.deleted ? 1 : 0);
    }

    const progress = new Map(getProgress(db, userId).map((entry) => [entry.id, entry]));
    const upsertProgress = db.prepare(
      `INSERT INTO learn_progress (user_id, id, stack_id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         stack_id = excluded.stack_id, data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.progress) {
      const entry = { ...raw, updatedAt: clamp(raw.updatedAt) };
      if (!shouldReplace(progress.get(entry.id), entry)) continue;
      const data: ProgressData = {
        player: entry.player,
        cards: entry.deleted || entry.removed ? {} : entry.cards,
        days: entry.deleted || entry.removed ? [] : (entry.days ?? []),
        // Only stored while it counts: a deleted record removes nobody.
        ...(entry.removed && !entry.deleted ? { removed: true } : {}),
      };
      upsertProgress.run(userId, entry.id, entry.stackId, JSON.stringify(data), entry.updatedAt, entry.deleted ? 1 : 0);
    }

    // The documents of a topic go a day after the topic (a day leaves time for «Rückgängig» on every device).
    db.prepare(
      `DELETE FROM learn_documents WHERE user_id = ? AND topic_id IN
         (SELECT id FROM learn_topics WHERE user_id = ? AND deleted = 1 AND updated_at < ?)`,
    ).run(userId, userId, now - 24 * 60 * 60 * 1000);

    // Coins: merged per device – never «last write wins», so no coin gets lost (shared/coins.ts).
    const wallets = new Map(getWallets(db, userId).map((wallet) => [wallet.id, wallet]));
    const upsertWallet = db.prepare(
      `INSERT INTO coin_wallets (user_id, id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted`,
    );
    for (const raw of incoming.wallets ?? []) {
      const wallet = cleanWallet({ ...raw, updatedAt: clamp(raw.updatedAt) });
      const known = wallets.get(wallet.id);
      if (!known && wallets.size >= LIMITS.wallets) continue;
      const merged = mergeWallet(known, wallet);
      wallets.set(merged.id, merged);
      upsertWallet.run(userId, merged.id, JSON.stringify(merged), merged.updatedAt, merged.deleted ? 1 : 0);
    }
    if (incoming.rewards) {
      const rewards = cleanRewards({ ...incoming.rewards, updatedAt: clamp(incoming.rewards.updatedAt) });
      const known = getRewards(db, userId);
      if (!known || rewards.updatedAt > known.updatedAt) {
        db.prepare(
          `INSERT INTO reward_settings (user_id, data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        ).run(userId, JSON.stringify(rewards), rewards.updatedAt);
      }
    }

    const cutoff = now - TOMBSTONE_TTL_MS;
    for (const table of ['library', 'player_groups', 'learn_stacks', 'learn_progress', 'learn_topics', 'coin_wallets']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND deleted = 1 AND updated_at < ?`).run(userId, cutoff);
    }
  });

  return {
    library: getLibrary(db, userId),
    groups: getGroups(db, userId),
    stacks: getStacks(db, userId),
    progress: getProgress(db, userId),
    topics: getTopics(db, userId),
    wallets: getWallets(db, userId),
    rewards: getRewards(db, userId),
  };
}

export function getWallets(db: Database, userId: string): CoinWallet[] {
  const rows = db.prepare('SELECT data FROM coin_wallets WHERE user_id = ? ORDER BY id').all(userId) as { data: string }[];
  return rows.map((row) => JSON.parse(row.data) as CoinWallet);
}

export function getRewards(db: Database, userId: string): RewardSettings | null {
  const row = db.prepare('SELECT data FROM reward_settings WHERE user_id = ?').get(userId) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as RewardSettings) : null;
}

/** All documents of «Aufgaben» – for the data export. */
export function listAllDocuments(db: Database, userId: string): TaskDocument[] {
  const rows = db.prepare('SELECT * FROM learn_documents WHERE user_id = ? ORDER BY created_at').all(userId) as unknown as DocumentRow[];
  return rows.map(toDocument);
}
