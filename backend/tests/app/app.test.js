import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';

// Fake pools: objects with a query function, so these tests need no Docker.
const workingPool = { query: async () => ({ rows: [] }) };
const brokenPool = {
  query: async () => {
    throw new Error('connection refused to 127.0.0.1:5432 (internal detail)');
  },
};

describe('the app', () => {
  it('GET /api/health answers 200 and { status: "ok" } when the database answers', async () => {
    const app = createApp({ pool: workingPool });

    const response = await request(app).get('/api/health');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok' });
  });

  it('answers 404 with a JSON error for an unknown route', async () => {
    const app = createApp({ pool: workingPool });

    const response = await request(app).get('/api/does-not-exist');

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  });

  it('answers a clean 500 and hides the internal detail when the database fails', async (t) => {
    const logged = t.mock.method(console, 'error', () => {});
    const app = createApp({ pool: brokenPool });

    const response = await request(app).get('/api/health');

    assert.equal(response.status, 500);
    assert.equal(response.body.error.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(response.body).includes('127.0.0.1'));
    assert.equal(logged.mock.callCount(), 1);
  });

  it('answers 400 when the request body is malformed JSON', async () => {
    const app = createApp({ pool: workingPool });

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'BAD_REQUEST');
  });
});
