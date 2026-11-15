import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * scrypt parameters (OWASP: N=2^15, r=8, p=3 ≈ 32 MiB per hash).
 * The parameters are stored with every hash so they can be raised later.
 */
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const N = Number(n);
  const R = Number(r);
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: R,
    p: Number(p),
    maxmem: 128 * N * R * 2,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** A precomputed hash used to keep login timing constant for unknown e-mails. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Invitation codes are compared case-insensitively and ignore spaces. */
export function normalizeInviteCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

/** Constant-time check of an invitation code against all valid codes. */
export function matchesInviteCode(code: string, validCodes: readonly string[]): boolean {
  const digest = (value: string) => crypto.createHash('sha256').update(normalizeInviteCode(value)).digest();
  const given = digest(code);
  let match = false;
  for (const valid of validCodes) {
    if (crypto.timingSafeEqual(given, digest(valid))) match = true;
  }
  return match;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

export function randomId(): string {
  return crypto.randomUUID();
}
