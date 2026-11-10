// "db" is optional and is passed straight to the repository. A use case that runs inside
// a transaction (for example registration) passes its transaction client here.
export function createCharacterService({ characterRepository }) {
  return {
    // Activates a module for a user: from now on the user has XP in that module.
    async activateModule({ userId, module }, db) {
      return characterRepository.createStat({ userId, module }, db);
    },
  };
}