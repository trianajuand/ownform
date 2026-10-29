import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/database.js';

// PostgreSQL error codes (SQLSTATE) used below.
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';
const INVALID_TEXT = '22P02';
const DATE_OUT_OF_RANGE = '22008';
const INVALID_DATE_FORMAT = '22007';

let db;
let counter = 0;

before(async () => {
  db = await createTestDatabase();
});

after(async () => {
  await db.close();
});

// ---------- helpers: every test creates its own data, so tests never depend on each other ----------

function query(text, params) {
  return db.pool.query(text, params);
}

async function createUser(overrides = {}) {
  counter += 1;
  const { name = 'Test User', email = `user${counter}@example.com`, role = 'user' } = overrides;

  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, email, 'hash', role],
  );
  return rows[0].id;
}

async function activateModule(userId, module = 'gym') {
  await query('INSERT INTO stats (user_id, module) VALUES ($1, $2)', [userId, module]);
}

async function createExercise(name) {
  counter += 1;
  const { rows } = await query(
    'INSERT INTO exercises (name, muscle_group) VALUES ($1, $2) RETURNING id',
    [name ?? `Exercise ${counter}`, 'chest'],
  );
  return rows[0].id;
}

async function createWorkout(userId, overrides = {}) {
  const {
    performedOn = '2026-10-19',
    startedAt = '2026-10-19T10:00:00Z',
    durationMin = 60,
  } = overrides;

  const { rows } = await query(
    `INSERT INTO workouts (user_id, performed_on, started_at, duration_min)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, performedOn, startedAt, durationMin],
  );
  return rows[0].id;
}

async function createSet(workoutId, exerciseId, overrides = {}) {
  const { position = 1, reps = 10, weightKg = 60, isWarmup = false } = overrides;

  const { rows } = await query(
    `INSERT INTO workout_sets (workout_id, exercise_id, position, reps, weight_kg, is_warmup)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [workoutId, exerciseId, position, reps, weightKg, isWarmup],
  );
  return rows[0].id;
}

async function createAction(userId, overrides = {}) {
  const {
    module = 'gym',
    type = 'workout_completed',
    xp = 20,
    referenceId = null,
    occurredOn = '2026-10-19',
  } = overrides;

  await query(
    `INSERT INTO actions (user_id, module, type, xp_awarded, reference_id, occurred_on)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, module, type, xp, referenceId, occurredOn],
  );
}

async function count(table, where, params) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM ${table} WHERE ${where}`,
    params,
  );
  return rows[0].total;
}

// ---------- constraints ----------

describe('users', () => {
  it('stores a valid row with defaults (role user, created_at filled)', async () => {
    const id = await createUser();
    const { rows } = await query('SELECT role, created_at FROM users WHERE id = $1', [id]);

    assert.equal(rows[0].role, 'user');
    assert.ok(rows[0].created_at instanceof Date);
  });

  it('rejects a duplicate email, ignoring upper and lower case', async () => {
    await createUser({ email: 'Ana@Example.com' });

    await assert.rejects(createUser({ email: 'ana@example.com' }), { code: UNIQUE_VIOLATION });
  });

  it('rejects an invalid role', async () => {
    await assert.rejects(createUser({ role: 'admin' }), { code: CHECK_VIOLATION });
  });

  it('accepts the demo role', async () => {
    const id = await createUser({ role: 'demo' });
    assert.ok(id > 0);
  });
});

describe('modules and stats', () => {
  it('registers the gym module in the migration', async () => {
    const { rows } = await query('SELECT code FROM modules');
    assert.deepEqual(rows, [{ code: 'gym' }]);
  });

  it('rejects stats for a module that is not registered (typo)', async () => {
    const userId = await createUser();

    await assert.rejects(activateModule(userId, 'gimm'), { code: FOREIGN_KEY_VIOLATION });
  });

  it('rejects a second stats row for the same user and module', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(activateModule(userId), { code: UNIQUE_VIOLATION });
  });

  it('rejects negative total_xp', async () => {
    const userId = await createUser();

    await assert.rejects(
      query('INSERT INTO stats (user_id, module, total_xp) VALUES ($1, $2, $3)', [
        userId,
        'gym',
        -1,
      ]),
      { code: CHECK_VIOLATION },
    );
  });

  it('does not allow deleting a module while stats use it', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(query("DELETE FROM modules WHERE code = 'gym'"), {
      code: FOREIGN_KEY_VIOLATION,
    });
  });

  it('rejects a duplicate module code', async () => {
    await assert.rejects(query("INSERT INTO modules (code) VALUES ('gym')"), {
      code: UNIQUE_VIOLATION,
    });
  });

  it('adds a new module with only a modules row plus its own rows (no core table change)', async () => {
    const userId = await createUser();
    await query("INSERT INTO modules (code) VALUES ('books')");
    await activateModule(userId, 'books');
    await createAction(userId, { module: 'books', type: 'book_finished', xp: 30 });

    assert.equal(await count('actions', "user_id = $1 AND module = 'books'", [userId]), 1);
  });
});

