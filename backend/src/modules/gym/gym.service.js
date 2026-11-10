// "db" is optional and is passed straight to the repository. A use case that runs inside
// a transaction (for example registration) passes its transaction client here.
export function createGymService({ gymRepository }) {
  return {
    // Creates the gym profile of a user with the training focus they chose.
    async createProfile({ userId, trainingFocus }, db) {
      return gymRepository.createProfile({ userId, trainingFocus }, db);
    },
  };
}