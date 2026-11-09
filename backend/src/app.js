import express from 'express';
import { createHealthModule } from './modules/health/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { notFound } from './middlewares/not-found.js';
import { errorHandler } from './middlewares/error-handler.js';

// Builds the Express application and returns it. It does NOT start a server:
// server.js does that. It is the "composition root": the one place that creates the
// modules, gives them their dependencies (the pool) and mounts them under /api.
export function createApp({ pool }) {
  const app = express();

  // Turns a JSON request body into a JavaScript object in req.body.
  app.use(express.json());

  const health = createHealthModule({ pool });
  const auth = createAuthModule({ pool });

  app.use('/api/health', health.router);
  app.use('/api/auth', auth.router);

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
