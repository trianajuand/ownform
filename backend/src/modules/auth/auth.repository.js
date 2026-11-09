// Repository: the only file of the auth module that talks to PostgreSQL.
// Every method accepts an optional "db" argument. By default it is the pool, but a service
// can pass a client that is inside a transaction, so that several queries succeed or fail
// together.

//Initial its a function because the findEmail or the createUser ALWAYS return an object and we are gonna save this object in the function
export function createAuthRepository({ pool }) {
  return {
    // Returns the user with this email (ignoring upper and lower case), or null if there is none.
    async findByEmail(email, db = pool) {
      const { rows } = await db.query(
        `SELECT id, name, email, password_hash AS "passwordHash", role
         FROM users
         WHERE lower(email) = lower($1)`,
        [email],
      );

      return rows[0] ?? null;
    },

    // Inserts a user and returns it WITHOUT the password hash.
    // The database fills in id, role and created_at by itself.
    async createUser({ name, email, passwordHash }, db = pool) {
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, role`,
        [name, email, passwordHash],
      );
      return rows[0];
    },
  };
}
