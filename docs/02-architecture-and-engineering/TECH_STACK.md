# Albo technology stack

**Status:** Approved  
**Decision direction:** TypeScript web and core API, Python AI service, PostgreSQL as the primary database, and a modular monolith first

## 1. Stack principles

The stack should prioritize:

- Clear boundaries that developers and AI agents can understand
- Strong typing and data integrity for sensitive health workflows
- Explainability before model complexity
- Secure handling of identity and health information
- A small operational footprint for the first release
- Replaceable external providers
- Testability from the first vertical slice
- A path to scale without adopting distributed-system complexity too early

Technology choices are proposed decisions. A tool is not considered adopted until the team validates its cost, licensing, support, deployment model, security properties, and fit with available skills.

## 2. Recommended stack at a glance

| Area | Proposed technology | First-release position |
|---|---|---|
| Web application | Next.js + TypeScript | Target UI stack (deferred to separate frontend onboarding track per [ADR-016](../06-technical-decisions/DECISIONS.md)) |
| UI and styling | Tailwind CSS + shadcn/ui | Adopt selectively when `frontend/` is onboarded (`ADR-016`) |
| Core API & package runtime | NestJS + TypeScript + **Bun** (`bun.lock`) | Adopted as modular monolith (`ADR-001`, `ADR-016`) |
| AI and analytics | Python 3.12 + **`uv`** (`uv.lock`) + FastAPI | Adopted as separate specialized service (`ADR-001`, `ADR-016`) |
| Primary database | PostgreSQL (`postgis/postgis:16-3.4` locally) | Adopted (`ADR-008`, `ADR-016`) |
| Geographic data | PostGIS | Adopted only for approved spatial queries (`ADR-008`) |
| Database access | **Prisma ORM** + **Prisma Migrate** | Adopted (`ADR-012`) |
| Cache and jobs | Redis (`redis:7-alpine` locally) + BullMQ | Adopted for cache, rate limits, and bounded async jobs (`ADR-008`) |
| Risk engine | Python deterministic rules and weighted scoring (`rules-v1.0.0`) | Adopted first (`ADR-002`, `ADR-010`) |
| Machine learning | scikit-learn/XGBoost when justified | Later, after validation (`ADR-002`) |
| Experiment tracking | MLflow or approved equivalent | Later, when model experiments begin |
| Authentication | Standards-based OIDC/JWT (Supabase Auth cloud default + offline test signer) | Adopted (`ADR-005`, `ADR-011`) |
| API contract | OpenAPI/Swagger | Adopted |
| File storage | Private S3-compatible object storage (`minio/minio` in local/CI) | Adopted for private reports with presigned URLs (`ADR-016`, `ADR-017`) |
| Testing | Jest + Supertest (via Bun), Pytest (via `uv`), Playwright (deferred with `frontend/`) | Adopted by layer (`ADR-016`) |
| Packaging | Docker + Docker Compose | Adopted for reproducible environments (`ADR-008`, `ADR-016`) |
| Observability | OpenTelemetry + approved metrics/logging backend | Adopt incrementally (`OPEN-012`) |
| CI/CD | **GitHub Actions** for CI; production CD target in `OPEN-012` | Adopted for CI (`ADR-016`) |

## 3. Web application

### Next.js + TypeScript

*(Note: Per [ADR-016](../06-technical-decisions/DECISIONS.md), `frontend/` scaffolding is deferred to a separate onboarding track while `backend/`, `ai-services/`, `infrastructure/`, and CI are onboarded first.)*

**Purpose:** Citizen, provider, onboarding, dashboard, map, report, and administration interfaces.

**Why it fits:**

- Strong structure for multiple application areas
- TypeScript support across UI and API contracts
- Routing and server/client rendering options
- Good support for responsive and accessible web experiences
- Works with OpenAPI-generated types or shared contract tooling

**Rules:**

- The client is not a trusted authorization boundary.
- Do not put secrets, provider credentials, or privileged service keys in client bundles.
- Do not duplicate risk calculations or consent decisions in the browser.
- Handle loading, stale, unavailable, and limited data states explicitly.
- Keep health information out of URLs, analytics events, and ordinary browser logs.

### Tailwind CSS + shadcn/ui

**Purpose:** Consistent, responsive, and accessible interface components.

**Rules:**

- Components must meet the project's accessibility requirements.
- Risk meaning must not depend on color alone.
- Shared components should have documented states for errors, empty data, loading, stale data, and limited results.
- shadcn/ui components are source-controlled application code and must be reviewed like other code.

## 4. Core backend

### NestJS + TypeScript (Bun toolchain)

**Purpose:** Public API, authentication integration, authorization, consent, domain workflows, persistence coordination, integrations, jobs, and audit events.

**Toolchain ([ADR-016](../06-technical-decisions/DECISIONS.md)):** **Bun** (`bun install --frozen-lockfile`, `bun run ...`) replaces `npm`/`pnpm` as the package manager, script runner, and container runtime for `backend/`.

**Why it fits:**

- Modular structure supports the proposed modular-monolith architecture
- TypeScript provides consistent types across API contracts
- Dependency injection supports testing and replaceable adapters
- Guards, pipes, interceptors, and validation support secure API boundaries
- OpenAPI integration supports documented contracts

