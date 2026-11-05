// Central error handler. Express recognizes it by its FOUR parameters.
// Every error thrown in a route (or rejected in an async route) ends up here, so the
// client always gets the same JSON shape and never sees internal details.
export function errorHandler(error, req, res, next) {
  // If the response already started, Express's default handler must close the connection.
  if (res.headersSent) {
    return next(error);
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
