import { createAuthRepository } from './auth.repository.js';
import { createAuthService } from './auth.service.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRouter } from './auth.routes.js';

// Public entry point of the module. It wires the layers together
// (repository -> service -> controller -> router) and exposes only the router.
export function createAuthModule({ pool }) {
  const authRepository = createAuthRepository({ pool });
  const authService = createAuthService({ authRepository });
  const authController = createAuthController({ authService });

  return { router: createAuthRouter({ authController }) };
}