describe('actions', () => {
  it('rejects an action for a module the user has not activated (composite foreign key)', async () => {
    const userId = await createUser();

    await assert.rejects(createAction(userId), { code: FOREIGN_KEY_VIOLATION });
  });

  it('rejects negative xp_awarded', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(createAction(userId, { xp: -5 }), { code: CHECK_VIOLATION });
  });

  it('rejects an impossible calendar day (2026-02-30)', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(createAction(userId, { occurredOn: '2026-02-30' }), {
      code: DATE_OUT_OF_RANGE,
    });
  });

  it('rejects text that is not a date', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(createAction(userId, { occurredOn: 'yesterday-ish' }), {
      code: INVALID_DATE_FORMAT,
    });
  });

  it('rejects text in an integer column (typing is strict)', async () => {
    const userId = await createUser();
    await activateModule(userId);

    await assert.rejects(createAction(userId, { xp: 'lots' }), { code: INVALID_TEXT });
  });
});

describe('gym_profiles', () => {
  it('accepts hypertrophy and strength', async () => {
    const first = await createUser();
    const second = await createUser();

    await query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'hypertrophy')", [
      first,
    ]);
    await query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'strength')", [
      second,
    ]);

    assert.equal(await count('gym_profiles', 'user_id IN ($1, $2)', [first, second]), 2);
  });

  it('rejects a second profile for the same user', async () => {
    const userId = await createUser();
    await query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'strength')", [
      userId,
    ]);

    await assert.rejects(
      query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'hypertrophy')", [
        userId,
      ]),
      { code: UNIQUE_VIOLATION },
    );
  });

  it('rejects a typo in the focus', async () => {
    const userId = await createUser();

    await assert.rejects(
      query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'strenght')", [userId]),
      { code: CHECK_VIOLATION },
    );
  });

  it('rejects a profile for a user that does not exist', async () => {
    await assert.rejects(
      query("INSERT INTO gym_profiles (user_id, training_focus) VALUES (999999, 'strength')"),
      { code: FOREIGN_KEY_VIOLATION },
    );
  });

  it('lets the focus change with UPDATE', async () => {
    const userId = await createUser();
    await query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'strength')", [
      userId,
    ]);
    await query("UPDATE gym_profiles SET training_focus = 'hypertrophy' WHERE user_id = $1", [
      userId,
    ]);

    const { rows } = await query('SELECT training_focus FROM gym_profiles WHERE user_id = $1', [
      userId,
    ]);
    assert.equal(rows[0].training_focus, 'hypertrophy');
  });
});

describe('exercises', () => {
  it('rejects a duplicate name, ignoring upper and lower case', async () => {
    await createExercise('Bench Press');

    await assert.rejects(createExercise('bench press'), { code: UNIQUE_VIOLATION });
  });
});

