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

export const syncSchema = z.object({
  library: z.array(libraryItemSchema).max(LIMITS.library * 2),
  groups: z.array(groupSchema).max(LIMITS.groups * 2),
});
