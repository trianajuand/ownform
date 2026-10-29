import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMigrations } from '../../src/db/migrate.js';
import { createTestDatabase } from '../helpers/database.js';

async function tableExists(pool, name) {
  const { rows } = await pool.query('SELECT to_regclass($1) AS found', [name]);
  return rows[0].found !== null;
}

describe('runMigrations', () => {
  let db;
  let directory;

  before(async () => {
    db = await createTestDatabase({ migrate: false });
  });

  after(async () => {
    await db.close();
  });

  // Every test starts with an empty folder of fake migrations and an empty schema.
  beforeEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }

    directory = await mkdtemp(path.join(tmpdir(), 'ownform-migrations-'));

    await db.pool.query('DROP TABLE IF EXISTS schema_migrations, first_table, second_table');
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('applies the files in order and remembers them', async () => {
    await writeFile(path.join(directory, '002_second.sql'), 'CREATE TABLE second_table (id INT);');
    await writeFile(path.join(directory, '001_first.sql'), 'CREATE TABLE first_table (id INT);');

    const applied = await runMigrations(db.pool, directory);

    assert.deepEqual(applied, ['001_first.sql', '002_second.sql']);
    assert.equal(await tableExists(db.pool, 'first_table'), true);
    assert.equal(await tableExists(db.pool, 'second_table'), true);

    const { rows } = await db.pool.query(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    );
    assert.deepEqual(
      rows.map((row) => row.filename),
      ['001_first.sql', '002_second.sql'],
    );
  });

  it('does not apply a file twice when it runs again', async () => {
    await writeFile(path.join(directory, '001_first.sql'), 'CREATE TABLE first_table (id INT);');

    await runMigrations(db.pool, directory);
    const secondRun = await runMigrations(db.pool, directory);

    assert.deepEqual(secondRun, []);
  });

  it('applies only the new files after earlier ones were applied', async () => {
    await writeFile(path.join(directory, '001_first.sql'), 'CREATE TABLE first_table (id INT);');
    await runMigrations(db.pool, directory);

    await writeFile(path.join(directory, '002_second.sql'), 'CREATE TABLE second_table (id INT);');
    const applied = await runMigrations(db.pool, directory);

    assert.deepEqual(applied, ['002_second.sql']);
  });

  it('rolls back a failing file completely and does not record it', async () => {
    await writeFile(path.join(directory, '001_first.sql'), 'CREATE TABLE first_table (id INT);');
    await writeFile(
      path.join(directory, '002_broken.sql'),
      'CREATE TABLE second_table (id INT); THIS IS NOT SQL;',
    );

    await assert.rejects(runMigrations(db.pool, directory), /Migration 002_broken\.sql failed/);

    assert.equal(await tableExists(db.pool, 'first_table'), true);
    assert.equal(await tableExists(db.pool, 'second_table'), false);

    const { rows } = await db.pool.query('SELECT filename FROM schema_migrations');
    assert.deepEqual(
      rows.map((row) => row.filename),
      ['001_first.sql'],
    );
  });

  it('ignores files that are not numbered .sql migrations', async () => {
    await writeFile(path.join(directory, '001_first.sql'), 'CREATE TABLE first_table (id INT);');
    await writeFile(path.join(directory, 'README.md'), 'not a migration');
    await writeFile(path.join(directory, 'notes.sql'), 'THIS IS NOT SQL;');

    const applied = await runMigrations(db.pool, directory);

    assert.deepEqual(applied, ['001_first.sql']);
  });

  it('applies the real migrations folder and registers the gym module', async () => {
    const real = await createTestDatabase({ migrate: false });

    try {
      const applied = await runMigrations(real.pool);
      assert.deepEqual(applied, ['001_initial_schema.sql']);

      const { rows } = await real.pool.query('SELECT code FROM modules');
      assert.deepEqual(rows, [{ code: 'gym' }]);
    } finally {
      await real.close();
    }
  });
});
