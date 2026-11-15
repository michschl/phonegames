/**
 * Minimal software passkey authenticator for tests: creates an ES256 key pair
 * and produces WebAuthn registration and sign-in responses the way a browser
 * with a platform authenticator would.
 */
import crypto from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('base64url');
const sha256 = (data: Uint8Array | string) => crypto.createHash('sha256').update(data).digest();

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

export class SoftAuthenticator {
  readonly credentialId = crypto.randomBytes(32);
  private readonly keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private counter = 0;
  private userHandle = '';
  /** AAGUID of the iCloud keychain, so the passkey gets a recognisable name. */
  aaguid = Buffer.from('fbfc3007154e4ecc8c0b6e020557d7bd', 'hex');
  /** Whether the authenticator verifies the user (Face ID, fingerprint, PIN). */
  userVerified = true;

  readonly rpID: string;
  readonly origin: string;

  constructor(rpID = 'localhost', origin = 'http://localhost:3000') {
    this.rpID = rpID;
    this.origin = origin;
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  private flags(extra = 0): number {
    return FLAG_UP | (this.userVerified ? FLAG_UV : 0) | FLAG_BE | FLAG_BS | extra;
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin = this.origin): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  private counterBytes(): Buffer {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32BE(this.counter);
    return bytes;
  }

  /** Response to `navigator.credentials.create()` for the given registration options. */
  register(options: { challenge: string; user: { id: string } }, origin?: string) {
    this.userHandle = options.user.id;
    const jwk = this.keys.publicKey.export({ format: 'jwk' });
    const cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
        [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
      ]),
    );
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpID),
      Buffer.from([this.flags(FLAG_AT)]),
      this.counterBytes(),
      this.aaguid,
      idLength,
      this.credentialId,
      Buffer.from(cosePublicKey),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Map<string, string> | Uint8Array>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, string>()],
        ['authData', new Uint8Array(authData)],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge, origin)),
        attestationObject: b64url(attestationObject),
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** Response to `navigator.credentials.get()` for the given sign-in options. */
  signIn(options: { challenge: string }, origin?: string) {
    this.counter += 1;
    const authData = Buffer.concat([sha256(this.rpID), Buffer.from([this.flags()]), this.counterBytes()]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge, origin);
    const signature = crypto.sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), this.keys.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
