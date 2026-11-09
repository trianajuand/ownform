import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { registerSchema, loginSchema } from './auth.schema.js';

// Routes: each one checks the body first (validate), then hands over to the controller.
// The paths are relative: app.js mounts this router under /api/auth.
export function createAuthRouter({ authController }) {
  const router = Router();

  router.post('/register', validate(registerSchema), authController.register);
  router.post('/login', validate(loginSchema), authController.login);

  return router;
}
