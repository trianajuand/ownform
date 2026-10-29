import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../../src/db/connection.js';
import { createTestDatabase, getDatabaseUrl } from '../helpers/database.js';

describe('createPool', () => {
  it('rejects a connection string that is not a non-empty string', () => {
    assert.throws(() => createPool(), TypeError);
    assert.throws(() => createPool(''), TypeError);
    assert.throws(() => createPool(42), TypeError);
  });

  it('connects to PostgreSQL and answers a query', async () => {
    const pool = createPool(getDatabaseUrl());

    try {
      const { rows } = await pool.query('SELECT 1 + 1 AS result');
      assert.equal(rows[0].result, 2);
    } finally {
      await pool.end();
    }
  });

  it('runs a supported PostgreSQL version (14 or later)', async () => {
    const pool = createPool(getDatabaseUrl());

    try {
      const { rows } = await pool.query('SHOW server_version_num');
      assert.ok(Number(rows[0].server_version_num) >= 140000);
    } finally {
      await pool.end();
    }
  });

  it('returns DATE columns as YYYY-MM-DD text, not as Date objects', async () => {
    const pool = createPool(getDatabaseUrl());

    try {
      const { rows } = await pool.query("SELECT '2026-10-28'::date AS day");
      assert.equal(rows[0].day, '2026-10-28');
    } finally {
      await pool.end();
    }
  });
});

describe('foreign keys', () => {
  let db;

  before(async () => {
    db = await createTestDatabase({ migrate: false });
  });

  after(async () => {
    await db.close();
  });

  it('are always enforced by PostgreSQL (no setting needed)', async () => {
    await db.pool.query('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    await db.pool.query('CREATE TABLE child (parent_id INTEGER REFERENCES parent (id))');

    await assert.rejects(db.pool.query('INSERT INTO child (parent_id) VALUES (999)'), {
      code: '23503',
    });
  });
});
