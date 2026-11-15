/**
 * Passkeys (WebAuthn): sign in with Face ID, fingerprint or the device PIN.
 * The cryptography is handled by SimpleWebAuthn; this module adds friendly
 * German errors and keeps the signed-in user up to date.
 */
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  sendSignal,
  startAuthentication,
  startRegistration,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { PasskeyInfo, PublicUser } from '../../../shared/types.ts';
import { useAuth } from '../store/auth.ts';
import { api, ApiError, OfflineError } from './api.ts';
import { loadAuthOptions } from './authOptions.ts';
import { signIn } from './session.ts';

/*
 * Safari wants the Face ID dialog to open right inside the tap. Loading the
 * options beforehand means no network round trip sits between tap and dialog.
 * Server challenges live five minutes, prepared options are used for four.
 */
const FRESH_MS = 4 * 60_000;
let preparedRegistration: { userId: string; at: number; options: Promise<PublicKeyCredentialCreationOptionsJSON> } | null = null;
let preparedSignIn: { at: number; options: Promise<PublicKeyCredentialRequestOptionsJSON> } | null = null;

/** Loads the options for creating a passkey ahead of the tap. */
export function preparePasskey(): void {
  const userId = useAuth.getState().user?.id;
  if (!userId || !navigator.onLine) return;
  if (preparedRegistration?.userId === userId && Date.now() - preparedRegistration.at < FRESH_MS) return;
  const options = api.passkeyRegisterOptions();
  options.catch(() => (preparedRegistration = null));
  preparedRegistration = { userId, at: Date.now(), options };
}

/** Loads the options for signing in with a passkey ahead of the tap. */
export function preparePasskeySignIn(): void {
  if (!navigator.onLine || (preparedSignIn && Date.now() - preparedSignIn.at < FRESH_MS)) return;
  const options = api.passkeyLoginOptions();
  options.catch(() => (preparedSignIn = null));
  preparedSignIn = { at: Date.now(), options };
}

function registrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const prepared = preparedRegistration;
  preparedRegistration = null;
  const fresh = prepared && prepared.userId === useAuth.getState().user?.id && Date.now() - prepared.at < FRESH_MS;
  return fresh ? prepared.options : api.passkeyRegisterOptions();
}

function signInOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const prepared = preparedSignIn;
  preparedSignIn = null;
  return prepared && Date.now() - prepared.at < FRESH_MS ? prepared.options : api.passkeyLoginOptions();
}

/** The user closed the system dialog – not an error worth showing. */
export class PasskeyCancelled extends Error {}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

/** Face ID, fingerprint, Windows Hello … are available on this device. */
export async function deviceCanUsePasskeys(): Promise<boolean> {
  if (!passkeysSupported()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

function friendly(error: unknown): Error {
  if (error instanceof ApiError || error instanceof OfflineError) return error;
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
    return new PasskeyCancelled('Abgebrochen.');
  }
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return new Error('Auf diesem Gerät ist schon ein Passkey für dein Konto gespeichert.');
  }
  if (name === 'SecurityError') {
    return new Error('Passkeys funktionieren nur über die sichere Adresse der App.');
  }
  return new Error('Das hat leider nicht geklappt. Bitte versuche es nochmals.');
}

/** Lets the device forget passkeys the server no longer knows (supported browsers only). */
async function signal(run: (rpID: string) => Promise<unknown>): Promise<void> {
  try {
    const options = await loadAuthOptions();
    if (options.passkeys) await run(options.passkeys.rpID);
  } catch {
    /* best effort */
  }
}

/** Creates a passkey for the signed-in user (opens the system dialog). */
export async function createPasskey(): Promise<PasskeyInfo> {
  try {
    const optionsJSON = await registrationOptions();
    const response = await startRegistration({ optionsJSON });
    const { passkey, user } = await api.passkeyRegisterVerify(response);
    useAuth.setState({ user });
    return passkey;
  } catch (error) {
    throw friendly(error);
  }
}

/** Signs in with a passkey stored on this device (or a phone nearby). */
export async function signInWithPasskey(): Promise<PublicUser> {
  let response: AuthenticationResponseJSON | null = null;
  try {
    const optionsJSON = await signInOptions();
    response = await startAuthentication({ optionsJSON });
    const { user } = await api.passkeyLoginVerify(response);
    signIn(user);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unknown_passkey' && response) {
      const credentialID = response.id;
      void signal((rpID) => sendSignal({ signalName: 'unknownCredential', rpID, credentialID }));
    }
    throw friendly(error);
  }
}

/** Deletes a passkey on the server and asks the device to forget it, too. */
export async function deletePasskey(id: string, userHandle: string): Promise<void> {
  const { user, remaining } = await api.deletePasskey(id);
  useAuth.setState({ user });
  void signal((rpID) =>
    sendSignal({ signalName: 'allAcceptedCredentials', rpID, userID: userHandle, allAcceptedCredentialIDs: remaining }),
  );
}
