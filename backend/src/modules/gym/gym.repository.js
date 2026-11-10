// Repository: the only file of the gym module that talks to PostgreSQL.

export function createGymRepository({ pool }) {
  return {
    // Inserts the gym profile of a user with the training focus they chose.
    // Returns the new row. Throws the database error if the user does not exist (foreign key),
    // if the focus is not 'strength' or 'hypertrophy' (check constraint), or if the user
    // already has a profile (primary key).
    async createProfile({ userId, trainingFocus }, db = pool) {
      const { rows } = await db.query(
        `INSERT INTO gym_profiles (user_id, training_focus)
         VALUES ($1, $2)
         RETURNING user_id AS "userId", training_focus AS "trainingFocus"`,
        [userId, trainingFocus],
      );

      return rows[0];
    },
  };
}