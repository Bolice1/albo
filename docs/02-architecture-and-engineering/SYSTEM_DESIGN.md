# Albo system design

**Status:** Approved — implementation-facing design  
**Related:** [Architecture](ARCHITECTURE.md), [API documentation](API_DOCUMENTATION.md), [Database schema](DATABASE_SCHEMA.md), [Integrations](INTEGRATIONS.md)

## 1. Purpose

This document explains how Albo's components work together at runtime. It turns the architectural boundaries into request flows, background processes, state transitions, deployment units, and implementation guidance.

The implementation is not yet complete. These flows are approved contracts and must be updated when requirements or architectural decisions change.

## 2. Runtime topology

```text
                  +-----------------------+
                  | Citizen / provider UI |
                  | Next.js web client    |
                  +-----------+-----------+
                              |
                         HTTPS / JSON
                              |
                  +-----------v-----------+
                  | Core API              |
                  | NestJS modular        |
                  | monolith              |
                  +--+-------+--------+---+
                     |       |        |
                SQL  |    queue      | internal API
                     |       |        |
              +------v--+ +--v---+ +--v-----------+
              |Postgres | |Redis | |AI service    |
              |/PostGIS | |jobs  | |FastAPI       |
              +---------+ +------+ +--------------+
                     |
              +------v----------------------------+
              | Object storage and external APIs  |
              | maps, facilities, weather, etc.   |
              +-----------------------------------+
```

## 3. Runtime responsibilities

### Web client

The web client renders pages, gathers user input, displays loading and failure states, and calls the public API. It may improve usability but cannot make trusted authorization, consent, or risk decisions.

### Core API

The core API is the trusted application boundary. It validates tokens and input, performs authorization and consent checks, executes domain use cases, coordinates persistence and jobs, invokes approved adapters, writes audit events, and returns sanitized responses.

### AI service

The AI service performs approved rules, weighted calculations, data processing, model adapters, and model metadata operations. It receives a minimum necessary input snapshot from the core API and returns structured output with provenance and limitations.

### Database and storage

PostgreSQL is the durable source of truth for application records. PostGIS supports approved spatial queries. Redis supports cache, rate limits, and jobs but never replaces durable health-record storage. Object storage holds approved reports or documents with private access.

## 4. Repository and application layout

```text
frontend/
  Next.js web application (deferred to separate frontend onboarding track per ADR-016)

backend/
  NestJS modular monolith (Bun toolchain — bun.lock)
  modules/        domain modules
  common/         shared transport and infrastructure concerns
  database/       Prisma schema, migrations, and database access
  jobs/           BullMQ background-job handlers
  integrations/   typed external-provider adapters (synthetic/sandbox defaults per ADR-017)

ai-services/
  FastAPI service (Python 3.12 + uv — uv.lock)
  risk_engine/    rules and scoring
  data_processing/
  model_adapters/
  evaluation/

infrastructure/
  local and deployment configuration

docs/
  project source of truth
```

Per [ADR-016](../06-technical-decisions/DECISIONS.md), initial engineering onboarding builds `backend/`, `ai-services/`, `infrastructure/`, and GitHub Actions CI, deferring `frontend/` to a separate onboarding track.

## 5. Standard protected request flow

```text
1. Client sends HTTPS request with bearer token.
2. API validates token issuer, audience, signature, and expiry.
3. API validates body, query, path, and content limits.
4. API derives the caller from the token.
5. API checks role, organization, assignment, ownership, and consent.
6. Domain use case executes inside an explicit transaction where needed.
7. Database or approved adapter is called.
8. Sensitive action creates a minimal audit event.
9. Response is mapped to the public API contract.
10. Client receives safe data, error, or explicit unavailable state.
```

The client must not supply a trusted user ID to select another user's data. The API must not expose database errors, provider credentials, raw prompts, or unnecessary sensitive fields.

## 6. First-release onboarding flow

```text
Citizen
  → identity provider: create account / sign in
  → core API: create or reconcile application account
  → core API: present data-use and AI limitations
  → citizen: choose consent purposes
  → core API: record versioned consent and audit event
  → citizen: complete approved profile fields
  → core API: validate and store sourced inputs
  → client: display onboarding completion and next step
```

Onboarding must be usable when optional data is missing. The system must not imply that a user must provide every possible health field to receive basic service.

## 7. Health-input flow

```text
Client submits approved input
  → authenticate caller
  → validate field allowlist, type, unit, and range
  → verify purpose and consent
  → store source, timestamp, and provenance
  → write audit event when sensitive change requires it
  → return sanitized input representation
```

Per [ADR-017](../06-technical-decisions/DECISIONS.md), corrections (`PATCH /api/v1/me/health-inputs/{inputId}`) use **immutable supersession**: inside a transaction, the prior `health_inputs` row is marked `status = 'superseded'` and a new `status = 'active'` row is inserted referencing `supersedes_input_id`, preserving historical `input_snapshot` reproducibility. Unapproved arbitrary clinical fields must be rejected (`422 VALIDATION_ERROR`).

