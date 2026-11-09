import { AppError } from '../core/errors.js';

// The HTTP status each AppError code is answered with. Services only know the codes, and
// this is the only place that knows the numbers. A code that is not listed here is treated
// as an unexpected error (500), so a forgotten entry never leaks anything.
const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  EMAIL_TAKEN: 409,
};

// Central error handler. Express recognizes it by its FOUR parameters.
// Every error thrown in a route (or rejected in an async route) ends up here, so the
// client always gets the same JSON shape and never sees internal details.
export function errorHandler(error, req, res, next) {
  // If the response already started, Express's default handler must close the connection.
  if (res.headersSent) {
    return next(error);
  }

  // An error of our own: we wrote its message, so it is safe to send to the client.
  if (error instanceof AppError && Object.hasOwn(STATUS_BY_CODE, error.code)) {
    const body = { code: error.code, message: error.message };

    if (error.details) {
      body.details = error.details;
    }

    return res.status(STATUS_BY_CODE[error.code]).json({ error: body });
  }

  // Errors caused by the client carry a 4xx status (for example, malformed JSON gives 400).
  const status = error.status;

  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
  }

  // Anything else is our fault: log it for us, and send a generic message to the client.
  console.error(error);

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
