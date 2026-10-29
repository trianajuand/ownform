-- Ownform: 001_initial_schema.sql (PostgreSQL)
--
-- Core tables (shared by every module): users, modules, stats, actions
-- Gym module tables:                    gym_profiles, exercises, workouts, workout_sets
--
-- Requirements:
--   * PostgreSQL 14 or later (the project runs 17 in Docker).
--   * The migration runner (src/db/migrate.js) wraps this file in a transaction,
--     so there is no BEGIN or COMMIT here.
--   * PostgreSQL always enforces foreign keys. There is nothing to enable.
--
-- Conventions:
--   * Calendar days are DATE ('YYYY-MM-DD'). Timestamps are TIMESTAMPTZ (stored in UTC).
--   * Weights are DOUBLE PRECISION so the driver returns a JavaScript number and
--     "exactly the same weight" comparisons keep working (NUMERIC would come back as text).
--   * CHECK constraints are a loose safety net. The API validates (zod) with
--     stricter, tunable limits.
--   * Case-insensitive uniqueness uses a unique index on lower(column), so no
--     extension is needed. Queries must compare lower(column) = lower($1).

-- ============================================================
-- CORE
-- ============================================================

CREATE TABLE users (
  id            INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email         TEXT        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'demo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

-- Registry of the life modules. Its job is referential integrity: stats.module
-- must be a registered module, so a typo can never create a phantom module.
-- A new module is registered by the same migration that creates its tables.
CREATE TABLE modules (
  code TEXT PRIMARY KEY CHECK (char_length(code) BETWEEN 1 AND 50)
);

INSERT INTO modules (code) VALUES ('gym');

-- One row per (user, module). The row existing means "this module is active
-- for this user". The level is NOT stored: the XP engine derives it from total_xp.
CREATE TABLE stats (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module   TEXT    NOT NULL REFERENCES modules (code) ON DELETE RESTRICT,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  PRIMARY KEY (user_id, module)
);

-- Append-only log of every XP award. Source of truth for XP.
-- reference_id points to a row in a module table chosen by (module, type);
-- it has no foreign key on purpose (see decision D4).
CREATE TABLE actions (
  id           INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      INTEGER     NOT NULL,
  module       TEXT        NOT NULL,
  type         TEXT        NOT NULL CHECK (char_length(type) > 0),
  xp_awarded   INTEGER     NOT NULL CHECK (xp_awarded >= 0),
  reference_id INTEGER,
  occurred_on  DATE        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, module) REFERENCES stats (user_id, module) ON DELETE CASCADE
);

CREATE INDEX idx_actions_user_module_day ON actions (user_id, module, occurred_on);

-- ============================================================
-- GYM MODULE
-- ============================================================

-- One row per user: the training focus chosen at the start (it can be changed later).
-- It decides which reps make a set valid for XP (rules live in the XP config, keyed by
-- these same two names). A third focus needs one ALTER TABLE on this constraint (decision D15).
CREATE TABLE gym_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  training_focus TEXT    NOT NULL CHECK (training_focus IN ('strength', 'hypertrophy'))
);

-- Global catalog loaded by a seed script. No user-owned exercises in the MVP.
CREATE TABLE exercises (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT    NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  muscle_group TEXT    NOT NULL CHECK (char_length(muscle_group) > 0)
);

CREATE UNIQUE INDEX uq_exercises_name_lower ON exercises (lower(name));

-- Identity values are never reused (a sequence only moves forward), so a stale
-- actions.reference_id can never silently point to an unrelated new row (decision D4).
-- performed_on is the user's local calendar day (streaks, weeks and the daily cap use it).
-- started_at is a UTC instant: the 4-hour logging window is measured from it. One cannot
-- be derived from the other because the time zone is not stored (decision D13).
CREATE TABLE workouts (
  id           INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  performed_on DATE        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL,
  duration_min INTEGER     NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workouts_user_day ON workouts (user_id, performed_on);

-- Junction table between workouts and exercises (N:M) that carries its own data.
-- Bodyweight exercises store weight_kg = 0.
-- is_warmup = true marks a warm-up set (strength focus only). Warm-up sets earn no XP and are
-- ignored by personal-record detection (decision D14).
CREATE TABLE workout_sets (
  id          INTEGER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workout_id  INTEGER          NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_id INTEGER          NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  position    INTEGER          NOT NULL CHECK (position >= 1),
  reps        INTEGER          NOT NULL CHECK (reps BETWEEN 1 AND 500),
  weight_kg   DOUBLE PRECISION NOT NULL CHECK (weight_kg >= 0 AND weight_kg <= 1000),
  is_warmup   BOOLEAN          NOT NULL DEFAULT false,
  UNIQUE (workout_id, position)
);

CREATE INDEX idx_workout_sets_exercise ON workout_sets (exercise_id);