## 8. Risk-assessment flow

```text
Citizen requests assessment
  → core API checks approved use case and consent
  → core API selects valid, fresh, authorized inputs
  → core API creates immutable input snapshot
  → core API calls rule/AI service
  → AI service validates request and executes approved version
  → core API validates result and safety metadata
  → core API stores assessment and provenance
  → core API writes audit event
  → client receives level, factors, limitations, and next steps
```

Per [ADR-013](../06-technical-decisions/DECISIONS.md), citizen-triggered Slice 1 rule calculations (`lifestyle_ncd_preventive`, `rules-v1.0.0`) run synchronously over the private network (`POST /internal/v1/risk-assessments/calculate`) with `X-Internal-Service-Token` authentication and a strict `2000ms` timeout. Expensive or batch calculations use a BullMQ job:

```text
POST assessment request → queued/processing response
                         ↓
                   worker + AI service
                         ↓
                complete/limited/failed state
```

Missing, stale, invalid, or unauthorized inputs must produce `status: "limited"` (`level: null`), never an invented low-risk result (`ADR-003`, `ADR-014`).

## 9. External-data ingestion flow

```text
Scheduler or approved user action
  → create idempotent ingestion job
  → adapter loads provider credentials securely
  → provider request with timeout and bounded range
  → verify response schema and source timestamp
  → normalize units and geographic precision
  → store approved representation and provenance
  → mark source freshness and ingestion status
  → optionally queue a separately approved derived calculation
```

The system must distinguish observed, forecast, estimated, stale, and unavailable information. Provider data cannot silently become a clinical input.

## 10. Facility and map flow

```text
Facility source or approved administrator
  → facility adapter
  → validate and normalize facility/service record
  → store source and last-verified timestamp
  → indexed search by bounded criteria
  → optional coarse location/routing request
  → return facility details and freshness to client
```

Precise location is optional and purpose-limited. A map provider does not guarantee that a facility is open, stocked, staffed, or clinically appropriate unless an approved source confirms that fact.

## 11. Assistant flow

```text
User message
  → authenticate and authorize conversation
  → filter sensitive and unsafe input
  → detect emergency/self-harm or severe-symptom signals
  → route to reviewed escalation when necessary
  → retrieve only approved context
  → call approved assistant/model adapter
  → apply output safety and privacy filters
  → store minimum conversation metadata
  → return bounded response, limitations, and next step
```

The assistant must not diagnose, prescribe, fabricate records, claim certainty, or bypass the risk-assessment and provider workflows.

## 12. Report flow

```text
User requests report
  → authorization and time-range validation
  → create report record with queued status
  → background worker reads approved data
  → generate report using versioned template
  → store private object and metadata
  → grant scoped access or short-lived download URL
  → update report status and audit event
```

Per [ADR-017](../06-technical-decisions/DECISIONS.md), generated reports are stored in private S3-compatible object storage (`minio/minio` in local/test environments) and downloaded exclusively via short-lived presigned URLs after ownership or `report_access` verification. Failed reports transition to `failed` and never expose partial files.

## 13. Notification flow

```text
Approved domain event
  → check consent, category, preference, quiet hours, and suppression rules
  → create notification event
  → deliver in-app or approved external channel
  → record provider status without sensitive payload
  → retry bounded failures
  → preserve in-app state if an external channel fails
```

Notifications should use protected in-app references instead of unnecessary health detail in SMS, email previews, or push payloads.

## 14. Core state transitions

### Risk assessment

```text
requested → queued → processing → complete
                              ├→ limited
                              └→ failed
```

An assessment may become `superseded` when a newer valid assessment replaces it for display, but historical provenance must remain available according to retention policy.

### Report

```text
requested → queued → generating → ready
                              └→ failed
```

### External ingestion

```text
scheduled → running → succeeded
                   ├→ partial
                   ├→ stale
                   └→ failed
```

State transitions must be explicit, validated, auditable where sensitive, and safe to retry.

## 15. Background jobs

Candidate queues include:

- `environment-ingestion`
- `facility-synchronization`
- `risk-assessment`
- `report-generation`
- `notification-delivery`
- `provider-reconciliation`

Every job should define an idempotency key, payload allowlist, owner, retry policy, timeout, dead-letter behavior, metrics, and data-retention behavior. Job payloads must not contain unnecessary raw health data or credentials.

## 16. Failure and degraded-mode behavior

| Failure | System behavior |
|---|---|
| Identity provider unavailable | Do not issue access; preserve existing safe session behavior according to provider policy |
| Database unavailable | Return bounded service-unavailable response; do not claim writes succeeded |
| AI service unavailable | Show assessment unavailable/limited; never infer low risk |
| Weather source unavailable | Show last verified data or unavailable state with timestamp |
| Map provider unavailable | Show stored facility details without directions |
| Notification provider unavailable | Preserve in-app notification and record delivery failure |
| Report worker failure | Mark report failed or retry safely; do not expose partial file |
| Invalid external payload | Reject/quarantine payload and alert integration owner |
| Authorization failure | Return safe denial without confirming another user's record |

