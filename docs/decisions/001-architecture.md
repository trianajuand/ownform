001. Modular monolith
## Context

Ownform is a web application The web application is the initial version, but the long-term product vision is for the mobile application to become the primary way users interact with own form, that turns personal development into an RPG-style system. Users record real-life activities, starting with workouts, and receive experience points (XP) that increase their character's stats and levels. The initial release (MVP) focuses on the Gym module, while future phases are expected to introduce Books, Style and Appearance, and Confidence modules.
The project is developed by a single developer and has two complementary goals: deliver a useful personal-development tool and demonstrate backend engineering skills in a public portfolio. The architecture must therefore support incremental development, clear separation of responsibilities, automated testing, and future extension without introducing unnecessary operational complexity.
The initial technology stack is Node.js and Express, with a REST API and a relational database. The backend is expected to separate routes, controllers, services, and repositories. Domain logic—particularly XP calculation, level progression, and XP limits—must remain independent of HTTP and database concerns. Database access is isolated so the initial SQLite implementation can potentially be replaced by PostgreSQL later.
The application is expected to grow by adding life-area modules over time. These modules should share common capabilities, such as the XP engine, without requiring changes to unrelated modules or rewrites of the core. At the same time, the MVP does not require independently deployed services, distributed communication, or the operational infrastructure associated with a microservices system.
The architectural decision is therefore to organize the backend as a modular monolith: one deployable application with explicit internal module boundaries.

## Decision
Adopt a modular monolith for the Ownform backend. This decision has been accepted and defines the architecture for the initial implementation.
The backend will run as a single application and be deployed as one unit. Internally, it will be organized into modules with clear responsibilities and explicit boundaries. The initial modules include authentication, character data, and the Gym domain; additional life-area modules can be introduced in later phases.
The implementation will follow these principles:
1. Single deployable application. The API will run in one Node.js/Express application. Modules will not be deployed or scaled as separate services in the MVP.
2. Explicit module boundaries. Each domain module will own its related routes, services, and repositories. Adding a module should not require rewriting the shared core or unrelated modules.
3. Layered responsibilities.
   - Routes: map HTTP methods and URLs to controllers and apply middleware; they must not contain business logic.
   - Controllers: handle request and response concerns and invoke services; they must not execute SQL queries.
   - Services: implement use cases and coordinate operations, including database transactions; they must not depend on Express.
   - Repositories: encapsulate database access; they must not contain business rules.
   - Core domain logic: calculate XP, levels, and limits from input data and configuration without accessing HTTP or the database.
4. Shared core with independent domain modules. The XP engine will provide reusable gamification logic. Modules will integrate with the core through clear, consistent interfaces rather than duplicating XP calculations.
5. Testable domain logic. The XP engine will be implemented as pure domain logic and tested independently. API integration tests will cover the main application flows.
6. Persistence isolation. Repositories will encapsulate SQL and database access, limiting the impact of a possible future migration from SQLite to PostgreSQL.
7. Incremental evolution. New modules and capabilities will be introduced as the product roadmap requires them. A move to distributed services is not part of the current decision and would require a separate architectural review.
This decision favors a maintainable, testable codebase that is straightforward for one developer to build and operate, while retaining internal structure that can support future growth.

