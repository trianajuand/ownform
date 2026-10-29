import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES modules have no __dirname, so the folder is built from import.meta.url (decision 003).
const defaultDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Migration files are named 001_name.sql, 002_name.sql, and so on.
const MIGRATION_FILE = /^\d{3}_.+\.sql$/;

// Applies, in order, the migration files that have not been applied yet.
// Each file runs inside its own transaction: it fully applies or it changes nothing.
// Applied files are remembered in the schema_migrations table.
// Returns the names of the files applied in this run.
export async function runMigrations(pool, directory = defaultDirectory) {
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const alreadyApplied = new Set(rows.map((row) => row.filename));

    const files = (await readdir(directory)).filter((file) => MIGRATION_FILE.test(file)).sort();

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(directory, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
      }

      applied.push(file);
    }

    return applied;
  } finally {
    client.release();
  }
}
