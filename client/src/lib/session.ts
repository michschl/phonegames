import type { PublicUser } from '../../../shared/types.ts';
import { api, ApiError } from './api.ts';
import { handleSessionExpired, syncNow } from './sync.ts';
import { useAuth } from '../store/auth.ts';
import { useData } from '../store/data.ts';

function signIn(user: PublicUser): void {
  const data = useData.getState();
  if (data.ownerId !== user.id) data.resetFor(user.id);
  useAuth.setState({ user });
  void syncNow();
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  inviteCode?: string;
}): Promise<PublicUser> {
  const { user } = await api.register(input);
  signIn(user);
  return user;
}

export async function login(input: { email: string; password: string }): Promise<PublicUser> {
  const { user } = await api.login(input);
  signIn(user);
  return user;
}

export async function logout(): Promise<void> {
  await syncNow().catch(() => false);
  try {
    await api.logout();
  } catch {
    /* offline – the server session expires on its own */
  }
  useAuth.setState({ user: null });
  useData.getState().resetFor(null);
}

/** Validate the stored session with the server (when online). */
export async function refreshSession(): Promise<void> {
  if (!useAuth.getState().user || !navigator.onLine) return;
  try {
    const { user } = await api.me();
    useAuth.setState({ user });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) handleSessionExpired();
  }
}

export async function updateProfile(
  patch: Partial<{ name: string; email: string; avatar: string; color: string; password: string }>,
): Promise<PublicUser> {
  const { user } = await api.updateAccount(patch);
  useAuth.setState({ user });
  return user;
}

export async function deleteAccount(password: string): Promise<void> {
  await api.deleteAccount({ password });
  useAuth.setState({ user: null });
  useData.getState().resetFor(null);
}