describe('workouts', () => {
  it('rejects a workout for a user that does not exist', async () => {
    await assert.rejects(createWorkout(999999), { code: FOREIGN_KEY_VIOLATION });
  });

  it('rejects a workout without started_at', async () => {
    const userId = await createUser();

    await assert.rejects(
      query('INSERT INTO workouts (user_id, performed_on, duration_min) VALUES ($1, $2, $3)', [
        userId,
        '2026-10-19',
        60,
      ]),
      { code: NOT_NULL_VIOLATION },
    );
  });

  it('rejects an impossible started_at and text that is not a timestamp', async () => {
    const userId = await createUser();

    await assert.rejects(createWorkout(userId, { startedAt: '2026-02-30T10:00:00Z' }), {
      code: DATE_OUT_OF_RANGE,
    });
    await assert.rejects(createWorkout(userId, { startedAt: 'noon' }), {
      code: INVALID_DATE_FORMAT,
    });
  });

  it('stores started_at as an exact instant (UTC)', async () => {
    const userId = await createUser();
    const id = await createWorkout(userId, { startedAt: '2026-10-19T23:30:00Z' });

    const { rows } = await query('SELECT started_at FROM workouts WHERE id = $1', [id]);
    assert.equal(rows[0].started_at.toISOString(), '2026-10-19T23:30:00.000Z');
  });

  it('rejects a duration outside 1 to 600 minutes', async () => {
    const userId = await createUser();

    await assert.rejects(createWorkout(userId, { durationMin: 0 }), { code: CHECK_VIOLATION });
    await assert.rejects(createWorkout(userId, { durationMin: 601 }), { code: CHECK_VIOLATION });
  });

  it('allows several workouts on the same day', async () => {
    const userId = await createUser();
    await createWorkout(userId);
    await createWorkout(userId);

    assert.equal(await count('workouts', 'user_id = $1', [userId]), 2);
  });
});

describe('workout_sets', () => {
  it('stores a warm-up set and defaults is_warmup to false', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();

    const warmupId = await createSet(workoutId, exerciseId, { position: 1, isWarmup: true });
    const workingId = await createSet(workoutId, exerciseId, { position: 2 });

    const { rows } = await query('SELECT id, is_warmup FROM workout_sets ORDER BY id');
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.is_warmup]));

    assert.equal(byId[warmupId], true);
    assert.equal(byId[workingId], false);
  });

  it('rejects text that is not a boolean in is_warmup', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();

    await assert.rejects(createSet(workoutId, exerciseId, { isWarmup: 'maybe' }), {
      code: INVALID_TEXT,
    });
    await assert.rejects(createSet(workoutId, exerciseId, { isWarmup: 2 }), { code: INVALID_TEXT });
  });

  it('rejects a duplicate (workout_id, position)', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();
    await createSet(workoutId, exerciseId, { position: 1 });

    await assert.rejects(createSet(workoutId, exerciseId, { position: 1 }), {
      code: UNIQUE_VIOLATION,
    });
  });

  it('rejects reps = 0, a negative weight and position = 0', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();

    await assert.rejects(createSet(workoutId, exerciseId, { reps: 0 }), { code: CHECK_VIOLATION });
    await assert.rejects(createSet(workoutId, exerciseId, { weightKg: -1 }), {
      code: CHECK_VIOLATION,
    });
    await assert.rejects(createSet(workoutId, exerciseId, { position: 0 }), {
      code: CHECK_VIOLATION,
    });
  });

  it('accepts weight 0 (bodyweight exercises)', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();

    const id = await createSet(workoutId, exerciseId, { weightKg: 0 });
    assert.ok(id > 0);
  });

  it('returns weights as JavaScript numbers and matches the exact same weight', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();
    await createSet(workoutId, exerciseId, { position: 1, weightKg: 62.5 });
    await createSet(workoutId, exerciseId, { position: 2, weightKg: 72.3 });

    const { rows } = await query(
      'SELECT weight_kg FROM workout_sets WHERE workout_id = $1 ORDER BY position',
      [workoutId],
    );
    assert.deepEqual(
      rows.map((row) => row.weight_kg),
      [62.5, 72.3],
    );

    const sameWeight = await query(
      'SELECT COUNT(*)::int AS total FROM workout_sets WHERE workout_id = $1 AND weight_kg = $2',
      [workoutId, 72.3],
    );
    assert.equal(sameWeight.rows[0].total, 1);
  });

  it('does not allow deleting an exercise that is in use', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();
    await createSet(workoutId, exerciseId);

    await assert.rejects(query('DELETE FROM exercises WHERE id = $1', [exerciseId]), {
      code: FOREIGN_KEY_VIOLATION,
    });
  });
});

// ---------- delete rules and ids ----------

