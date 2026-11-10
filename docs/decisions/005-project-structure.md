# 005. Project structure and module conventions

## Context

Decision 001 chose a modular monolith with the layers routes, controllers, services and repositories, but it only states principles. Before writing the first module, the project needs concrete rules for folders, file names and which file may use which, so that every module is built the same way and the architecture is still respected when the code grows.

The rules also have to fit what already exists: the XP engine is pure logic in `core/xp-engine`, the database code is in `db/`, and the services must not depend on Express (decision 001).

## Decision

Organize the backend by **module first, then by layer**. Every file has one place and one role.

### Folders

```text
backend/src/
├── app.js            builds the Express app and wires the modules (composition root)
├── server.js         starts the HTTP server
├── config/           configuration (XP rules, later environment settings)
├── core/             pure logic: no Express, no database, no modules
│   ├── errors.js     AppError, the error our own code throws on purpose
│   └── xp-engine/    levels.js, rules.js
├── db/               connection, migration runner, transaction helper, migrations/
├── middlewares/      shared HTTP middlewares (not-found, error-handler, validate, later authenticate)
└── modules/
    ├── health/       the reference module (the pattern every module follows)
    ├── auth/         register and login
    ├── character/    the stats table: activates a module for a user (no routes yet)
    └── gym/          the gym profile (no routes yet)

backend/tests/        mirrors src/: app/, core/, db/, middlewares/, modules/<name>/, helpers/
```

### Files of a module

| File | Layer | Job | Must not |
|---|---|---|---|
| `<name>.routes.js` | Routes | Connects an HTTP method and a relative path to a controller function. Applies middlewares (validation, authentication). | Contain logic or call services |
| `<name>.controller.js` | Controller | Reads `req`, calls the service, writes `res`. | Run SQL or contain business rules |
| `<name>.service.js` | Service | Implements the use case and owns transactions. Uses `core/` for XP and levels. | Use `req`, `res` or Express |
| `<name>.repository.js` | Repository | Holds all the SQL of the module. | Contain business rules |
| `<name>.schema.js` | Validation | Zod schemas for the module's input (when the module has input). | |
| `index.js` | Module entry | Creates the layers, wires them, and exposes what other files may use: the router (modules with routes) and the service that other modules may call. | |

A module that no endpoint calls yet (`character`, `gym`) has no routes, no controller and no schema. It has a repository, a service and an `index.js` that exposes `{ service }`. The design only builds what exists.

### Who may use whom

