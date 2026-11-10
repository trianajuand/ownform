import express from 'express';

import { createHealthModule } from './modules/health/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createCharacterModule } from './modules/character/index.js';
import { createGymModule } from './modules/gym/index.js';

import { notFound } from './middlewares/not-found.js';
import { errorHandler } from './middlewares/error-handler.js';

// Builds the Express application and returns it.
// It does NOT start a server: server.js does that.
export function createApp({ pool }) {
  const app = express();

  // Turns a JSON request body into a JavaScript object in req.body.
  app.use(express.json());

  // Create modules
  const health = createHealthModule({ pool });
  const character = createCharacterModule({ pool });
  const gym = createGymModule({ pool });

  // Auth receives the services it needs from other modules.
  const auth = createAuthModule({
    pool,
    characterService: character.service,
    gymService: gym.service
  });

  // Mount routes
  app.use('/api/health', health.router);
  app.use('/api/auth', auth.router);

  // Order matters: these two go last, after every route.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}