## 17. Security controls in the runtime path

- TLS for network communication
- Token validation at the API boundary
- Server-side authorization and consent checks
- Input validation and output serialization
- Rate limits for authentication, assistant, assessments, reports, referrals, and integrations
- Secret management for provider credentials
- Redacted logs and traces
- Audit events for sensitive actions
- Private object storage and scoped downloads
- Synthetic data in development and test environments

## 18. Observability design

Every request and job should carry a correlation identifier. Metrics should describe system behavior without exposing personal information:

- Request count, latency, and error rate by endpoint category
- Authorization denials and validation failures
- Risk-assessment status and duration by use case/version
- Queue depth, retries, and dead-letter counts
- External-provider availability and freshness
- Report generation and notification-delivery status
- Database and storage health

Logs must not contain access tokens, passwords, raw health records, precise location unless explicitly justified, raw model prompts, or unrestricted assistant responses.

## 19. Environment design

At minimum, maintain separate development, test, staging, and production configurations.

Each environment must define:

- Identity-provider configuration
- Database and migration target
- Queue and object-storage locations
- External-provider base URLs and credentials
- Runtime governance circuit-breaker flags (`FEATURE_PROVIDER_PORTAL_ENABLED`, `FEATURE_ASSISTANT_ENABLED`, `FEATURE_CHECKINS_ENABLED`, `APPROVED_RISK_RULE_VERSIONS` — defaulting conservatively in `production` per [ADR-017](../06-technical-decisions/DECISIONS.md))
- Logging and monitoring destinations
- Data-retention and access controls

Production secrets and data must never be copied into lower environments. Test and development environments use synthetic fixtures and provider sandboxes or mocks.

## 20. First vertical slice

The first implementation slice proves the complete path without requiring the entire platform:

1. Citizen signs in through the approved identity provider (`ADR-011`).
2. Core API creates or retrieves the `user_accounts` record (`ADR-012`).
3. Citizen grants `health_input_storage` and `preventive_risk_calculation` (`v1`) consents (`ADR-015`).
4. Citizen submits approved synthetic health/lifestyle inputs (`ADR-010`).
5. API validates and stores the input with provenance.
6. `ai-services/` (`lifestyle_ncd_preventive`, `rules-v1.0.0`) calculates one non-diagnostic risk indicator synchronously (`ADR-010`, `ADR-013`).
7. API stores `rule_model_version` and the immutable `input_snapshot` (`ADR-015`).
8. API returns (and dashboard renders once `frontend/` is onboarded per `ADR-016`) the discrete `level`, `contributing_factors`, `limitations`, and `recommended_next_steps` (`ADR-014`).
9. Audit events record the sensitive actions without raw payloads.
10. Authorization tests prove another user receives `404 NOT_FOUND` (`ADR-004`).

This slice is verified end-to-end before enabling live external device integrations, live consultations, or advanced ML models.

## 21. Implementation readiness checklist

System implementation is ready to begin when:

- The first vertical slice requirements and acceptance tests are approved.
- Database entities and ownership are agreed.
- API routes and error contracts are agreed.
- Identity, consent, and authorization behavior is testable.
- The rule engine input/output contract is defined.
- Local services and synthetic fixtures can run repeatably.
- External integrations have mocks or sandboxes.
- Logs, audit events, and failure states are defined.

## 22. Open and resolved system-design decisions

### Resolved
- **First vertical-slice use case and input fields:** **Resolved in [ADR-010](../06-technical-decisions/DECISIONS.md) & [ADR-015](../06-technical-decisions/DECISIONS.md)** — `lifestyle_ncd_preventive` (`rules-v1.0.0`) with four allowlisted lifestyle inputs (`max_age_hours: 720`).
- **Synchronous vs. queued risk calculation:** **Resolved in [ADR-013](../06-technical-decisions/DECISIONS.md)** — synchronous internal HTTP call (`<= 2000ms` timeout, `X-Internal-Service-Token`) for Slice 1; Redis + BullMQ (`ADR-008`) for async batch/report jobs.
- **Identity-provider integration flow:** **Resolved in [ADR-011](../06-technical-decisions/DECISIONS.md)** — OIDC/JWT validation boundary (Supabase Auth cloud default + offline JWT test signer).
- **Local development orchestration and object storage:** **Resolved in [ADR-016](../06-technical-decisions/DECISIONS.md) & [ADR-017](../06-technical-decisions/DECISIONS.md)** — Docker Compose (`postgis/postgis:16-3.4`, `redis:7-alpine`, `minio/minio`), Bun (`backend/`), Python 3.12 + `uv` (`ai-services/`), presigned report URLs, and typed synthetic/sandbox integration adapters.

### Remaining pre-production decisions
- Production secret-management service, cloud hosting, observability backend, and performance/RPO/RTO targets (`OPEN-012` in [DECISIONS.md](../06-technical-decisions/DECISIONS.md))
- Live Rwanda facility, map, weather, and external notification vendor contracts (`OPEN-010`)
