import { z } from 'zod';
import { LIMITS } from '../../shared/types.ts';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Ungültige Farbe.');
const timestamp = z.number().int().nonnegative();
const id = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Ungültige ID.');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Bitte gib einen Namen ein.')
  .max(LIMITS.nameMax, `Der Name darf höchstens ${LIMITS.nameMax} Zeichen lang sein.`);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Die E-Mail-Adresse ist zu lang.')
  .pipe(z.email('Bitte gib eine gültige E-Mail-Adresse ein.'));

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Das Passwort muss mindestens ${LIMITS.passwordMin} Zeichen lang sein.`)
  .max(LIMITS.passwordMax, 'Das Passwort ist zu lang.');

const avatarSchema = z.string().min(1).max(16);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  inviteCode: z.string().max(64, 'Der Einladungscode ist zu lang.').optional(),
  /** A shared stack link counts as an invitation. */
  shareId: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Bitte gib dein Passwort ein.').max(LIMITS.passwordMax),
});

export const updateAccountSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  avatar: avatarSchema.optional(),
  color: hexColor.optional(),
  /** Hide the passkey hint on the home screen for good. */
  passkeyHintDismissed: z.literal(true).optional(),
  /** Required when the e-mail address changes. */
  password: z.string().max(LIMITS.passwordMax).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Bitte gib dein aktuelles Passwort ein.').max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Bitte bestätige mit deinem Passwort.').max(LIMITS.passwordMax),
});

const playerSchema = z.object({
  id,
  name: nameSchema,
  color: hexColor,
});

const groupSchema = z.object({
  id,
  name: z.string().trim().min(1, 'Die Gruppe braucht einen Namen.').max(LIMITS.groupNameMax),
  emoji: avatarSchema,
  players: z.array(playerSchema).max(LIMITS.playersPerGroup),
  createdAt: timestamp,
  updatedAt: timestamp,
  deleted: z.boolean(),
});

const libraryItemSchema = z.object({
  gameId: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Ungültige Spiel-ID.'),
  addedAt: timestamp,
  updatedAt: timestamp,
  deleted: z.boolean(),
});

const cardText = z.string().trim().min(1).max(LIMITS.cardText);

const learnCardSchema = z.object({
  id,
  kind: z.enum(['translation', 'definition', 'qa', 'number']),
  prompt: cardText,
  answer: cardText,
  accepted: z.array(cardText).max(10),
  distractors: z.array(cardText).max(3),
});

const learnModeSchema = z.enum(['blitz', 'duell', 'kasten']);

const learnStackSchema = z.object({
  id,
  title: z.string().trim().min(1, 'Der Stapel braucht einen Titel.').max(LIMITS.stackTitleMax),
  subject: z.string().trim().max(40),
  languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(2),
  cards: z.array(learnCardSchema).max(LIMITS.cardsPerStack),
  suggestedModes: z.array(learnModeSchema).max(3),
  source: z.enum(['photo', 'text', 'shared']),
  createdAt: timestamp,
  updatedAt: timestamp,
  deleted: z.boolean(),
});

const learnProgressSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,100}$/, 'Ungültige ID.'),
  stackId: id,
  player: nameSchema,
  cards: z
    .record(id, z.object({ box: z.number().int().min(1).max(5), due: timestamp }))
    .refine((cards) => Object.keys(cards).length <= LIMITS.cardsPerStack, 'Zu viele Karten.'),
  updatedAt: timestamp,
  deleted: z.boolean(),
});

export const shareSchema = z.object({
  stackId: id,
  title: learnStackSchema.shape.title,
  subject: learnStackSchema.shape.subject,
  languages: learnStackSchema.shape.languages,
  cards: z.array(learnCardSchema).min(1, 'Der Stapel hat keine Karten.').max(LIMITS.cardsPerStack),
  suggestedModes: learnStackSchema.shape.suggestedModes,
});

export const shareIdSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{10,64}$/, 'Ungültiger Link.') });

export const syncSchema = z.object({
  library: z.array(libraryItemSchema).max(LIMITS.library * 2),
  groups: z.array(groupSchema).max(LIMITS.groups * 2),
  // Older app versions do not send learning stacks yet.
  stacks: z.array(learnStackSchema).max(LIMITS.stacks * 2).default([]),
  progress: z.array(learnProgressSchema).max(LIMITS.stacks * 2 * LIMITS.playersPerGroup).default([]),
});

/* ---------------------------------------------------------------- passkeys */

const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/, 'Ungültige Daten.').max(4096);

/** Shape of a WebAuthn credential (JSON) – the details are verified by SimpleWebAuthn. */
const credentialSchema = z
  .object({
    id: base64url,
    rawId: base64url,
    type: z.literal('public-key'),
    response: z.record(z.string(), z.unknown()),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.string().max(40).optional(),
  })
  .loose();

export const passkeyResponseSchema = z.object({ response: credentialSchema });
