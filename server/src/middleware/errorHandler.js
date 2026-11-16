// server/src/middleware/errorHandler.js
import { ZodError } from 'zod';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    requestId: req.id,
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Some fields need attention',
      code: 'VALIDATION_ERROR',
      details: err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message })) || [],
      requestId: req.id,
    });
  }

  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[${req.id || '-'}]`, err);
  }
  return res.status(status).json({
    error: status >= 500 ? 'Something went wrong on our side' : err.message,
    code: err.code || (status >= 500 ? 'INTERNAL' : 'ERROR'),
    details: err.details,
    requestId: req.id,
  });
}
