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
│   └── xp-engine/    levels.js, rules.js
├── db/               connection, migration runner, migrations/
├── middlewares/      shared HTTP middlewares (not-found, error-handler, later authenticate, validate)
└── modules/
    ├── health/       the reference module (the pattern every module follows)
    ├── auth/         (planned)
    ├── character/    (planned)
    └── gym/          (planned)

backend/tests/        mirrors src/: app/, core/, db/, middlewares/, modules/<name>/, helpers/
```

### Files of a module

| File | Layer | Job | Must not |
|---|---|---|---|
| `<name>.routes.js` | Routes | Connects an HTTP method and a relative path to a controller function. Applies middlewares (validation, authentication). | Contain logic or call services |
| `<name>.controller.js` | Controller | Reads `req`, calls the service, writes `res`. | Run SQL or contain business rules |
| `<name>.service.js` | Service | Implements the use case and owns transactions. Uses `core/` for XP and levels. | Use `req`, `res` or Express |
| `<name>.repository.js` | Repository | Holds all the SQL of the module. | Contain business rules |
| `<name>.schemas.js` | Validation | Zod schemas for the module's input (when the module has input). | |
| `index.js` | Module entry | Creates the layers, wires them, and exposes the router (and, later, the functions other modules may call). | |

### Who may use whom

| Location | May use | Must not use |
|---|---|---|
| `core/` | Other files of `core/` | Express, `pg`, `db/`, `modules/`, `middlewares/` |
| `db/` | `pg` and Node | `modules/`, Express |
| Routes | Express `Router`, the controller they receive | Services, repositories, SQL |
| Controller | The service it receives | Repositories, the pool, SQL |
| Service | The repository it receives, `core/`, other modules through their `index.js` | Express, SQL |
| Repository | The pool or transaction client it receives | Express, services |
| `middlewares/` | Express, `core/` | Internals of a module |
| `app.js` | `modules/*/index.js`, `middlewares/`, Express | Internal files of a module |
| A module | Another module only through its `index.js` | Another module's files or tables |

Each layer calls only the layer directly below it: routes, then controller, then service, then repository.

### Conventions

1. **File names** are lowercase with dashes, and the layer goes before the extension: `auth.service.js`, `error-handler.js`.
2. **Factory functions, not classes.** Each piece is created with a function that receives its dependencies in an object and returns an object with its methods: `createAuthService({ authRepository })`. Dependencies are passed in (dependency injection), so tests can replace any of them with a fake. Named exports, as in decision 003.
3. **Wiring happens in the module's `index.js`**, and `app.js` mounts the module router under its path (`app.use('/api/health', health.router)`). Routes inside a module use relative paths.
4. **Errors:** services and repositories throw, and never build HTTP responses. The central error handler (`middlewares/error-handler.js`) is the only place that turns an error into a response. Every error response has the same shape: `{ "error": { "code": "...", "message": "..." } }`, and an unexpected error never shows its internal detail to the client.
5. **Express 5 forwards the errors of async handlers** to the error handler, so handlers do not need `try/catch` just to call `next(error)`.
6. **Tests mirror the source tree:** `src/modules/auth/auth.service.js` is tested in `tests/modules/auth/auth.service.test.js`.

### Adding a module

1. Create `src/modules/<name>/` with the files it needs from the table above and an `index.js` that wires them.
2. If the module owns tables, add a numbered migration that creates them and registers the module in `modules` (decision 002, section 9.1).
3. In `app.js`, create the module and mount its router.
4. Add its tests under `tests/modules/<name>/`.

### Decided later

- **Transactions across layers.** Services own transactions (decision 004). How a repository method receives the transaction client will be defined with the first transaction, user registration.
- **Use cases that touch several modules.** Registration creates a user, its `stats` row and its gym profile. It will call the other modules through their `index.js`, and the way the transaction is shared will be recorded when that code is written.

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

## Consequences

**Positive**
- Every module looks the same, so reading or writing one teaches how to read or write all of them.
- Business logic can be tested without HTTP, and HTTP can be tested with fake services or a fake pool.
- The rules in "Who may use whom" can later be checked automatically with ESLint rules.

**Negative and risks**
- Boilerplate: the wiring in each `index.js` repeats a pattern.
- Without an automatic check, a rule can be broken by mistake. Code review and, later, lint rules are the protection.

**Guidance**
- When a rule seems to get in the way, change the design or write a new decision record. Do not skip the rule.
- Keep `health` as the model: copy its shape for new modules.

## Status

Accepted. Date: 2026-11-02. It refines [001 Modular monolith](001-architecture.md).
