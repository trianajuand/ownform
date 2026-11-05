import { Router } from 'express';

// Routes: connect an HTTP method and a path to a controller function. No logic here.
// The path is relative: app.js decides where the module is mounted (/api/health).
export function createHealthRouter({ healthController }) {
  const router = Router();

  router.get('/', healthController.getHealth);

  return router;
}
