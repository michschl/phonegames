import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import type {
  ApiErrorBody,
  AuthOptions,
  LearnExtractMode,
  LearnExtractResponse,
  LearnShareInfo,
  LearnSharePreview,
  LearnShareStack,
  LearnUsage,
  PasskeyInfo,
  TopicDraftResponse,
  PublicUser,
  SyncPayload,
  SyncResponse,
} from '../../../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Thrown when the device is offline or the server cannot be reached. */
export class OfflineError extends Error {
  constructor() {
    super('Keine Verbindung. Bitte prüfe dein Internet und versuche es nochmals.');
  }
}

const subscriptionListeners = new Set<() => void>();

/** Called when the server says the subscription has ended (HTTP 402) – see session.ts. */
export function onSubscriptionRequired(listener: () => void): () => void {
  subscriptionListeners.add(listener);
  return () => subscriptionListeners.delete(listener);
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'phonegames',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new OfflineError();
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // A non-JSON answer usually means a proxy error page or the server is down.
    if (!response.ok) throw new OfflineError();
  }

  if (!response.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    if (response.status === 402) for (const listener of subscriptionListeners) listener();
    throw new ApiError(response.status, err.error ?? 'error', err.message ?? 'Da ist etwas schiefgelaufen.');
  }
  return data as T;
}

export const api = {
  authOptions: () => request<AuthOptions>('GET', '/api/auth/options'),
  register: (body: { name: string; email: string; password: string; inviteCode?: string; shareId?: string; termsVersion?: string }) =>
    request<{ user: PublicUser }>('POST', '/api/auth/register', body),
  login: (body: { email: string; password: string }) => request<{ user: PublicUser }>('POST', '/api/auth/login', body),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<{ user: PublicUser }>('GET', '/api/auth/me'),
  updateAccount: (
    body: Partial<{ name: string; email: string; avatar: string; color: string; password: string; passkeyHintDismissed: true }>,
  ) => request<{ user: PublicUser }>('PATCH', '/api/account', body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>('POST', '/api/account/password', body),
  deleteAccount: (body: { password: string }) => request<void>('DELETE', '/api/account', body),
  /** Agree to the terms of use and the privacy notice (shared/legal.ts). */
  acceptTerms: (version: string) => request<{ user: PublicUser }>('POST', '/api/account/terms', { version }),
  exportData: () => request<unknown>('GET', '/api/account/export'),
  sync: (body: SyncPayload) => request<SyncResponse>('POST', '/api/sync', body),
  passkeys: () => request<{ passkeys: PasskeyInfo[]; userHandle: string }>('GET', '/api/passkeys'),
  passkeyRegisterOptions: () => request<PublicKeyCredentialCreationOptionsJSON>('POST', '/api/passkeys/register/options', {}),
  passkeyRegisterVerify: (response: RegistrationResponseJSON) =>
    request<{ passkey: PasskeyInfo; user: PublicUser }>('POST', '/api/passkeys/register/verify', { response }),
  deletePasskey: (id: string) =>
    request<{ user: PublicUser; remaining: string[] }>('DELETE', `/api/passkeys/${encodeURIComponent(id)}`),
  passkeyLoginOptions: () => request<PublicKeyCredentialRequestOptionsJSON>('POST', '/api/passkeys/login/options', {}),
  passkeyLoginVerify: (response: AuthenticationResponseJSON) =>
    request<{ user: PublicUser }>('POST', '/api/passkeys/login/verify', { response }),
  learnUsage: () => request<LearnUsage>('GET', '/api/learn/usage'),
  /** Photos as data URLs (downscaled JPEG). Can take a while – the AI reads every photo. */
  learnExtract: (images: string[], options: { mode: LearnExtractMode; count: number }) =>
    request<LearnExtractResponse>('POST', '/api/learn/extract', { images, ...options }),
  myShares: () => request<{ shares: LearnShareInfo[] }>('GET', '/api/shares/mine'),
  shareStack: (body: LearnShareStack & { stackId: string }) => request<{ share: LearnShareInfo }>('POST', '/api/shares', body),
  deleteShare: (id: string) => request<void>('DELETE', `/api/shares/${encodeURIComponent(id)}`),
  sharePreview: (id: string) => request<LearnSharePreview>('GET', `/api/shares/${encodeURIComponent(id)}`),
  importShare: (id: string) => request<{ stack: LearnShareStack }>('POST', `/api/shares/${encodeURIComponent(id)}/import`, {}),
  /** «Aufgaben»: learning goals of a topic from photos and/or keywords. Takes a while – the AI reads everything. */
  topicDraft: (body: { images: string[]; text: string; subject: string; level: string }) =>
    request<TopicDraftResponse>('POST', '/api/tasks/topic', body),
  /** Stripe's payment page for the yearly subscription. */
  billingCheckout: () => request<{ url: string }>('POST', '/api/billing/checkout', {}),
  billingConfirm: (sessionId: string) => request<{ user: PublicUser; confirmed: boolean }>('POST', '/api/billing/confirm', { sessionId }),
  /** Stripe's customer portal: cancel, payment method, receipts. */
  billingPortal: () => request<{ url: string }>('POST', '/api/billing/portal', {}),
  billingRefresh: () => request<{ user: PublicUser }>('POST', '/api/billing/refresh', {}),
};

/** Public address of a shared stack. */
export function shareUrl(id: string): string {
  return `${window.location.origin}/s/${id}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof OfflineError) return error.message;
  return 'Da ist etwas schiefgelaufen.';
}