**Core rules:**

- Controllers validate transport concerns and delegate to use cases.
- Domain modules own business behavior and do not query each other's tables casually.
- Authorization and consent are enforced server-side.
- External integrations are accessed through adapters.
- All sensitive actions create the required audit event.

### ORM and database access

**Adopted selection ([ADR-012](../06-technical-decisions/DECISIONS.md)):** **Prisma ORM** and **Prisma Migrate** (`prisma migrate deploy` in production, never `db push`), using `user_accounts` as the standardized primary application account table.

Multiple competing database-access patterns are not allowed without a recorded decision.

## 5. AI and analytics service

### Python 3.12 + `uv` + FastAPI

**Purpose:** Rules, weighted scoring, data processing, model adapters, evaluation endpoints, and later machine-learning workflows.

**Toolchain ([ADR-016](../06-technical-decisions/DECISIONS.md)):** **Python 3.12** (`python:3.12-slim`) managed deterministically by **`uv`** (`pyproject.toml` + `uv.lock`, `uv sync --frozen`) with `ruff`, `mypy --strict`, and `pytest`.

**Why it fits:**

- Strong ecosystem for numerical processing and machine learning
- FastAPI provides typed request/response validation and service documentation
- Separates specialized AI dependencies from the core application
- Supports progressive movement from rules to validated models

**Boundary:** The AI service does not own users, consent, authorization, provider assignments, or public application workflows. The core API sends minimum necessary authorized inputs and stores the approved result.

### Initial AI tools

- Python standard tooling and typed data models
- NumPy/Pandas only where data processing requires them
- Rules and weighted scoring before advanced models
- scikit-learn or XGBoost only after data quality, clinical review, and evaluation requirements are met
- PyTorch only if a later approved use case genuinely requires deep learning
- MLflow or an equivalent experiment registry only when model experiments begin

The first release should not train a proprietary large language model.

## 6. Data and persistence

### PostgreSQL

**Purpose:** Durable application records, constraints, transactions, consent, profiles, health inputs, risk assessments, facilities, reports, and audit events.

**Why it fits:**

- Relational integrity for sensitive connected domains
- Transactions and foreign keys
- Mature indexing and query capabilities
- Good support for structured data and controlled JSON
- Works with PostGIS for approved geographic queries

PostgreSQL is the primary source of truth. It must not be replaced by Redis, an unstructured document store, or multiple primary databases without a documented decision.

### PostGIS

**Purpose:** Facility search, bounded proximity queries, areas, grids, and approved environmental geography.

**Rules:**

- Use only when a spatial requirement exists.
- Minimize precision for personal locations.
- Apply spatial authorization and privacy rules before returning results.
- Do not use geographic proximity as a substitute for clinical suitability.

### Redis + BullMQ

**Purpose:** Cache, rate limiting, background jobs, notification delivery, report generation, environmental ingestion, and other bounded asynchronous work.

**Rules:**

- Redis is not durable health-record storage.
- Jobs must be idempotent, bounded, observable, and retry-safe.
- Job payloads contain minimum necessary data and no credentials.
- Define expiry and dead-letter behavior.

## 7. Authentication and authorization

### Standards-based OIDC / JWT boundary ([ADR-011](../06-technical-decisions/DECISIONS.md))

Per `ADR-005` and `ADR-011`, Albo delegates authentication and token issuance to a standards-based OIDC/JWT boundary rather than implementing passwords inside Albo:

- **Cloud staging/production default:** **Supabase Auth** (satisfying `DP-003` while keeping `auth.users` isolated from clients).
- **Local development and CI (`test`):** Deterministic offline OIDC-compatible JWT signer issuing identical `iss`, `aud`, `exp`, and `sub` claims so automated suites run 100% offline.

Regardless of environment:

- The core API validates tokens.
- Identity-provider-managed tables are not exposed to clients.
- Albo stores controlled application records (`user_accounts`) linked to the provider subject ID.
- Roles, consent, assignments, and resource access remain Albo policy decisions.

## 8. API and contracts

### OpenAPI / Swagger

Use OpenAPI as the public API contract. The contract should describe authentication, request validation, responses, errors, pagination, authorization expectations, and deprecation behavior.

The API documentation is maintained alongside implementation. Generated documentation must not be treated as a substitute for explaining privacy, consent, safety, or business behavior.

### Internal service contract

The core API and FastAPI service require a separate authenticated internal contract with:

- Versioned use cases
- Minimum input snapshots
- Timeouts and request IDs
- Structured result statuses
- Rule/model versions
- Limitations and provenance

## 9. Storage for reports and documents

Use private S3-compatible object storage for generated reports or approved documents when database storage is unsuitable.

Required controls:

- Private buckets
- Short-lived scoped download URLs
- Explicit object retention and deletion
- No predictable public paths
- Metadata stored in PostgreSQL
- File validation and scanning if uploads are introduced

## 10. Testing stack

