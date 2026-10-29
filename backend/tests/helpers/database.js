import { randomUUID } from 'node:crypto';
import { createPool } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';

// Reads DATABASE_URL from the environment, or from backend/.env when it is not set.
export function getDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile();
    } catch {
      // There is no .env file. The check below explains what to do.
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and start the database with "npm run db:up".',
    );
  }

  return process.env.DATABASE_URL;
}

// Creates a brand new, empty schema for ONE test file and (by default) applies every migration.
// A schema is a separate "folder" of tables inside the same database, so test files can run
// at the same time without touching each other or the development data in the public schema.
// Returns { pool, close }. Call close() when the tests finish: it drops the schema.
export async function createTestDatabase({ migrate = true } = {}) {
  const databaseUrl = getDatabaseUrl();
  const schema = `test_${randomUUID().replaceAll('-', '')}`;

  const adminPool = createPool(databaseUrl);
  await adminPool.query(`CREATE SCHEMA ${schema}`);

  const pool = createPool(databaseUrl, { options: `-c search_path=${schema}` });
  if (migrate) {
    await runMigrations(pool);
  }

  return {
    pool,
    async close() {
      await pool.end();
      await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
      await adminPool.end();
    },
  };
}
