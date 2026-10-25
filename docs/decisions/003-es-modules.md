# 003. ES modules

## Context

Ownform's backend runs on Node.js (LTS) with Express. Node supports two module systems: CommonJS (`require` and `module.exports`) and ECMAScript modules, or ES modules (`import` and `export`).

The project plan includes a frontend written in plain JavaScript with ES modules, a later migration of the backend to TypeScript, and a later frontend in React. The XP engine is meant to be reused across those steps, and TypeScript and React use `import` and `export` as their normal syntax. The project is built by a single developer who also wants the repository to show current practices.

The choice has to be made before more code exists, because every file written after it follows one system or the other.

## Decision

Use ES modules in the backend. This decision has been accepted and is already applied in the repository: `levels.js` and its tests use `import` and `export`.

The implementation follows these rules:

1. **Module type.** `backend/package.json` declares `"type": "module"`, so every `.js` file in the backend is an ES module.
2. **Syntax.** Use `import` and `export`. Do not use `require` or `module.exports`.
3. **Relative imports include the extension.** For example `import { levelFromXp } from './levels.js';`. Node does not resolve imports without it.
4. **File paths.** `__dirname` and `__filename` do not exist in ES modules. When a path relative to the current file is needed, build it from `import.meta.url`.
5. **Named exports by default.** Each function is exported by name, so imports show what a file uses and tools can find unused code. A default export is used only when a file has a single clear purpose.
6. **Tests.** `node:test` works with ES modules without extra configuration.

## Alternatives considered

### 1. ES modules: selected

**Advantages**
- One syntax across the backend, the frontend and the later TypeScript code, so the XP engine and the validation schemas can be reused without rewriting imports.
- It is the standard defined by the language, and Node supports it directly.
- Static `import` lets tools analyze dependencies.
- It aligns with the planned migration to TypeScript and React.

**Disadvantages and trade-offs**
- Relative imports need the `.js` extension.
- `__dirname` and `__filename` are not available.
- Some older libraries were written for CommonJS. They can usually be imported with a default import, but a library may need extra care. This has not been checked for each library in the stack, so any problem is checked in that library's documentation when it appears.

### 2. CommonJS: rejected

The traditional Node system, and the default in many older tutorials.

**Advantages**
- No extension rules for relative imports, and `__dirname` is available.
- Maximum compatibility with older libraries.

**Disadvantages and trade-offs**
- A different syntax from the frontend and from TypeScript, so the later migration would also have to change every import.
- It would leave the repository on the older style from the start.

### 3. Compile to CommonJS with a build step: rejected

Write ES module syntax and let a tool (Babel, or TypeScript later) convert it.

**Disadvantages and trade-offs**
- Adds a build step and configuration before the project needs one.
- Debugging runs against generated code instead of the written code.

## Consequences

**Positive**
- Consistent syntax across all the planned parts of the project.
- The XP engine can move to TypeScript with the import syntax already in place.
- Named exports make dependencies between files visible.

**Negative and risks**
- A forgotten `.js` extension in a relative import causes an error when the code runs.
- Code copied from CommonJS examples (`require`, `__dirname`) has to be translated.
- Libraries with CommonJS-only packaging need attention when they are imported.

**Guidance**
- Keep ESLint configured for ES modules.
- When a library fails to import, check its documentation before changing the module system.
- Revisit this decision only if a required library cannot be used from ES modules.

## Status

Accepted. Date: 2026-10-22.
