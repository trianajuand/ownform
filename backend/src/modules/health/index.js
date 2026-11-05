import { createHealthRepository } from './Health.repository.js';
import { createHealthService } from './Health.service.js';
import { createHealthController } from './Health.controller.js';
import { createHealthRouter } from './Health.routes.js';

// Public entry point of the module. It wires the layers together
// (repository -> service -> controller -> router) and exposes only the router.
// Other files import the module through this file, never its internal files.
export function createHealthModule({ pool }) {
  const healthRepository = createHealthRepository({ pool });
  const healthService = createHealthService({ healthRepository });
  const healthController = createHealthController({ healthService });

  return { router: createHealthRouter({ healthController }) };
}
