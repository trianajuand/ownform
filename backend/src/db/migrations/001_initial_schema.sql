-- Ownform: 001_initial_schema.sql
--
-- Core tables (shared by every module): users, modules, stats, actions
-- Gym module tables:                    gym_profiles, exercises, workouts, workout_sets
--
-- Requirements:
--   * SQLite >= 3.37.0 (STRICT tables).
--   * Every connection must run "PRAGMA foreign_keys = ON;" before using the
--     database. It is a per-connection setting and cannot be changed inside a
--     transaction, so it does NOT belong in this file.
--
-- Conventions:
--   * Dates are TEXT in ISO 8601: 'YYYY-MM-DD' for calendar days,
--     'YYYY-MM-DDTHH:MM:SSZ' (UTC) for timestamps.
--   * CHECK constraints are a loose safety net. The API validates (zod) with
--     stricter, tunable limits.

-- ============================================================
-- CORE
-- ============================================================

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(email) BETWEEN 3 AND 254),
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'demo')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

-- Registry of the life modules. Its job is referential integrity: stats.module
-- must be a registered module, so a typo can never create a phantom module.
-- A new module is registered by the same migration that creates its tables.
CREATE TABLE modules (
  code TEXT NOT NULL PRIMARY KEY CHECK (length(code) BETWEEN 1 AND 50)
) STRICT;

INSERT INTO modules (code) VALUES ('gym');

-- One row per (user, module). The row existing means "this module is active
-- for this user". The level is NOT stored: the XP engine derives it from total_xp.
CREATE TABLE stats (
  user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module   TEXT    NOT NULL REFERENCES modules (code) ON DELETE RESTRICT,
  total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  PRIMARY KEY (user_id, module)
) STRICT;

-- Append-only log of every XP award. Source of truth for XP.
-- reference_id points to a row in a module table chosen by (module, type);
-- it has no foreign key on purpose (see decision D4).
CREATE TABLE actions (
  id           INTEGER PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  module       TEXT    NOT NULL,
  type         TEXT    NOT NULL CHECK (length(type) > 0),
  xp_awarded   INTEGER NOT NULL CHECK (xp_awarded >= 0),
  reference_id INTEGER,
  occurred_on  TEXT    NOT NULL CHECK (date(occurred_on) IS occurred_on),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (user_id, module) REFERENCES stats (user_id, module) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_actions_user_module_day ON actions (user_id, module, occurred_on);

-- ============================================================
-- GYM MODULE
-- ============================================================

-- One row per user: the training focus chosen at the start (it can be changed later).
-- It decides which reps make a set valid for XP (rules live in the XP config, keyed by
-- these same two names). A third focus would need a table rebuild (decision D15).
CREATE TABLE gym_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  training_focus TEXT    NOT NULL CHECK (training_focus IN ('strength', 'hypertrophy'))
) STRICT;

-- Global catalog loaded by a seed script. No user-owned exercises in the MVP.
CREATE TABLE exercises (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 100),
  muscle_group TEXT NOT NULL CHECK (length(muscle_group) > 0)
) STRICT;

-- AUTOINCREMENT: ids are never reused, so a stale actions.reference_id can
-- never silently point to an unrelated new row.
-- performed_on is the user's local calendar day (streaks, weeks and the daily cap use it).
-- started_at is a UTC timestamp: the 4-hour logging window is measured from it. One cannot
-- be derived from the other because the time zone is not stored (decision D13).
CREATE TABLE workouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  performed_on TEXT    NOT NULL CHECK (date(performed_on) IS performed_on),
  started_at   TEXT    NOT NULL CHECK (strftime('%Y-%m-%dT%H:%M:%SZ', started_at) IS started_at),
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
  notes        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX idx_workouts_user_day ON workouts (user_id, performed_on);

-- Junction table between workouts and exercises (N:M) that carries its own data.
-- Bodyweight exercises store weight_kg = 0.
-- is_warmup = 1 marks a warm-up set (strength focus only). Warm-up sets earn no XP and are
-- ignored by personal-record detection (decision D14).
CREATE TABLE workout_sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id  INTEGER NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  position    INTEGER NOT NULL CHECK (position >= 1),
  reps        INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 500),
  weight_kg   REAL    NOT NULL CHECK (weight_kg >= 0 AND weight_kg <= 1000),
  is_warmup   INTEGER NOT NULL DEFAULT 0 CHECK (is_warmup IN (0, 1)),
  UNIQUE (workout_id, position)
) STRICT;

CREATE INDEX idx_workout_sets_exercise ON workout_sets (exercise_id);
