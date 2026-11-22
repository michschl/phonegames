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
  /** free = no payment (invitation code, accounts from before the subscription), paid = yearly subscription. */
  plan: 'free' | 'paid';
  /** May use the app: a free account or a subscription that runs (also in the trial). */
  access: boolean;
  /** The subscription of a paid account – null for free accounts. */
  subscription: SubscriptionInfo | null;
  /** Agreed to the current terms of use and privacy notice (shared/legal.ts) – else the app asks first. */
  termsAccepted: boolean;
  /** When the person agreed to them, or null. */
  termsAcceptedAt: number | null;
}

/**
 * Stripe's state of a subscription: none = never subscribed, trialing = free days, active = paid,
 * past_due = the payment failed (Stripe tries again), canceled = ended.
 */
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  /** End of the trial or of the paid year (ms) – when it renews or ends. */
  until: number | null;
  /** Cancelled: runs until `until`, then ends. */
  cancelAtPeriodEnd: boolean;
  /** The free trial has not been used yet. */
  trialAvailable: boolean;
  /** Payment details are stored at Stripe – «Abo verwalten» opens the customer portal. */
  manageable: boolean;
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
  /** Topics of «Aufgaben» – older app versions send none. */
  topics?: LearnTopic[];
  /** Coins and records of «Allein spielen», one per person – merged without losing a coin (see shared/coins.ts). */
  wallets?: CoinWallet[];
  /** «Belohnungen»: coins on or off, how many and what things cost. Null = never set. */
  rewards?: RewardSettings | null;
}

/* ------------------------------------------------------ coins («Belohnungen») */

export interface CoinEvent {
  id: string;
  at: number;
  /** Positive = earned or given, negative = spent or taken. */
  amount: number;
  /** «Kartenkasten «Unité 5»», «Phoni-Rennen», «Geschenk» … */
  reason: string;
}

/**
 * Coins of one person (a name of «Wer lernt?»). Every device counts what it adds and spends in its own
 * entry, so two devices changing the balance at the same time never lose a coin when merged.
 */
export interface CoinWallet {
  /** learnerId(name). */
  id: string;
  learner: string;
  /** Device id → coins earned (or given) on that device. */
  earned: Record<string, number>;
  /** Device id → coins spent (or taken) on that device. */
  spent: Record<string, number>;
  /** The latest events, oldest first. */
  history: CoinEvent[];
  /** Bought things, e.g. «auto:blitz». */
  unlocks: string[];
  /** Best score per game and age level, e.g. «memo:2» → 840. */
  best: Record<string, number>;
  updatedAt: number;
  deleted: boolean;
}

/** «Belohnungen» – set by parents (optionally behind a code), the same on every device. */
export interface RewardSettings {
  /** Coins on: learning earns coins, a round of «Allein spielen» costs coins. */
  enabled: boolean;
  /** Hash of the code that protects these settings, or empty. Not a password – a lock for children. */
  codeHash: string;
  codeSalt: string;
  /** Coins per card known in the Kartenkasten or gap filled in the Lückentext. */
  perCard: number;
  /** Coins per point in a test, task sheet or practice exam of «Aufgaben». */
  perPoint: number;
  /** At most this many coins per person and day from learning (0 = no limit). */
  dailyMax: number;
  /** Coins for a round of a game of «Allein spielen». */
  pricePerRound: number;
  updatedAt: number;
}

/* ------------------------------------------------- Aufgaben (larger topics) */

/** School levels in Switzerland – the AI writes for the level (Lehrplan 21). */
export const TOPIC_LEVELS = [
  '1. Klasse',
  '2. Klasse',
  '3. Klasse',
  '4. Klasse',
  '5. Klasse',
  '6. Klasse',
  '1. Sek',
  '2. Sek',
  '3. Sek',
  'Gymnasium',
  'Berufsschule',
  'Erwachsene',
] as const;

/** One learning goal of a topic («Du kannst …») with the core content it is about. */
export interface TopicGoal {
  id: string;
  text: string;
  /** The facts, terms and rules behind the goal – what tests and tasks are made of. */
  content: string;
}

/**
 * A larger topic for a test («Die Römer», «Bruchrechnen»): learning goals with their content, made
 * from photos or keywords. Printable tests, tasks and practice exams are made from it.
 */