describe('delete rules', () => {
  it('deleting a workout deletes its sets', async () => {
    const userId = await createUser();
    const workoutId = await createWorkout(userId);
    const exerciseId = await createExercise();
    await createSet(workoutId, exerciseId);

    await query('DELETE FROM workouts WHERE id = $1', [workoutId]);

    assert.equal(await count('workout_sets', 'workout_id = $1', [workoutId]), 0);
  });

  it('never reuses the id of a deleted workout', async () => {
    const userId = await createUser();
    const first = await createWorkout(userId);
    await query('DELETE FROM workouts WHERE id = $1', [first]);
    const second = await createWorkout(userId);

    assert.ok(second > first);
  });

  it('deleting a user deletes stats, actions, workouts, sets and the gym profile', async () => {
    const userId = await createUser();
    await activateModule(userId);
    await createAction(userId);
    await query("INSERT INTO gym_profiles (user_id, training_focus) VALUES ($1, 'strength')", [
      userId,
    ]);
    const workoutId = await createWorkout(userId);
    await createSet(workoutId, await createExercise());

    await query('DELETE FROM users WHERE id = $1', [userId]);

    assert.equal(await count('stats', 'user_id = $1', [userId]), 0);
    assert.equal(await count('actions', 'user_id = $1', [userId]), 0);
    assert.equal(await count('gym_profiles', 'user_id = $1', [userId]), 0);
    assert.equal(await count('workouts', 'user_id = $1', [userId]), 0);
    assert.equal(await count('workout_sets', 'workout_id = $1', [workoutId]), 0);
  });
});

// ---------- the example queries of Appendix A in the database design ----------

const MONDAY_OF_WEEK = "SELECT date_trunc('week', $1::timestamp)::date AS monday";

const XP_ON_DAY = `
  SELECT COALESCE(SUM(xp_awarded), 0)::int AS xp FROM actions
  WHERE user_id = $1 AND module = 'gym' AND occurred_on = $2`;

const SESSIONS_ON_DAY = `
  SELECT COUNT(*)::int AS sessions FROM actions
  WHERE user_id = $1 AND module = 'gym' AND type = 'workout_completed' AND occurred_on = $2`;

const WEEK_SESSIONS_AND_DAYS = `
  SELECT COUNT(*)::int AS sessions,
         COALESCE(array_agg(DISTINCT occurred_on::text ORDER BY occurred_on::text), '{}') AS training_days
  FROM actions
  WHERE user_id = $1 AND module = 'gym' AND type = 'workout_completed'
    AND occurred_on BETWEEN $2 AND $3`;

const PREVIOUS_MAX_WEIGHT = `
  SELECT MAX(ws.weight_kg) AS max_weight
  FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
  WHERE w.user_id = $1 AND ws.exercise_id = $2 AND NOT ws.is_warmup AND w.id <> $3`;

const PREVIOUS_BEST_REPS_AT_WEIGHT = `
  SELECT MAX(ws.reps) AS best_reps
  FROM workout_sets ws JOIN workouts w ON w.id = ws.workout_id
  WHERE w.user_id = $1 AND ws.exercise_id = $2 AND NOT ws.is_warmup AND w.id <> $3
    AND ws.weight_kg = $4`;

const INTEGRITY_CHECK = `
  SELECT s.user_id, s.module, s.total_xp, COALESCE(SUM(a.xp_awarded), 0)::int AS logged_xp
  FROM stats s
  LEFT JOIN actions a ON a.user_id = s.user_id AND a.module = s.module
  GROUP BY s.user_id, s.module, s.total_xp
  HAVING s.total_xp <> COALESCE(SUM(a.xp_awarded), 0)`;

