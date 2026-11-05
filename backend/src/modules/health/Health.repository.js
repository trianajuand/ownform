// Repository: the only layer that talks to PostgreSQL. All the SQL of the module lives here.
export function createHealthRepository({ pool }) {
  return {
    // Resolves when the database answers. Rejects (throws) when it does not.
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}
