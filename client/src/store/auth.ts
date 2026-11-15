import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser } from '../../../shared/types.ts';

interface AuthState {
  /** The signed-in user. Persisted so the app works offline after login. */
  user: PublicUser | null;
}

export const useAuth = create<AuthState>()(
  persist(() => ({ user: null as PublicUser | null }), {
    name: 'plausch-auth',
    version: 1,
  }),
);