## Alternatives considered
1. Modular monolith — selected
A single application is deployed as one unit, but its code is organized into domain modules and layers with explicit responsibilities.
Advantages
- Keeps development, local execution, testing, and deployment relatively simple for a solo developer.
- Avoids network communication and distributed-system infrastructure between internal modules.
- Establishes boundaries that make the codebase easier to understand, test, and extend.
- Allows shared capabilities, such as the XP engine, to be reused without duplicating business rules.
- Supports incremental delivery: the Gym module can be implemented first, while other modules can be added later.
- Leaves open the possibility of extracting a module into a separate service in the future if a concrete need emerges.
Disadvantages and trade-offs
- Modules share a process and deployment lifecycle, so a deployment affects the application as a whole.
- Module boundaries are enforced primarily through code organization and development discipline rather than separate deployment units.
- Poorly controlled dependencies can create tight coupling between modules and weaken the intended boundaries.
- Independent scaling of individual modules is not available without changing the architecture.
Assessment: This option best fits the current team size, MVP scope, learning objectives, and expected evolution of Ownform.
2. Traditional monolith — rejected
A traditional monolith would also package the backend as one application, but without the same deliberate emphasis on domain-module boundaries.
Advantages
- Simple initial setup and deployment.
- Low operational overhead.
- Straightforward in-process calls between parts of the application.
Disadvantages and trade-offs
- Without explicit module boundaries, domain logic and responsibilities can become mixed as features accumulate.
- Adding Books, Style and Appearance, and Confidence could make dependencies harder to understand and maintain.
- Business logic may become coupled to controllers, persistence, or unrelated features unless separation is consistently maintained.
- Refactoring or extracting a domain area later could require more work if the codebase has become tightly coupled.
Assessment: Although a traditional monolith would be viable for the MVP, it provides less architectural guidance for the planned multi-module product. The modular monolith retains the deployment simplicity of a monolith while making boundaries an explicit design goal.
3. Microservices — rejected
A microservices architecture would split the application into independently deployable services that communicate through network interfaces.
Advantages
- Services can be deployed and scaled independently.
- Each service can evolve within its own boundary and potentially have independent implementation or deployment choices.
- Service ownership can be distributed across multiple teams.
Disadvantages and trade-offs
- Introduces network communication, service-to-service failure modes, and additional operational concerns.
- Requires more infrastructure and deployment coordination than the current project needs.
- Cross-service workflows and data consistency can become more complex, especially for operations that must persist a workout, calculate XP, record the XP action, and update character progress together.
- Adds overhead for monitoring, debugging, configuration, and integration testing.
- Independent deployment and scaling offer limited immediate value for a solo developer building an MVP.
Assessment: Microservices are not justified by the current requirements. They would add complexity before the project has demonstrated a need for independently deployed or independently scaled services.
## Consequences
Positive consequences
- Clearer separation of concerns: routes, controllers, services, repositories, and domain logic have defined responsibilities.
- Improved testability: the XP engine can be tested without Express, SQL, or a running database.
- Safer feature growth: future life-area modules can be added behind explicit boundaries and use shared capabilities consistently.
- Simpler development and deployment: the project remains one application to run, test, configure, and deploy.
- Lower initial operational complexity: no service discovery, inter-service networking, or distributed deployment setup is required.
- More focused database changes: repositories isolate persistence details and support a potential future database migration.
- Portfolio value: the architecture demonstrates deliberate design choices, separation of concerns, and trade-off analysis without overengineering the MVP.
Negative consequences and risks
- Boundary discipline is required: a modular monolith does not automatically prevent coupling. Code review and tests must help keep modules from reaching into one another's internals.
- Shared release lifecycle: all modules are deployed together, even if only one module changes.
- Shared runtime and resources: modules cannot be scaled independently and share the application's process-level failure boundary.
- Potential core bottleneck: if every module depends directly on an oversized shared core, changes to that core could affect the entire application.
Mitigations and implementation guidance
- Keep each module's routes, services, and repositories within its own directory.
- Keep business rules out of routes and controllers, and keep SQL out of controllers and services where repositories are responsible for persistence.
- Keep the XP engine as pure domain logic: it receives the relevant workout data, history, and configuration, then returns a calculation result without accessing the database or HTTP layer.
- Use explicit interfaces and documented inputs/outputs when modules interact with shared core capabilities.
- Use automated unit tests for the XP engine and integration tests for important API workflows.
- Use database transactions for operations that must succeed or fail together, such as saving a workout and recording its XP results.
- Avoid introducing abstractions, infrastructure, or service boundaries without a concrete requirement.
- Revisit this decision only if actual needs emerge—for example, a module requires independent scaling or deployment, or team and operational requirements change substantially. Any extraction should be justified by measurable benefits and documented in a separate decision record.
## Status
Accepted. The modular monolith is the chosen architecture for the initial Ownform implementation. This decision does not prohibit future architectural changes; it establishes the simplest structure that meets the known requirements while preserving clear internal boundaries.

Amended on 2026-10-28 by [004 PostgreSQL with Docker](004-postgresql.md): the initial database is PostgreSQL, not SQLite. The mentions of SQLite above are kept as they were written when this decision was made. The decision itself (a modular monolith with layers and persistence isolation) is unchanged.
