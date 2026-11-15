export const SESSION_COOKIE = 'plausch_session';

/** Errors with a status code and a user facing (German) message. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
