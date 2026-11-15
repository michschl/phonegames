/**
 * Types shared between the client (PWA) and the server (API).
 * Keep this file free of runtime dependencies so both sides can import it.
 */

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  /** Emoji used as avatar. */
  avatar: string;
  /** Hex colour used as avatar background. */
  color: string;
  createdAt: number;
  /** Number of passkeys registered for this account. */
  passkeys: number;
  /** The user dismissed the hint to set up a passkey (for good, on all devices). */
  passkeyHintDismissed: boolean;
}

/** A passkey as shown in the account settings (no key material). */
export interface PasskeyInfo {
  id: string;
  /** Provider or device, e.g. «iCloud-Schlüsselbund» or «Passkey auf Android». */
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** Synced between devices (e.g. via iCloud or Google). */
  synced: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
}

/** A game the user added to "Meine Spiele". */
export interface LibraryItem {
  gameId: string;
  addedAt: number;
  updatedAt: number;
  deleted: boolean;
}

/** A reusable group of players ("Spielgruppe"). */
export interface PlayerGroup {
  id: string;
  name: string;
  emoji: string;
  players: Player[];
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

export interface SyncPayload {
  library: LibraryItem[];
  groups: PlayerGroup[];
}

export interface SyncResponse extends SyncPayload {
  serverTime: number;
}

/** Public settings the client needs before signing in. */
export interface AuthOptions {
  /** Registering requires an invitation code. */
  inviteRequired: boolean;
  /** Passkey settings, or null when the server has no app origin configured. */
  passkeys: { rpID: string } | null;
  /** Narrator voices rendered on the server, or null when no TTS service is configured. */
  tts: { voices: { id: string; name: string }[] } | null;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export const LIMITS = {
  nameMax: 40,
  groupNameMax: 60,
  playersPerGroup: 30,
  groups: 200,
  library: 500,
  passwordMin: 8,
  passwordMax: 200,
} as const;
