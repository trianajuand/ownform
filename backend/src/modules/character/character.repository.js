// Repository: the only file of the character module that talks to PostgreSQL.

export function createCharacterRepository({ pool }) {
  return {
   
    async createStat({ userId, module }, db = pool) {
      const { rows } = await db.query(
        `INSERT INTO stats (user_id, module)
         VALUES ($1, $2)
         RETURNING user_id AS "userId", module, total_xp AS "totalXp"`,
        [userId, module],
      );

      return rows[0];
    },
  };
}