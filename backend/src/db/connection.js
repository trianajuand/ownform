import pg from 'pg';

const { Pool, types } = pg;

// By default the driver turns DATE columns into JavaScript Date objects at local midnight,
// which shifts the day depending on the time zone. The XP engine works with 'YYYY-MM-DD'
// text, so DATE values are returned as they come from the database.
types.setTypeParser(types.builtins.DATE, (value) => value);

// Creates a pool of reusable connections to PostgreSQL.
// "connectionString" looks like postgresql://user:password@host:5432/database.
// "options" are extra pg Pool settings (the tests use it to pick a schema).
// Throws a TypeError if the connection string is not a non-empty string.
export function createPool(connectionString, options = {}) {
  if (typeof connectionString !== 'string' || connectionString.length === 0) {
    throw new TypeError('Connection string must be a non-empty string');
  }

  const pool = new Pool({ connectionString, ...options });

  // An idle connection can fail (for example, if the database restarts).
  // Without this listener, Node would crash with an unhandled error event.
  pool.on('error', (error) => {
    console.error('Unexpected error on an idle database connection:', error.message);
  });

  return pool;
}
