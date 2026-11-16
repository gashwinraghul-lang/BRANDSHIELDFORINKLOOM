// server/src/lib/errors.js
export class HttpError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHENTICATED') =>
  new HttpError(401, message, code);
export const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message = 'Conflict') => new HttpError(409, message, 'CONFLICT');