export interface LearnTopic {
  id: string;
  title: string;
  subject: string;
  /** One of TOPIC_LEVELS (or what an older/other version sent). */
  level: string;
  goals: TopicGoal[];
  /** The keywords or notes the topic was made from. */
  notes: string;
  /** Day of the test (YYYY-MM-DD), or null. */
  examDate: string | null;
  source: 'photo' | 'text';
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

/** A topic as suggested by the AI – reviewed before saving. */
export interface TopicDraft {
  title: string;
  subject: string;
  level: string;
  goals: { text: string; content: string; uncertain: string }[];
  removedPersonalData: boolean;
}

export interface TopicDraftResponse {
  draft: TopicDraft;
  usage: LearnUsage;
}

/** quiz = Wissenstest, tasks = Übungsaufgaben, exam = Probeprüfung. */
export type TaskDocKind = 'quiz' | 'tasks' | 'exam';
export type TaskDifficulty = 'easy' | 'mixed' | 'hard';
/**
 * choice = one of several answers, truefalse = «richtig» or «falsch», short = a word, number or short
 * phrase, open = explain, justify, calculate (written out, checked with the sample solution).
 */
export type DocTaskType = 'choice' | 'truefalse' | 'short' | 'open';

/** One task of a printable test, task sheet or practice exam. */
export interface DocTask {
  id: string;
  type: DocTaskType;
  /** The learning goal it is about (TopicGoal.id), or null. */
  goalId: string | null;
  prompt: string;
  /** Answers to choose from (choice). */
  options: string[];
  /** choice: the right option; truefalse: «richtig»/«falsch»; short: the answer; open: the core of the solution. */
  answer: string;
  /** Other answers that count (short). */
  accepted: string[];
  /** Sample solution: the way to the answer, why it is right, what gives how many points. */
  solution: string;
  points: number;
  /** Lines of space for the answer on paper. */
  lines: number;
  /** The check found a doubt that could not be fixed – shown in the preview, or empty. */
  doubt: string;
}

/** A person solved a document (in the app or on paper): points per task. */
export interface DocAttempt {
  id: string;
  at: number;
  /** app = solved in the app, paper = points entered after solving on paper. */
  mode: 'app' | 'paper';
  /** Who solved it (a name of «Wer lernt?»), or empty. */
  learner: string;
  /** Task id → points reached. */
  scores: Record<string, number>;
}

/** Lernkarten from the learning goals of a topic – reviewed like a photo analysis before saving. */
export interface TopicCardsRequest {
  topic: Pick<LearnTopic, 'title' | 'subject' | 'level' | 'goals'>;
  goalIds: string[];
  count: number;
}

/** A test, task sheet or practice exam made by the AI from the learning goals of a topic. */
export interface TaskDocument {
  id: string;
  topicId: string;
  kind: TaskDocKind;
  /** pending = the AI is still writing, failed = it did not work (see error). */
  status: 'pending' | 'ready' | 'failed';
  error: string;
  title: string;
  /** Instructions on top of the sheet. */
  intro: string;
  durationMin: number;
  difficulty: TaskDifficulty;
  /** The learning goals the tasks are about. */
  goalIds: string[];
  tasks: DocTask[];
  attempts: DocAttempt[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskDocRequest {
  topicId: string;
  /** The topic as the app has it – also when it is not synchronised yet. */
  topic: Pick<LearnTopic, 'title' | 'subject' | 'level' | 'goals'>;
  kind: TaskDocKind;
  durationMin: 15 | 30 | 45;
  difficulty: TaskDifficulty;
  goalIds: string[];
}

/** Documents left this month. */
export interface TaskUsage {
  available: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetsOn: string;
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
  /**
   * The yearly subscription (Stripe), or null when the server takes no payments – then registering
   * needs an invitation code (if codes are set).
   */
  billing: { pricePerYear: number; currency: 'CHF'; trialDays: number } | null;
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
  topics: 200,
  goalsPerTopic: 20,
  goalText: 300,
  goalContent: 1500,
  topicNotes: 2000,
  tasksPerDocument: 40,
  attemptsPerDocument: 20,
  wallets: 50,
  walletHistory: 40,
  walletDevices: 30,
  walletUnlocks: 40,
  walletBest: 60,
  coinReason: 80,
} as const;
