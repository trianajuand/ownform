# 004. PostgreSQL with Docker

## Context

Ownform's first design chose SQLite as the database and listed PostgreSQL as a later option. SQLite keeps everything in one file, needs no server, and is quick to start with. The repositories, the services and the tests had not been written yet, and the only database code was a small connection module for SQLite.

Three things made the choice worth revisiting before more code existed:

- **The two Node drivers work differently.** The SQLite driver (`better-sqlite3`) is synchronous: a call returns the result. The PostgreSQL driver (`pg`) is asynchronous: every query needs `await`. That difference spreads through repositories, services, controllers and tests, so the later the change, the more code has to be rewritten.
- **Development and production should use the same engine.** Running SQLite locally and PostgreSQL in production means some behavior (types, constraints, SQL syntax) is only tested in production.
- **Where the data lives.** A SQLite database is a file on the server's disk. Some hosting services erase the disk when the application restarts, so the data would need extra care. A hosted PostgreSQL is a separate service the API connects to.

The project owner also wants to learn Docker, and a database in a container is a small, real use case for it.

The data is relational: users own workouts, workouts contain sets, sets point to exercises, and a workout and its XP must be saved together or not at all. The database design (`002-database-design.md`) already relies on foreign keys and transactions.

## Decision

Use PostgreSQL as the database for Ownform, and run it in Docker for local development. The implementation follows these rules:

1. **Version.** PostgreSQL 17, through the official `postgres:17` image. The major version is pinned in `backend/docker-compose.yml`, so upgrading is a deliberate change. The schema needs PostgreSQL 14 or later.
2. **Local database.** `backend/docker-compose.yml` defines one service, `db`, with a named volume so the data survives restarts and a health check so tools can wait until the database is ready. Credentials come from `backend/.env`, which is not committed. `backend/.env.example` is committed with development-only values.
3. **Driver.** `pg` (node-postgres) with a connection pool, created in `backend/src/db/connection.js` from the `DATABASE_URL` environment variable. Code that touches the database is asynchronous (`async` and `await`), and SQL parameters are written `$1`, `$2`.
4. **Driver settings that matter.** `DATE` columns are returned as `'YYYY-MM-DD'` text, because the driver's default (a `Date` at local midnight) can shift the day. Queries cast `COUNT` and `SUM` to `::int`, because the driver returns `bigint` as text. Weights are `DOUBLE PRECISION`, because `NUMERIC` would also come back as text. The reasons are in D16 of the database design.
5. **Migrations.** Numbered SQL files in `backend/src/db/migrations/`, applied by `backend/src/db/migrate.js` (run with `npm run migrate`). Applied files are recorded in a `schema_migrations` table, and each file runs inside its own transaction. This answers the open question in decision D10 of the database design. Migration 001 was rewritten for PostgreSQL before any database existed, so it is still the first and only file.
6. **Tests use a real PostgreSQL.** There is no in-memory substitute. Each test file creates its own temporary schema, applies the migrations in it, and drops it at the end, so files can run at the same time and never touch development data. The tests need the Docker container to be running.
7. **Services own transactions.** A service takes a client from the pool, starts a transaction, calls the repositories with that client, and commits or rolls back. Repositories hold all the SQL (decision 001).

## Alternatives considered

### 1. PostgreSQL in Docker: selected

**Advantages**
- The same engine in development, tests and production.
- Foreign keys, strict typing and transactional schema changes are always on, with no per-connection setting to remember.
- The change is cheapest now, before the asynchronous code spreads.
- Docker gives every machine the same database version with one command, and the project owner learns a widely used tool.
- PostgreSQL is a common skill in backend work, which supports the portfolio goal.

**Disadvantages and trade-offs**
- Docker Desktop is a prerequisite, and it needs virtualization to be enabled on the computer.
- Tests need a running server. They are slightly slower than an in-memory database and cannot run without the container.
- The migration, the connection module and its tests had to be rewritten, and the documents that mention SQLite had to be updated.
- Asynchronous code is a little more verbose than the synchronous SQLite driver.
- A local container is one more thing that can be stopped or misconfigured.

### 2. SQLite for the MVP, PostgreSQL later: rejected

**Advantages**
- No server and no Docker: a single file.
- Very fast tests with an in-memory database.
- The simplest possible start.

**Disadvantages and trade-offs**
- The later move costs more, because every repository, service and test would change from synchronous to asynchronous code, and all the SQL would need review.
- Development and production would differ for the whole MVP.
- The deployment needs a persistent disk or a different database anyway.

### 3. PostgreSQL installed directly on Windows: rejected

**Advantages**
- No Docker to learn.

**Disadvantages and trade-offs**
- It installs a service on the computer, and each machine can end up with a different version.
- Removing or resetting it is manual work.
- It does not give the owner the Docker practice.

### 4. A hosted PostgreSQL from the first day: rejected for now

**Advantages**
- Nothing to run locally.

**Disadvantages and trade-offs**
- It needs an account and an internet connection for every test run, and the free options and their limits change over time.
- Local resets and parallel test schemas are harder to do safely against a shared remote database.
- It stays an option for deployment, and the connection is already configured through `DATABASE_URL`, so it would need no code change.

### 5. MongoDB: rejected

**Advantages**
- Flexible documents and no schema migrations.

**Disadvantages and trade-offs**
- The data is relational, and the database design depends on foreign keys, composite keys and cascade rules that MongoDB does not enforce.
- Saving a workout and its XP together is simpler and safer with SQL transactions.
- The tested relational design (`002-database-design.md`) would have to be thrown away.

## Consequences

**Positive**
- One engine from the first line of repository code to production.
- Constraints and foreign keys are enforced without setup.
- The schema tests run against the same kind of server that production uses.
- Migrations are transactional: a failing file changes nothing.

**Negative and risks**
- The tests fail with a clear message if the container is not running, so `npm run db:up` becomes part of the routine.
- `npm run db:reset` deletes all local data. It is meant for development only.
- The schema was tested on PostgreSQL 16 during the rewrite, and the container uses 17. The first test run against the container is the verification for 17.
- The development password is committed in `.env.example`. It is a placeholder for a local container and must never be reused in a deployed environment.
- Continuous integration (planned for Phase 4) will need a PostgreSQL service for the tests.

**Guidance**
- Keep all SQL in repositories, so a future change of engine or driver stays contained.
- Never edit an applied migration. Every schema change goes in a new numbered file.
- Revisit this decision only if a concrete need appears that PostgreSQL cannot meet.

## Status

Accepted. Date: 2026-10-28. It amends the database choice in [001 Modular monolith](001-architecture.md), and the schema changes are described in D16 of [002 Database design](002-database-design.md).
