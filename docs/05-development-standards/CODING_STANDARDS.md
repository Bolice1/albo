# Albo coding standards

**Status:** Proposed — applies to all future application, AI, database, and infrastructure code  
**Owner:** Shared engineering team (Apex Phantoms / Albo contributors)  
**Related:** [Testing strategy](TESTING_STRATEGY.md), [Deployment](DEPLOYMENT.md), [Contributing](CONTRIBUTING.md), [AGENTS.md](../../AGENTS.md), [Architecture](../02-architecture-and-engineering/ARCHITECTURE.md), [System design](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [Tech stack](../02-architecture-and-engineering/TECH_STACK.md), [API documentation](../02-architecture-and-engineering/API_DOCUMENTATION.md), [Database schema](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [Security](../03-security-and-privacy/SECURITY.md), [Data privacy](../03-security-and-privacy/DATA_PRIVACY.md), [AI safety](../04-artificial-intelligence/AI_SAFETY.md)

## 1. Purpose and scope

This document defines the coding standards, structural conventions, type-safety rules, and security/privacy guardrails for all human developers and AI coding agents working on Albo across:

- **`frontend/`** — Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **`backend/`** — NestJS modular monolith, TypeScript, PostgreSQL/PostGIS, Redis/BullMQ
- **`ai-services/`** — Python 3.11+, FastAPI, Pydantic, deterministic risk engine, safety filters, and future model adapters
- **`infrastructure/`** — Docker, CI/CD, and local development configuration

Every contributor and AI agent must follow both [AGENTS.md](../../AGENTS.md) and this document. When implementation and documentation disagree, stop and resolve the discrepancy in the documentation before writing code.

## 2. Universal engineering rules

1. **Documentation-driven contracts.** Do not invent undocumented endpoints, database fields, risk rules, or permissions (AGENTS.md Rule 1). Every feature maps to an approved requirement in [REQUIREMENTS.md](../01-project-foundation/REQUIREMENTS.md).
2. **Respect component boundaries.**
   - **`frontend/`** owns presentation, accessibility, form state, and client navigation. It never makes trusted authorization, consent, or risk-scoring decisions (ARCHITECTURE §4, §6).
   - **`backend/`** owns public API endpoints, token validation, authorization, consent checks, business workflows, durable persistence, external-provider adapters, and audit events.
   - **`ai-services/`** owns stateless rule evaluation, weighted scoring, data preprocessing, safety classification, and model adapters. It never authenticates end users, checks consent, or queries arbitrary database tables (ARCHITECTURE §9).
3. **Strict typing at every boundary.** TypeScript runs with `"strict": true` (no implicit `any`); Python runs with strict Pydantic v2 models and `mypy`/`pyright` type checking.
4. **No secrets or real patient data in code.** Credentials, tokens, API keys, and real health records must never appear in source files, comments, commit messages, test fixtures, or logs (AGENTS.md Rules 7–9, DP-004, DP-005).
5. **Zero sensitive-payload logging.** Logger calls and exception handlers must never dump full request bodies, health inputs, wellbeing responses, precise GPS coordinates, authorization headers, or AI prompts/responses (AGENTS.md Rule 12, DP-008).
6. **Non-diagnostic framing in code and copy.** Variable names, API fields, enum values, and UI strings must reflect **preventive risk indicators** (`level: "low" | "moderate" | "high"`, `status: "complete" | "limited" | "failed"`)—never clinical diagnosis states (`diagnosed`, `positive`, `negative`, `prescribed`) (AGENTS.md Rule 10, FR-013, AI-004).
7. **Small, testable units.** Pure domain and scoring functions are separated from HTTP transport, ORM queries, and external network calls so they can be unit-tested deterministically.

## 3. Repository layout and file naming

Following SYSTEM_DESIGN §4:

```text
frontend/
  src/
    app/                  Next.js App Router pages and layouts
    components/           Reusable accessible UI components (shadcn/ui + domain components)
    features/             Feature-scoped hooks, client schemas, and view helpers
    lib/                  Typed API client, date/format utilities, constants
  tests/                  Component and Playwright E2E tests

backend/
  src/
    modules/
      identity-access/    Auth token mapping, roles, organizations, assignments, policy guard
      consent/            Consent purposes, records, withdrawal logic
      health-profile/     Allowlisted health inputs and wellbeing check-ins
      risk-assessment/    Input snapshots, AI-service orchestration, assessment storage
      facilities-care/    Facilities, services, geospatial queries, referrals
      notifications-reports/
      audit/              Append-oriented audit event writer
    common/               Guards, interceptors, error filter, redacted logger, request-ID middleware
    database/             ORM schema, reviewed migrations, synthetic seed scripts
    integrations/         External adapters (identity, weather, maps, notifications, ai-service client)
    jobs/                 BullMQ queue processors
  test/                   Unit, integration, and authorization boundary tests

ai-services/
  app/
    main.py
    contracts/            Pydantic request/response schemas
    safety/               Pre/post safety filters and emergency/self-harm screeners
  risk_engine/            Versioned declarative rules and weighted scoring functions
  data_processing/        Completeness, range, unit, and freshness validators
  model_adapters/         Interfaces for rule runners, future ML artifacts, or assistant adapters
  evaluation/             Golden synthetic evaluation sets and benchmark runners
  tests/                  Pytest suites
```

### 3.1 Naming conventions

| Context | Convention | Examples |
|---|---|---|
| TypeScript files (NestJS) | `kebab-case` with role suffix | `risk-assessment.controller.ts`, `consent-policy.service.ts`, `create-health-input.dto.ts` |
| React components (Next.js) | `PascalCase.tsx` for components, `kebab-case.ts` for utilities/hooks | `RiskIndicatorCard.tsx`, `use-consent-status.ts` |
| Python modules & functions | `snake_case.py` (PEP 8) | `evaluate_lifestyle_rules.py`, `check_input_freshness()` |
| Classes, types, interfaces, Pydantic models | `PascalCase` | `RiskCalculationRequest`, `ConsentRecord`, `ProviderAssignment` |
| Constants and environment variables | `UPPER_SNAKE_CASE` | `MAX_PAGE_LIMIT`, `AI_SERVICE_TIMEOUT_MS` |
| JSON API fields & database columns | `snake_case` (matching API_DOCUMENTATION.md and DATABASE_SCHEMA.md) | `user_account_id`, `rule_set_version`, `contributing_factors`, `calculated_at` |
| Route paths | Plural `kebab-case` under `/api/v1` | `/api/v1/me/health-inputs`, `/api/v1/me/risk-assessments` |

## 4. TypeScript and NestJS (`backend/`) standards

1. **Module encapsulation:**
   - Each domain module in `backend/src/modules/` exposes a clear service interface and owns its repository/tables.
   - Modules must not bypass another module's service to mutate its tables directly (for example, `risk-assessment` checks consent through the `consent` / `identity-access` policy interface rather than writing raw SQL against `consent_record`).
2. **Caller identity from validated token only:**
   - Controllers extract the authenticated subject via a dedicated decorator (e.g., `@CurrentUser()`) populated by the authentication guard.
   - Never read `user_id` from a query string or request body to determine whose records to read or mutate (API §4.3, T-003, T-004).
3. **Centralized authorization and consent enforcement:**
   - All protected routes use the centralized policy guard/service defined in [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §3 and §11.
   - Queries for user-owned or provider-assigned records must include the owner or active-assignment filter in the database `WHERE` clause before pagination (API §5.4).
   - When a record belongs to another user outside the caller's scope, throw a standard not-found domain exception mapped to `404 NOT_FOUND` so existence is never leaked ([ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §3.2).
4. **DTO validation and serialization:**
   - Validate all incoming payloads, query filters, and route parameters at the controller boundary using strict schema validation (`class-validator` / `zod` with `whitelist: true` and `forbidNonWhitelisted: true`).
   - Health inputs must validate `field_code`, `unit`, and `value` against the approved allowlist; reject unknown clinical fields with `422 VALIDATION_ERROR` (API §8.3).
   - Map outgoing responses through explicit response DTOs so internal columns are never serialized by accident (T-008).
5. **Transactions and auditability:**
   - Wrap multi-step state mutations (e.g., granting/withdrawing consent + writing the `audit_event`, or creating an `input_snapshot` + storing a `risk_assessment`) in a database transaction (ARCHITECTURE §10, NFR-004).
6. **External adapter isolation:**
   - All third-party HTTP calls live in `backend/src/integrations/` behind typed adapter interfaces with explicit timeouts, bounded retries, and safe fallback states (INTEGRATIONS §4, §15).

## 5. Next.js and React (`frontend/`) standards

1. **Zero trust in client state:**
   - Role checks in the UI are for navigation convenience only; the backend enforces all permissions.
   - Never embed private API keys, database URLs, or internal service URLs in `NEXT_PUBLIC_*` environment variables (TECH_STACK §3, DP-004).
2. **Safe risk and uncertainty presentation (UI_UX §6):**
   - Risk indicator components must require `limitations`, `contributing_factors`, `calculated_at`, and `recommended_next_steps` as mandatory props so a developer cannot render a bare risk badge without its non-diagnostic context (UI_UX §13).
   - Render `status: "limited"` or `"unavailable"` with neutral styling ("No current indicator available for this use case")—never default an empty/null state to green or "Low risk" (HAZ-01).
   - Never communicate risk level by color alone; always pair color with an explicit text label and icon/pattern (NFR-011).
3. **Privacy in the browser:**
   - Never put health inputs, risk levels, symptom search terms, or precise GPS coordinates into URL query parameters (`?symptom=...`) where they leak into browser history and referrer headers (TECH_STACK §3).
   - Do not log API responses to `console.log` in committed code.
   - Keep XSS defenses intact: never use `dangerouslySetInnerHTML` on user inputs or AI assistant responses ([SECURITY.md](../03-security-and-privacy/SECURITY.md) §8.2).
4. **Accessibility and performance:**
   - Use semantic HTML, keyboard-accessible controls, visible focus states, and ARIA attributes for dynamic alerts and map controls (UI_UX §12, NFR-012).
   - Design for low-bandwidth and mobile viewports common in Rwanda and resource-constrained settings.

## 6. Python and FastAPI (`ai-services/`) standards

1. **Pure, deterministic scoring functions:**
   - Functions in `risk_engine/` must be pure functions of `(input_snapshot, rule_specification)`.
   - Prohibited inside `risk_engine/`: network calls, database queries, reading system clock (`datetime.now()`), or unseeded random number generation ([RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md) §8).
2. **Pydantic v2 contract enforcement:**
   - All request and response models in `app/contracts/` use Pydantic v2 with `extra="forbid"`.
   - Override FastAPI's `RequestValidationError` handler so that 422 error logs and responses record only the failing field path and validation error code (`field`, `reason`)—never the raw input value submitted by the caller ([AI_ARCHITECTURE.md](../04-artificial-intelligence/AI_ARCHITECTURE.md) §10, T-017).
3. **Rule and model versioning:**
   - Every rule set declares its semantic version constant (`rules-v1.0.0`) and links to its entry in [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md).
   - Never edit an active rule version's weights or thresholds in place; create a new version module and keep existing tests locked to the old version for reproducibility.
4. **Mandatory safety pipeline:**
   - Every check-in and assistant route passes through `app/safety/` pre- and post-filters. No model adapter may return text directly to an endpoint without passing the non-diagnostic and crisis-escalation checks ([AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md) §3, §4).

## 7. Database and SQL standards

1. **Migrations only:** Schema changes are made exclusively through versioned, reviewed migration files—never via `synchronize: true` or ad-hoc SQL in staging/production (DATABASE_SCHEMA §16).
2. **Constraints and integrity:**
   - Enforce foreign keys, `NOT NULL`, and `CHECK` constraints for status and level enums at the PostgreSQL layer.
   - Use controlled deletion behavior (`ON DELETE RESTRICT` or explicit soft-status transitions) rather than blind `ON DELETE CASCADE` on sensitive health, consent, and audit records (DATABASE_SCHEMA §13).
3. **Timestamps and IDs:**
   - Store all timestamps in UTC (`TIMESTAMPTZ`).
   - Use opaque primary keys (UUIDv4/v7) for all externally referenced resources so sequential IDs cannot be enumerated (API §5.2).
4. **Synthetic seeds:**
   - Seed scripts in `backend/src/database/seeds/` must clearly label all records as synthetic (e.g., `@example.invalid` emails, synthetic facility and profile fixtures) and refuse to run when `NODE_ENV === "production"`.

## 8. Error handling and logging standards

### 8.1 Standard API error envelope

All backend errors must serialize to the contract in API §6:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": [],
    "request_id": "req-123"
  }
}
```

Never expose stack traces, SQL table/constraint names, internal hostnames, or vendor error payloads to the client.

### 8.2 Structured logging allowlist

Use a centralized structured JSON logger across `backend/` and `ai-services/`.

| Allowed in logs | Prohibited in logs (AGENTS.md Rule 12, DP-008) |
|---|---|
| `timestamp`, `level`, `service`, `environment` | Passwords, bearer tokens, cookies, API keys, secrets |
| `request_id`, `trace_id`, `span_id` | Health input values, check-in responses, symptom text |
| `http_method`, `route_pattern` (e.g., `/api/v1/me/health-inputs`), `status_code`, `duration_ms` | Assistant prompts, user messages, or model completions |
| `use_case_code`, `rule_model_version`, `assessment_status` (`complete` / `limited` / `failed`) | Risk levels tied to an identifiable person in ordinary application logs |
| Sanitized `error_code` and exception class name | Full name, email, phone number, national ID, or precise latitude/longitude |

## 9. Linting, formatting, and static analysis

Every change must pass automated checks locally and in CI before merge (TECH_STACK §11):

- **TypeScript (`frontend/`, `backend/`):**
  - `eslint` (including security and React/accessibility rules)
  - `prettier` for consistent formatting
  - `tsc --noEmit` with strict mode enabled
- **Python (`ai-services/`):**
  - `ruff` (linting and formatting)
  - `mypy` or `pyright` (strict type checking)
- **Repository-wide:**
  - Secret scanner (e.g., `gitleaks` or `trufflehog`)
  - Dependency vulnerability scanner (`npm audit` / `osv-scanner` / `pip-audit`)

## 10. Code review checklist

Before approving a pull request, reviewers (and AI agents self-reviewing their work) must verify:

- [ ] **Scope & requirement alignment:** Does this change trace to an approved requirement and match `docs/`?
- [ ] **Boundary check:** Is business/auth logic in `backend/`, AI/scoring logic in `ai-services/`, and UI presentation in `frontend/`?
- [ ] **Access & consent:** Does every new or modified endpoint derive the caller from the token, verify role/ownership/assignment, and check active consent?
- [ ] **AI & clinical safety:** Do risk and assistant outputs preserve non-diagnostic wording, limitations, provenance, and `limited` status on missing/stale data?
- [ ] **Privacy & redaction:** Are logs, errors, URLs, and audit events free of raw health inputs, prompts, credentials, and precise coordinates?
- [ ] **Synthetic data:** Do all tests, seeds, and snapshots use 100% synthetic data?
- [ ] **Tests & docs:** Are unit, integration, and authorization tests included, and were affected `docs/` and `DECISIONS.md` updated?
