// Command line entry point: "npm run migrate" applies the pending migrations
// to the database named in the DATABASE_URL environment variable.
import { createPool } from './connection.js';
import { runMigrations } from './migrate.js';

const pool = createPool(process.env.DATABASE_URL);

try {
  const applied = await runMigrations(pool);

  console.log(
    applied.length === 0 ? 'No new migrations to apply.' : `Applied: ${applied.join(', ')}`,
  );
} finally {
  await pool.end();
}
