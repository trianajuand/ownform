
import { createAuthRepository } from './auth.repository.js';
import { createAuthService } from './auth.service.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRouter } from './auth.routes.js';

import { withTransaction } from '../../db/transaction.js';

export function createAuthModule({ pool, characterService, gymService }) {
  const authRepository = createAuthRepository({ pool });
  const runInTransaction = (callback) => withTransaction(pool, callback);
  const authService = createAuthService({authRepository,characterService,gymService,runInTransaction});
  const authController = createAuthController({ authService });

  return {
    router: createAuthRouter({ authController })
  };
}
