export const SESSION_COOKIE = 'phonegames_session';

/** Errors with a status code and a user facing (German) message. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** `cause`: what went wrong behind the scenes – logged, never sent to the client. */
  constructor(statusCode: number, code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.statusCode = statusCode;
    this.code = code;
  }
}