| Location | May use | Must not use |
|---|---|---|
| `core/` | Other files of `core/` | Express, `pg`, `db/`, `modules/`, `middlewares/` |
| `db/` | `pg` and Node | `modules/`, Express |
| Routes | Express `Router`, the controller they receive | Services, repositories, SQL |
| Controller | The service it receives | Repositories, the pool, SQL |
| Service | The repository it receives, `core/`, the services of other modules that it receives (they come from the other module's `index.js`) | Express, SQL, `pg`, the pool |
| Repository | The pool or transaction client it receives | Express, services |
| `middlewares/` | Express, `core/` | Internals of a module |
| `app.js` | `modules/*/index.js`, `middlewares/`, Express | Internal files of a module |
| A module | Another module only through its `index.js` | Another module's files or tables |

Each layer calls only the layer directly below it: routes, then controller, then service, then repository.

### Conventions

1. **File names** are lowercase with dashes, and the layer goes before the extension: `auth.service.js`, `error-handler.js`.
2. **Factory functions, not classes.** Each piece is created with a function that receives its dependencies in an object and returns an object with its methods: `createAuthService({ authRepository })`. Dependencies are passed in (dependency injection), so tests can replace any of them with a fake. Named exports, as in decision 003.
3. **Wiring happens in the module's `index.js`**, and `app.js` mounts the module router under its path (`app.use('/api/health', health.router)`). Routes inside a module use relative paths.
4. **Errors:** services and repositories throw, and never build HTTP responses. The central error handler (`middlewares/error-handler.js`) is the only place that turns an error into a response. Every error response has the same shape: `{ "error": { "code": "...", "message": "..." } }` (with `details` for validation errors), and an unexpected error never shows its internal detail to the client.
5. **Express 5 forwards the errors of async handlers** to the error handler, so handlers do not need `try/catch` just to call `next(error)`.
6. **Tests mirror the source tree:** `src/modules/auth/auth.service.js` is tested in `tests/modules/auth/auth.service.test.js`.
7. **Dependencies between modules are injected from `app.js`.** `app.js` creates every module and gives each one the services it needs from the others: `createAuthModule({ pool, characterService: character.service, gymService: gym.service })`. A module never imports another module's files.
8. **The `db` argument.** Every repository method takes its data first and an optional last argument `db`, which defaults to the pool: `createStat({ userId, module }, db = pool)`. The services that other modules call also accept an optional `db` and pass it unchanged to the repository. See the next section.

### Transactions and the `db` argument

A use case that must save rows in several tables, possibly of several modules, saves all of them or none. The rules:

1. **The service that runs the use case opens the transaction.** It receives a function `runInTransaction` as an injected dependency. The module's `index.js` builds it from the helper in `db/transaction.js`: `(callback) => withTransaction(pool, callback)`. So services never import `pg` or the pool.
2. **`runInTransaction` gives the callback a client.** `withTransaction` opens the transaction, runs the callback, and commits. If the callback throws, it rolls back and throws the same error again.
3. **Every call inside the callback receives that client** as its `db` argument, including the calls to the services of other modules. Registration is the first case:
   1. `authRepository.createUser(data, client)`
   2. `characterService.activateModule({ userId, module: 'gym' }, client)`
   3. `gymService.createProfile({ userId, trainingFocus }, client)`
4. **Translate errors outside the transaction.** The `try/catch` that turns a database error into an `AppError` (for example a repeated email into `EMAIL_TAKEN`) goes around `runInTransaction`, so the rollback has already happened.
5. **Slow work goes before the transaction.** Hashing the password (about 270 ms) is done before `runInTransaction`, so the database connection is not held while it runs.
6. **The use case belongs to the module that starts it.** `auth` does not write into `stats` or `gym_profiles`. It asks `character` and `gym` through their services, and each of them writes only its own tables.
7. **The mistake to watch for.** A call inside the callback that does not receive the client uses the pool, so the rollback does not undo it. This was checked with a real database: the row stays saved after the rollback.

### Adding a module

1. Create `src/modules/<name>/` with the files it needs from the table above and an `index.js` that wires them.
2. If the module owns tables, add a numbered migration that creates them and registers the module in `modules` (decision 002, section 9.1).
3. In `app.js`, create the module, mount its router if it has one, and inject its service into the modules that use it.
4. Add its tests under `tests/modules/<name>/`.

### Decided later

- **Authentication.** How the `authenticate` middleware receives the function that verifies the token, and how the authenticated user reaches the services, will be recorded when the token is built.

## Alternatives considered

### 1. Module first, then layer: selected

**Advantages**
- Everything about a feature is in one folder, which matches decision 001 (each module owns its routes, services and repositories).
- A new module does not touch the others.
- A module can be read, tested and, if ever needed, extracted on its own.

**Disadvantages and trade-offs**
- More files for small features: the health check needs five files for a single query.
- The boundaries between modules depend on discipline, because nothing in Node stops one file from importing another module's internals.

### 2. Layer first (`controllers/`, `services/`, `repositories/` at the top): rejected

**Advantages**
- Familiar from many tutorials and fewer folders at the start.

**Disadvantages and trade-offs**
- Every feature is spread over three or four folders, and the modules of decision 001 would not be visible in the tree.
- Dependencies between features are easy to create by accident.

### 3. Classes with a dependency injection library: rejected

**Advantages**
- Automatic wiring.

**Disadvantages and trade-offs**
- An extra library and concepts to learn before the project needs them.
- With classes, passing a method as a callback loses `this` unless it is bound, which causes subtle errors.

### 4. Sharing the transaction by passing the client as an argument: selected

**Advantages**
- It is visible in the code: every call that belongs to the transaction receives the client.
- No extra library or hidden state. A fake `runInTransaction` and a fake `db` are enough for tests.
- The modules keep their boundaries: each one writes only its own tables.

**Disadvantages and trade-offs**
- Every method of the services and repositories that take part in a transaction has the extra `db` argument.
- Forgetting to pass the client is not detected automatically (see Consequences).

### 5. Sharing the transaction without arguments (a per-request context in Node): rejected

**Advantages**
- Methods would not need the `db` argument.

**Disadvantages and trade-offs**
- The dependency is hidden: reading a method does not show that it runs inside a transaction.
- It is a mechanism to learn and test before the project needs it.

### 6. One repository inserts into every table of the registration: rejected

**Advantages**
- One query path, so no client has to be passed between modules.

**Disadvantages and trade-offs**
- It breaks the rule that a module writes only its own tables, and `auth` would depend on the tables of `character` and `gym`.

## Consequences

**Positive**
- Every module looks the same, so reading or writing one teaches how to read or write all of them.
- Business logic can be tested without HTTP, and HTTP can be tested with fake services or a fake pool.
- The rules in "Who may use whom" can later be checked automatically with ESLint rules.
- Registration is atomic: a user exists with its `stats` row and its gym profile, or it does not exist at all.

**Negative and risks**
- Boilerplate: the wiring in each `index.js` repeats a pattern.
- Without an automatic check, a rule can be broken by mistake. Code review and, later, lint rules are the protection.
- A call without the client inside a transaction fails silently: nothing reports it, and the row is simply not rolled back. Code review is the protection. A test that forces a failure in the last step and checks that no row was left behind would detect it, but the auth module has no permanent tests yet.

**Guidance**
- When a rule seems to get in the way, change the design or write a new decision record. Do not skip the rule.
- Keep `health` as the model: copy its shape for new modules.
- Every method that can run inside a transaction takes `db` as its last argument.

## Status

Accepted. Date: 2026-11-02. It refines [001 Modular monolith](001-architecture.md).

Amended on 2026-11-09: the `character` and `gym` modules and the registration transaction were built, so the two items that were "decided later" about transactions are now decided (sections "Transactions and the `db` argument" and convention 7). The schema file is named `<name>.schema.js`, as in the auth module.
