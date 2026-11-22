import { create } from 'zustand';
import type { RewardSettings } from '../../../shared/types.ts';

/*
 * «Belohnungen»: the code that keeps children out of the settings. It is a lock, not a password: a
 * short code, checked on the device (also offline), with a hash so it is not readable in the data.
 */

/** Hash of a code with its salt (FNV-1a, many rounds – deterministic on every device). */
export function hashCode(code: string, salt: string): string {
  const text = `${salt}:${code.trim()}`;
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let round = 0; round < 3000; round++) {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ (c + round), 0x5bd1e995);
      b ^= b >>> 15;
    }
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

export function newSalt(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function hasCode(rewards: Pick<RewardSettings, 'codeHash'>): boolean {
  return rewards.codeHash !== '';
}

export function codeMatches(rewards: Pick<RewardSettings, 'codeHash' | 'codeSalt'>, code: string): boolean {
  return hasCode(rewards) && hashCode(code, rewards.codeSalt) === rewards.codeHash;
}

/** A code: 4 to 8 digits. */
export function validCode(code: string): boolean {
  return /^\d{4,8}$/.test(code.trim());
}

/** Opened with the code – for 10 minutes on this device, then locked again. */
const OPEN_MS = 10 * 60 * 1000;

interface LockState {
  openUntil: number;
  open(): void;
  lock(): void;
}

export const useRewardLock = create<LockState>()((set) => ({
  openUntil: 0,
  open: () => set({ openUntil: Date.now() + OPEN_MS }),
  lock: () => set({ openUntil: 0 }),
}));

export function isOpen(rewards: Pick<RewardSettings, 'codeHash'>, openUntil: number, now = Date.now()): boolean {
  return !hasCode(rewards) || openUntil > now;
}