| Layer | Proposed tool | Coverage |
|---|---|---|
| Core API unit/integration | Jest | Domain rules, authorization, persistence, adapters |
| AI service | Pytest | Rules, data processing, safety, model adapters |
| API contract | OpenAPI-based tests | Request/response compatibility and errors |
| Browser journeys | Playwright | Onboarding, profile, risk, facility, reports |
| Database | Test database and migrations | Constraints, RLS/policies where used, transactions |
| Security | Automated authorization and dependency checks | Access boundaries, secret leakage, vulnerable dependencies |
| AI evaluation | Versioned synthetic evaluation sets | Safety, factuality, limitations, regressions, fairness where applicable |

Real patient records and production secrets are prohibited in all test layers.

## 11. Packaging and deployment

### Docker

Docker provides repeatable packaging for the frontend, core API, AI service, and local dependencies.

The initial deployment should remain simple:

```text
Frontend
Core API
AI service
PostgreSQL/PostGIS
Redis and worker
Private object storage, if needed
```

Kubernetes is not an initial requirement. It may be considered only when operational scale, availability, or team ownership justifies it.

### CI/CD

The repository should establish a CI pipeline that runs:

- Formatting and linting
- Type checking
- Unit and integration tests
- API contract checks
- AI evaluation checks where applicable
- Dependency and secret scanning
- Build verification
- Migration checks

Deployment promotion must separate development, test, staging, and production configuration and access.

## 12. Observability and operations

### OpenTelemetry

Use OpenTelemetry or an equivalent standard for trace and metric instrumentation across the web, API, jobs, integrations, and AI service.

The backend for metrics, logs, and dashboards remains to be selected. Grafana is a candidate for dashboards, but the final hosting and retention choice is open.

Observability must measure:

- Request latency and error rates
- Authorization and validation failures
- Job depth, retries, and dead letters
- External-provider status and freshness
- Risk-assessment duration and status by version
- Report and notification delivery status
- Database and storage health

Do not log passwords, tokens, raw health records, precise locations without justification, raw prompts, or unrestricted assistant responses.

## 13. What should not be added initially

- Kubernetes without an operational requirement
- Multiple primary databases without a clear domain need
- A microservice for every module
- A proprietary large language model
- Advanced ML before reliable structured data and validation
- Every wearable or health-device integration
- A general news, trend, or social-media content-creation system
- Unreviewed external APIs called directly from the browser

## 14. Selection and adoption gates

Before a technology is marked adopted, confirm:

- It solves an approved requirement.
- Its license and cost are acceptable.
- It can be hosted and operated by the team.
- It supports required security and privacy controls.
- It has a test and upgrade strategy.
- It does not duplicate another selected tool.
- It has an exit or replacement path where vendor lock-in matters.
- The choice is recorded in the appropriate decision record.

## 15. Adopted first-release stack

Per `ADR-008`, `ADR-011`, `ADR-012`, `ADR-016`, and `ADR-017`, the implementation stack uses:

```text
Next.js + TypeScript + Tailwind CSS + shadcn/ui (deferred to separate frontend onboarding track per ADR-016)
NestJS + TypeScript modular monolith (Bun toolchain — bun.lock, bun install --frozen-lockfile)
Python 3.12 + uv (uv.lock) + FastAPI rules/analytics service
PostgreSQL + PostGIS (postgis/postgis:16-3.4 locally)
Prisma ORM + Prisma Migrate
Redis (redis:7-alpine locally) + BullMQ job worker
Private S3-compatible object storage (minio/minio locally; presigned report URLs)
OpenAPI/Swagger
Jest + Supertest + Pytest (plus Playwright when frontend/ is onboarded)
Docker + Docker Compose + GitHub Actions CI
OpenTelemetry-compatible instrumentation
```

## 16. Open and resolved technology decisions

### Resolved
- **Identity provider boundary:** **Resolved in [ADR-011](../06-technical-decisions/DECISIONS.md)** — standards-based OIDC/JWT verification in NestJS (Supabase Auth cloud default + offline OIDC-compatible JWT test signer).
- **ORM and migration tool:** **Resolved in [ADR-012](../06-technical-decisions/DECISIONS.md)** — Prisma ORM + Prisma Migrate (`user_accounts` domain table).
- **Package managers, local Redis/worker/object-storage topology, and CI:** **Resolved in [ADR-008](../06-technical-decisions/DECISIONS.md), [ADR-016](../06-technical-decisions/DECISIONS.md), and [ADR-017](../06-technical-decisions/DECISIONS.md)** — Bun (`backend/`), Python 3.12 + `uv` (`ai-services/`), Docker Compose (`postgis/postgis:16-3.4`, `redis:7-alpine`, `minio/minio`), BullMQ worker entrypoint, and GitHub Actions CI.

### Remaining pre-production decisions
- Production hosting provider and Rwanda data-residency configuration (`OPEN-007`, `OPEN-012` in [DECISIONS.md](../06-technical-decisions/DECISIONS.md))
- Production S3-compatible object-storage vendor, observability backend/retention, and CD promotion target (`OPEN-012`)
- Authoritative Rwanda facility, map/geocoding/routing, weather/air-quality, and external notification providers (`OPEN-010`)
- External AI model provider, if any (`OPEN-011`)
