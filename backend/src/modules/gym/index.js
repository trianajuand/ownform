import { createGymRepository } from './gym.repository.js';
import { createGymService } from './gym.service.js';

// Public entry point of the module. It has no routes yet, so it exposes only the service
// that other modules may call (005: a module uses another one only through its index.js).
export function createGymModule({ pool }) {
  const gymRepository = createGymRepository({ pool });
  const gymService = createGymService({ gymRepository });

  return { service: gymService };
}