describe('Appendix A queries', () => {
  it('A.1 finds the Monday of the week (Monday to Sunday)', async () => {
    const cases = [
      ['2026-10-12', '2026-10-12'],
      ['2026-10-18', '2026-10-12'],
      ['2026-10-19', '2026-10-19'],
    ];

    for (const [day, monday] of cases) {
      const { rows } = await query(MONDAY_OF_WEEK, [day]);
      assert.equal(rows[0].monday, monday);
    }
  });

  it('A.2 and A.3 add up the XP and the sessions of one day', async () => {
    const userId = await createUser();
    await activateModule(userId);
    await createAction(userId, { type: 'workout_completed', xp: 20, occurredOn: '2026-10-19' });
    await createAction(userId, { type: 'personal_record', xp: 6, occurredOn: '2026-10-19' });
    await createAction(userId, { type: 'workout_completed', xp: 50, occurredOn: '2026-10-20' });

    assert.equal((await query(XP_ON_DAY, [userId, '2026-10-19'])).rows[0].xp, 26);
    assert.equal((await query(SESSIONS_ON_DAY, [userId, '2026-10-19'])).rows[0].sessions, 1);
    assert.equal((await query(XP_ON_DAY, [userId, '2026-01-01'])).rows[0].xp, 0);
  });

  it('A.4 returns the sessions and the LIST of different training days of a week', async () => {
    const userId = await createUser();
    await activateModule(userId);
    for (const day of ['2026-10-12', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19']) {
      await createAction(userId, { occurredOn: day });
    }

    const { rows } = await query(WEEK_SESSIONS_AND_DAYS, [userId, '2026-10-12', '2026-10-18']);

    assert.equal(rows[0].sessions, 4);
    assert.deepEqual(rows[0].training_days, ['2026-10-12', '2026-10-14', '2026-10-16']);

    const empty = await query(WEEK_SESSIONS_AND_DAYS, [userId, '2026-11-02', '2026-11-08']);
    assert.equal(empty.rows[0].sessions, 0);
    assert.deepEqual(empty.rows[0].training_days, []);
  });

  it('A.5 finds the previous maximum weight and best reps, ignoring warm-up sets', async () => {
    const userId = await createUser();
    const exerciseId = await createExercise();
    const history = await createWorkout(userId, { performedOn: '2026-10-12' });
    const today = await createWorkout(userId, { performedOn: '2026-10-19' });

    await createSet(history, exerciseId, { position: 1, reps: 10, weightKg: 60 });
    await createSet(history, exerciseId, { position: 2, reps: 8, weightKg: 65 });
    await createSet(history, exerciseId, { position: 3, reps: 6, weightKg: 70 });
    await createSet(history, exerciseId, { position: 4, reps: 1, weightKg: 100, isWarmup: true });
    await createSet(today, exerciseId, { position: 1, reps: 7, weightKg: 70 });

    const max = await query(PREVIOUS_MAX_WEIGHT, [userId, exerciseId, today]);
    assert.equal(max.rows[0].max_weight, 70);

    const reps = await query(PREVIOUS_BEST_REPS_AT_WEIGHT, [userId, exerciseId, today, 70]);
    assert.equal(reps.rows[0].best_reps, 6);

    const firstTimeAtWeight = await query(PREVIOUS_BEST_REPS_AT_WEIGHT, [
      userId,
      exerciseId,
      today,
      62.5,
    ]);
    assert.equal(firstTimeAtWeight.rows[0].best_reps, null);
  });

  it('A.6 finds nothing when stats and actions agree, and finds exactly the drifted row', async () => {
    const consistent = await createUser();
    await activateModule(consistent);
    await createAction(consistent, { xp: 20 });
    await query("UPDATE stats SET total_xp = 20 WHERE user_id = $1 AND module = 'gym'", [
      consistent,
    ]);

    const drifted = await createUser();
    await activateModule(drifted);
    await createAction(drifted, { xp: 20 });
    await query("UPDATE stats SET total_xp = 25 WHERE user_id = $1 AND module = 'gym'", [drifted]);

    const { rows } = await query(INTEGRITY_CHECK);
    const ids = rows.map((row) => row.user_id);

    assert.ok(ids.includes(drifted));
    assert.ok(!ids.includes(consistent));
    assert.deepEqual(
      rows.find((row) => row.user_id === drifted),
      {
        user_id: drifted,
        module: 'gym',
        total_xp: 25,
        logged_xp: 20,
      },
    );
  });
});

// ---------- indexes ----------

describe('indexes', () => {
  // With tiny tables PostgreSQL prefers reading everything, so each check switches that
  // option off inside a transaction (SET LOCAL) to prove the index CAN serve the query.
  async function explain(sql, params) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      const { rows } = await client.query(`EXPLAIN ${sql}`, params);
      return rows.map((row) => row['QUERY PLAN']).join('\n');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('the daily XP query can use idx_actions_user_module_day', async () => {
    const plan = await explain(XP_ON_DAY, [1, '2026-10-19']);
    assert.match(plan, /idx_actions_user_module_day/);
  });

  it('the workout history query can use idx_workouts_user_day', async () => {
    const plan = await explain('SELECT * FROM workouts WHERE user_id = $1 AND performed_on = $2', [
      1,
      '2026-10-19',
    ]);
    assert.match(plan, /idx_workouts_user_day/);
  });

  it('the record lookup can use idx_workout_sets_exercise', async () => {
    const plan = await explain('SELECT * FROM workout_sets WHERE exercise_id = $1', [1]);
    assert.match(plan, /idx_workout_sets_exercise/);
  });
});
