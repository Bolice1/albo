# Albo technology stack

**Status:** Proposed — validate against team skills, cost, hosting, security, and requirements  
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
| Web application | Next.js + TypeScript | Adopt unless requirements change |
| UI and styling | Tailwind CSS + shadcn/ui | Adopt selectively |
| Core API | NestJS + TypeScript | Adopt as modular monolith |
| AI and analytics | Python + FastAPI | Adopt as separate specialized service |
| Primary database | PostgreSQL | Adopt |
| Geographic data | PostGIS | Adopt only for approved spatial queries |
| Database access | Prisma or approved typed ORM | Validate and select one |
| Cache and jobs | Redis + BullMQ or equivalent | Add when background work requires it |
| Risk engine | TypeScript/Python rules and weighted scoring | Adopt first |
| Machine learning | scikit-learn/XGBoost when justified | Later, after validation |
| Experiment tracking | MLflow or approved equivalent | Later, when model experiments begin |
| Authentication | OIDC provider, Keycloak, or confirmed Supabase Auth boundary | Select one |
| API contract | OpenAPI/Swagger | Adopt |
| File storage | Private S3-compatible object storage | Add for reports/documents |
| Testing | Jest, Pytest, Playwright | Adopt by layer |
| Packaging | Docker | Adopt for reproducible environments |
| Observability | OpenTelemetry + approved metrics/logging backend | Adopt incrementally |
| CI/CD | Repository-supported CI pipeline | Define before deployment |

## 3. Web application

### Next.js + TypeScript

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

### NestJS + TypeScript

**Purpose:** Public API, authentication integration, authorization, consent, domain workflows, persistence coordination, integrations, jobs, and audit events.

**Why it fits:**

- Modular structure supports the proposed modular-monolith architecture
- TypeScript provides consistent types with the frontend
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

**Proposed selection:** Prisma, subject to validation.

Prisma is a candidate because it provides typed access, migrations, and a developer-friendly schema workflow. TypeORM or another tool may be considered if the team's operational or relational requirements justify it.

The team must select one primary ORM/migration approach before implementation begins. Multiple competing database-access patterns are not allowed without a recorded decision.

## 5. AI and analytics service

### Python + FastAPI

**Purpose:** Rules, weighted scoring, data processing, model adapters, evaluation endpoints, and later machine-learning workflows.

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

### OIDC provider, Keycloak, or confirmed Supabase Auth boundary

The initial recommendation is to use a standards-based identity provider rather than implementing passwords and token issuance inside Albo.

Candidate options include:

- Managed OIDC provider
- Keycloak when self-hosted identity control is required
- Supabase Auth if the current platform remains the selected identity boundary

The final choice must consider cost, hosting, team capability, account recovery, MFA, token claims, role integration, auditability, data residency, and operational burden.

Regardless of provider:

- The core API validates tokens.
- Identity-provider-managed tables are not exposed to clients.
- Albo stores controlled application records linked to the provider subject ID.
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

## 15. Proposed first-release stack

Subject to the open decisions, the first implementation should use:

```text
Next.js + TypeScript
Tailwind CSS + selected shadcn/ui components
NestJS + TypeScript modular monolith
Python + FastAPI rules/analytics service
PostgreSQL
PostGIS for approved facility/location queries
One selected typed ORM and migration tool
Redis + background worker only where required
OpenAPI/Swagger
Jest + Pytest + Playwright
Docker
OpenTelemetry-compatible instrumentation
Private object storage when report files require it
```

## 16. Open technology decisions

- Final identity provider: managed OIDC, Keycloak, or Supabase Auth boundary
- ORM and migration tool
- Hosting provider and data-residency configuration
- Redis/job-worker deployment
- Object-storage provider
- Observability backend and retention
- Map/geocoding/routing provider
- Rwanda facility and environmental-data sources
- Notification delivery provider
- External AI model provider, if any
- CI/CD platform and deployment promotion rules
