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
