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

/* ------------------------------------------------------------ Lernstapel */

/**
 * translation = Wort/Übersetzung, definition = Begriff/Erklärung, qa = Frage/Antwort, number = Zahl/Jahr,
 * cloze = Lückentext (Satz mit der Lücke «___», Antwort = fehlendes Wort).
 */
export type LearnCardKind = 'translation' | 'definition' | 'qa' | 'number' | 'cloze';
/**
 * blitz = Blitzrunde (Teams), duell = Auswahl aus vier (zu zweit), kasten = Kartenkasten (allein),
 * schaetzen = Schätzrunde (Zahlen und Jahreszahlen), luecke = Lückentext.
 */
export type LearnMode = 'blitz' | 'duell' | 'kasten' | 'schaetzen' | 'luecke';

export interface LearnCard {
  id: string;
  kind: LearnCardKind;
  /** Frage, Wort oder Begriff. */
  prompt: string;
  answer: string;
  /** Further answers that count as correct («viel», «sehr»). */
  accepted: string[];
  /** Plausible wrong answers for multiple choice (at most 3). */
  distractors: string[];
}

/** A learning card stack («Lernstapel»), synced like the player groups. */
export interface LearnStack {
  id: string;
  title: string;
  subject: string;
  /** For vocabulary: [language of the prompt, language of the answer] as ISO codes, else empty. */
  languages: string[];
  cards: LearnCard[];
  suggestedModes: LearnMode[];
  source: 'photo' | 'text' | 'shared';
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

/** Leitner box (1–5) and when the card is due again. */
export interface CardProgress {
  box: number;
  due: number;
}

/** What one person knows of one stack («Kartenkasten»). */
export interface LearnProgress {
  /** Derived from stack and person, see progressId() – the same on every device. */
  id: string;
  stackId: string;
  /** Name of the person learning (from the player group). */
  player: string;
  cards: Record<string, CardProgress>;
  /**
   * Days (local date, YYYY-MM-DD) on which the person answered cards of this stack – the newest
   * LIMITS.learnDays. Over all stacks they make the learning streak. Missing in data of older versions.
   */
  days?: string[];
  /**
   * Removed from «Wer lernt?» of this stack – on every device. The Kartenkasten is empty and the person
   * is not offered for this stack until the name is added again or the person learns it after all.
   * Missing in data of older versions.
   */
  removed?: boolean;
  updatedAt: number;
  deleted: boolean;
}

/** A card as returned by the photo analysis – reviewed by the user before saving. */
export interface LearnDraftCard extends Omit<LearnCard, 'id'> {
  /** Why the card needs a second look (e.g. unclear handwriting), or empty. */
  uncertain: string;
}

/** exact = nur was auf den Fotos steht, creative = Thema erkennen und neue, ähnliche Aufgaben erfinden. */
export type LearnExtractMode = 'exact' | 'creative';

export interface LearnDraft {
  title: string;
  subject: string;
  languages: string[];
  cards: LearnDraftCard[];
  suggestedModes: LearnMode[];
  /** Names, grades or signatures were left out. */
  removedPersonalData: boolean;
  /** The AI invented new cards on the topic of the photos (mode «creative»). */
  generated: boolean;
}

/** Photo analyses left this month. */
export interface LearnUsage {
  /** The server has an AI service configured. */
  available: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** First day of the next month (YYYY-MM-DD), when the counter starts again. */
  resetsOn: string;
  maxPhotos: number;
}

/** A stack the user shares by link (for the owner). */
export interface LearnShareInfo {
  id: string;
  stackId: string;
  updatedAt: number;
  /** How often the stack was taken over, and how many accounts were created with the link. */
  imports: number;
  signups: number;
}

/** Cards of a shared stack, without progress or names. */
export type LearnShareStack = Pick<LearnStack, 'title' | 'subject' | 'languages' | 'cards' | 'suggestedModes'>;

/** What anybody with the link sees. */
export interface LearnSharePreview {
  id: string;
  title: string;
  subject: string;
  cardCount: number;
  /** The first cards as a teaser. */
  sample: { prompt: string; answer: string }[];
  /** The link still works as an invitation (registering without a code). */
  invites: boolean;
}

export interface LearnExtractResponse {
  draft: LearnDraft;
  usage: LearnUsage;
}

export interface SyncPayload {
  library: LibraryItem[];
  groups: PlayerGroup[];
  stacks: LearnStack[];
  progress: LearnProgress[];
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
  stacks: 200,
  cardsPerStack: 300,
  /** Learning days kept per person and stack – enough for a streak of two months. */
  learnDays: 60,
  cardText: 300,
  stackTitleMax: 80,
  learnPhotos: 6,
  /** Accounts that may be created with one shared link. */
  shareSignups: 50,
} as const;
