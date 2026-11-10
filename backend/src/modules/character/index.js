import { createCharacterRepository } from './character.repository.js';
import { createCharacterService } from './character.service.js';

// Public entry point of the module. It has no routes yet, so it exposes only the service
// that other modules may call (005: a module uses another one only through its index.js).
export function createCharacterModule({ pool }) {
  const characterRepository = createCharacterRepository({ pool });
  const characterService = createCharacterService({ characterRepository });

  return { service: characterService };
}