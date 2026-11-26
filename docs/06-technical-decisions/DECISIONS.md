# Albo architectural and technical decisions

**Status:** Approved — active decision log and single source of truth for architectural, product-boundary, security, privacy, and AI governance decisions  
**Owner:** Shared engineering, architecture, security, and clinical governance team (Apex Phantoms)  
**Related:** [Changelog](CHANGELOG.md), [AGENTS.md](../../AGENTS.md), [Project status](../PROJECT_STATUS.md), [Architecture](../02-architecture-and-engineering/ARCHITECTURE.md), [Tech stack](../02-architecture-and-engineering/TECH_STACK.md), [Access control](../03-security-and-privacy/ACCESS_CONTROL.md), [Data privacy](../03-security-and-privacy/DATA_PRIVACY.md), [AI architecture](../04-artificial-intelligence/AI_ARCHITECTURE.md), [AI safety](../04-artificial-intelligence/AI_SAFETY.md)

## 1. Purpose and governance rule

Rule 5 of [AGENTS.md](../../AGENTS.md) states:

> *Record significant decisions in `docs/06-technical-decisions/DECISIONS.md`.*

This document records the Architecture Decision Records (ADRs) established during the Albo project foundation and tracks the open decisions (`OPEN-*`) that must be resolved before specific features or production health data are enabled.

- **`Accepted (Baseline)`**: Agreed foundation principles recorded in `AGENTS.md`, `PROJECT_SCOPE.md`, `REQUIREMENTS.md`, and `ARCHITECTURE.md`. Code and documentation must enforce these invariants.
- **`Proposed`**: Documented as the recommended engineering direction in `docs/` (`01` through `05`) and ready for team sign-off.
- **`Open / To Decide`**: Requires an explicit selection (e.g., vendor, hosting region, clinical reviewer, or retention period) before the affected module is built or enabled in production.
- **`Superseded`**: Replaced by a newer ADR (never deleted, so historical reasoning remains clear).

## 2. How to add or update a decision

When making or resolving a decision:

1. Add a new `ADR-0XX` section (or promote an `OPEN-0XX` item to an `ADR-0XX`).
2. Record the **Status**, **Date**, **Deciders / Owner**, **Context**, **Decision**, **Consequences**, and **Related documents**.
3. Update the affected contract files in `docs/` (`01`–`05`) in the same pull request.
4. Log the update in [CHANGELOG.md](CHANGELOG.md).

---

## 3. Architecture decision records (ADRs)

### ADR-001 — Modular monolith core backend with a separate internal AI service

- **Status:** Accepted (Baseline — AGENTS.md Rules 2 & 3, ARCHITECTURE §2)
- **Date:** 2026-11-14
- **Context:** Albo needs strong transactional consistency across identity mapping, consent, health inputs, provider assignments, and audit events, while also supporting Python-based risk scoring, analytics, and future machine-learning workflows. Premature microservices would add distributed-systems overhead and increase the risk of authorization bypasses.
- **Decision:** Build the core application backend as a **NestJS (TypeScript) modular monolith** (`backend/`) and isolate specialized rule/AI computation in an **internal-only Python/FastAPI service** (`ai-services/`). The core API is the sole system of record for users, consent, authorization, persistence, and public `/api/v1` routes. The AI service receives only minimum necessary, pre-authorized, PII-free input snapshots from the core API.
- **Consequences:**
  - Single authorization and consent enforcement boundary in NestJS.
  - Python data/ML dependencies remain isolated in `ai-services/`.
  - `ai-services/` must never authenticate end users, check consent, or write directly to client-facing database tables.
- **Related:** [ARCHITECTURE.md](../02-architecture-and-engineering/ARCHITECTURE.md), [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [AI_ARCHITECTURE.md](../04-artificial-intelligence/AI_ARCHITECTURE.md)

### ADR-002 — Deterministic rules and weighted scoring before machine-learning models

- **Status:** Accepted (Baseline — PROJECT_SCOPE §3.2, §4, FR-016, FR-020, AI-006)
- **Date:** 2026-11-14
- **Context:** The proposal outlines a phased transition from rule-based and weighted scoring systems (Stage 3) to machine-learning models as structured data accumulates (Stage 3/5). Deploying unvalidated ML models or training a proprietary LLM without clinical validation and representative Rwandan datasets would create unacceptable safety and fairness risks.
- **Decision:** The first release uses **deterministic, explainable, version-pinned rules and weighted scoring** (`ai-services/risk_engine/`). Machine-learning models (`scikit-learn`, `XGBoost`, etc.) are deferred to Phase 3 (`Later`) and require representative data, clinical validation, calibration, subgroup fairness review, drift monitoring, and instant rollback to rules. Albo will not train a proprietary large language model.
- **Consequences:**
  - Every first-release risk indicator is 100% reproducible (`FR-019`) and inspectable line by line by clinical reviewers.
  - Every calculation records its `rule_model_version` and immutable `input_snapshot`.
- **Related:** [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md), [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md)

### ADR-003 — Non-diagnostic framing and safe degradation (`limited` status) on missing or stale data

- **Status:** Accepted (Baseline — AGENTS.md Rule 10, FR-012 to FR-014, FR-018, NFR-005)
- **Date:** 2026-11-14 (expanded 2026-11-19)
- **Context:** A preventive digital-health tool can cause severe harm if a user interprets a risk score as a medical diagnosis or if missing/stale inputs default to a reassuring "low risk" result (`HAZ-01`, `T-037`).
- **Decision:**
  1. All outputs are framed and structured strictly as **preventive risk indicators** (`low`, `moderate`, `high`), never as diagnoses or prescriptions.
  2. Every completed indicator returns contributing factors, data provenance, calculation timestamp, rule version, mandatory non-diagnostic limitations, and approved preventive next steps.
  3. Whenever required inputs are missing, older than `max_age_hours`, invalid, or from an unavailable source, the system returns `status: "limited"` and `level: null`—never `"low"`.
- **Consequences:**
  - UI components require limitation and provenance fields as mandatory props and render `limited` states with neutral (non-green) styling.
- **Related:** [UI_UX.md](../02-architecture-and-engineering/UI_UX.md), [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md), [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md)

### ADR-004 — Deny-by-default, relationship- and consent-aware access control

- **Status:** Accepted (Approved in ACCESS_CONTROL.md — FR-003, FR-031, FR-035, DP-002)
- **Date:** 2026-11-18
- **Context:** Albo serves citizens, healthcare providers, facility users, community health workers, and platform administrators. Standard role-based access control (RBAC) where any "provider" or "admin" can read all patient records violates privacy and least privilege.
- **Decision:**
  1. Enforce an 8-step server-side authorization pipeline: authenticate token → verify active account → check role permission → verify ownership or active assignment/organization membership → verify active consent for the specific purpose and version → verify operation rules → filter response fields → write redacted audit event.
  2. Platform administrators manage configuration and accounts without automatic health-record access (`FR-035`).
  3. Cross-user access failures return `404 NOT_FOUND` so record existence is never confirmed (`T-003`).
  4. Emergency "break-glass" override access to another person's health records is **not approved** unless a separate procedure is reviewed and adopted.
- **Consequences:**
  - Every sensitive query filters by authenticated owner or active assignment + consent before pagination.
- **Related:** [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md), [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md)

### ADR-005 — Standards-based external identity provider with isolated application accounts

- **Status:** Accepted (Baseline — DP-003, DATABASE_SCHEMA §4.1–4.2, TECH_STACK §7)
- **Date:** 2026-11-14
- **Context:** Implementing custom password hashing, recovery flows, and token issuance inside Albo increases attack surface, while exposing identity-provider internal tables directly to clients creates tight coupling and data-leakage risk.
- **Decision:** Delegate authentication and token issuance to a standards-based identity provider (managed OIDC, Keycloak, or a strictly bounded Supabase Auth instance — final selection in `OPEN-002`). Albo stores only the immutable `identity_subject_id` mapped 1:1 to a controlled application `user_account` record. Roles, organization memberships, provider assignments, and consent remain inside Albo's PostgreSQL schema.
- **Consequences:**
  - No passwords or recovery secrets in Albo application tables.
  - Identity provider tables are never exposed to the browser client.
- **Related:** [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [SECURITY.md](../03-security-and-privacy/SECURITY.md)

### ADR-006 — Deterministic emergency, severe-symptom, and self-harm escalation

- **Status:** Accepted (Baseline — FR-024, FR-025, AI_SAFETY §4)
- **Date:** 2026-11-14 (expanded 2026-11-19)
- **Context:** Users completing wellbeing check-ins or interacting with the AI assistant may express intentional self-harm, suicidal ideation, or acute physical danger signs. Generative language models cannot be trusted to improvise crisis counseling or invent hotline numbers (`HAZ-02`, `HAZ-04`, `T-041`).
- **Decision:** All check-in submissions and assistant turns pass through a deterministic pre-model safety and crisis screener first. When an emergency or self-harm signal is detected, generative AI and routine scoring halt immediately, and the system returns a pre-approved, clinically reviewed escalation card with verified Rwanda emergency/crisis contacts and nearby verified facilities from the core API database. The assistant and mental-wellness hub remain gated behind feature flags until the escalation directory is approved (`OPEN-006`).
- **Consequences:**
  - Crisis escalation works deterministically even if an external AI provider is offline.
  - Zero hallucinated facility names or phone numbers.
- **Related:** [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md), [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md)

### ADR-007 — Synthetic-only data in development/testing and zero sensitive-payload logging

- **Status:** Accepted (Baseline — AGENTS.md Rules 7–9 & 12, DP-004, DP-005, DP-008, FR-039)
- **Date:** 2026-11-11 (expanded 2026-11-19)
- **Context:** Real patient records or sensitive health inputs in development environments, test fixtures, CI logs, or audit events create unacceptable breach risks.
- **Decision:**
  1. All non-production environments (`development`, `test`, `staging`), seed scripts, unit tests, AI evaluation sets, and screenshots use **100% synthetic data**.
  2. Application logs, OpenTelemetry traces, Pydantic/DTO validation error logs, and `audit_event` records use strict field allowlists and never store raw health input values, check-in responses, precise GPS coordinates, bearer tokens, or raw AI prompts/responses.
- **Consequences:**
  - Custom validation exception handlers and redaction tests are required in both NestJS and FastAPI.
- **Related:** [CODING_STANDARDS.md](../05-development-standards/CODING_STANDARDS.md), [TESTING_STRATEGY.md](../05-development-standards/TESTING_STRATEGY.md), [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md)

### ADR-008 — PostgreSQL/PostGIS primary store, Redis/BullMQ for jobs only, and Docker packaging without initial Kubernetes

- **Status:** Accepted (ARCHITECTURE §10, §12, DATABASE_SCHEMA §2, TECH_STACK §6, §11)
- **Date:** 2026-11-14
- **Context:** The team needs reliable relational constraints and spatial facility queries without premature infrastructure complexity.
- **Decision:**
  1. Use **PostgreSQL** as the sole durable source of truth for application records, enabling **PostGIS** only for approved facility/spatial queries.
  2. Use **Redis + BullMQ** strictly for cache, rate limits, and idempotent background jobs—never as durable health-record storage.
  3. Package services as hardened multi-stage **Docker** containers (`frontend`, `core-api`, `job-worker`, `ai-services`) without Kubernetes for the initial deployment.
- **Consequences:**
  - Simple local and staging orchestration via Docker Compose / managed containers.
- **Related:** [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md), [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md)

### ADR-009 — First implementation target is a single citizen vertical slice

- **Status:** Accepted (SYSTEM_DESIGN §20, PROJECT_STATUS §10)
- **Date:** 2026-11-14
- **Context:** Attempting to build all disease use cases, external weather/map integrations, provider portals, and the AI assistant simultaneously risks integration failure and unverified safety boundaries.
- **Decision:** Implement and verify **one complete end-to-end citizen vertical slice** first:
  1. Citizen signs in → core API creates/retrieves `user_account`.
  2. Citizen grants consent for health-input storage and risk calculation.
  3. Citizen submits one approved synthetic health/lifestyle input stored with provenance.
  4. Core API creates an immutable `input_snapshot` and calls `ai-services/` (`rules-v1.0.0`) for one non-diagnostic risk indicator.
  5. Dashboard renders the risk level, contributing factor, limitation, and next step (and `limited` state when missing/stale).
  6. Automated tests verify cross-user `404 NOT_FOUND` isolation and redacted audit events.
- **Consequences:**
  - Proves the entire stack (`Next.js` ↔ `NestJS` ↔ `PostgreSQL` ↔ `FastAPI`) before expanding to multiple use cases or external adapters.
- **Related:** [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [TESTING_STRATEGY.md](../05-development-standards/TESTING_STRATEGY.md)

---

### ADR-010 — First vertical-slice geography, target population, and risk use case (`lifestyle_ncd_preventive`, `rules-v1.0.0`)

- **Status:** Accepted (Resolves `OPEN-001` for first vertical slice)
- **Date:** 2026-11-19
- **Context:** The first vertical slice must prove the full end-to-end flow (sign-in → consent → health input → risk calculation → dashboard explanation → audit & authorization isolation) without blocking on external third-party meteorological or air-quality API contracts. In the proposal, NCDs account for 46–61.2% of deaths in Rwanda and depend on modifiable lifestyle inputs that a citizen can self-report directly.
- **Decision:**
  1. **Target geography and users:** First release targets **adult citizens in Rwanda (`18+`)**, avoiding minor/guardian consent flows in Slice 1 (`DATA_PRIVACY.md` §10).
  2. **Languages:** Launch Slice 1 in **English** while using structured localization keys (`explanation_key`, `action_code`) so **Kinyarwanda** and **French** translations can be plugged in without changing backend or AI-service contracts.
  3. **First vertical-slice risk use case:** Approve `lifestyle_ncd_preventive` (`rules-v1.0.0`), evaluating four allowlisted self-reported inputs (freshness window `max_age_hours: 720` / 30 days):
     - `physical_activity_minutes_per_week` (integer, `0`–`5040`, unit `min/week`; required)
     - `tobacco_use_status` (enum: `never`, `former`, `current`; required)
     - `sleep_hours_avg` (numeric, `0`–`24`, unit `hours/day`; optional)
     - `diet_fruit_veg_servings_per_day` (integer, `0`–`20`, unit `servings/day`; optional)
- **Consequences:**
  - Slice 1 is 100% self-contained and deterministic.
  - Missing or stale required inputs (`physical_activity_minutes_per_week` or `tobacco_use_status`) return `status: "limited"` and `level: null`.
- **Related:** [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md), [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md), [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md)

### ADR-011 — Standards-based OIDC / JWT authentication boundary (Supabase Auth & local OIDC compatible) and removal of `support_operator`

- **Status:** Accepted (Resolves `OPEN-002` and the two discrepancies in `ACCESS_CONTROL.md` §20)
- **Date:** 2026-11-19
- **Context:** Requirement `DP-003` references Supabase/Auth-managed identity data, while `TECH_STACK.md` §7 allows a standards-based OIDC provider, Keycloak, or Supabase Auth boundary. In addition, `API_DOCUMENTATION.md` §4.2 listed `support_operator` as a candidate role even though `REQUIREMENTS.md` §2 never defined it as an actor.
- **Decision:**
  1. **OIDC/JWT verification boundary:** The NestJS core API validates standard signed JWT access tokens (`iss`, `aud`, `exp`, `sub`, signature via JWKS/secret). **Supabase Auth** is the default managed identity boundary for cloud staging/production (satisfying `DP-003`), while local development and CI tests use a deterministic OIDC-compatible JWT signer with identical claims so tests run 100% offline.
  2. **Role consolidation:** Remove the undefined `support_operator` candidate role. The approved role enum is strictly: `citizen`, `provider`, `facility_user`, `community_health_worker`, and `platform_admin`. Citizen vertical-slice `/me/*` routes serve `citizen` callers, administrative routes (`/api/v1/admin/*`) serve `platform_admin` callers (with zero automatic health-record access per `FR-035`), and provider, community-health-worker, and facility workflows remain runtime-gated behind `FEATURE_PROVIDER_PORTAL_ENABLED` pending `OPEN-009` (see `ADR-015` and `ADR-017`).
- **Consequences:**
  - Resolves both discrepancies in `ACCESS_CONTROL.md` §20.
  - Local tests and CI never depend on internet connectivity to an external auth cloud.
- **Related:** [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md), [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md), [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md)

### ADR-012 — Prisma ORM + Prisma Migrate with `user_accounts` domain table naming

- **Status:** Accepted (Resolves `OPEN-003`)
- **Date:** 2026-11-19
- **Context:** `DATABASE_SCHEMA.md` §18 left the choice of TypeScript ORM, migration tool, and account table naming (`users`, `profiles`, or `user_accounts`) open.
- **Decision:**
  1. Adopt **Prisma ORM** and **Prisma Migrate** (`prisma migrate deploy` in production, never `db push`) for the NestJS core API against PostgreSQL/PostGIS.
  2. Standardize the primary application account table name as **`user_accounts`** (matching `DATABASE_SCHEMA.md` §4.2), keeping public API routes under `/api/v1/me` and `/api/v1/me/profile`.
- **Consequences:**
  - End-to-end compile-time type safety between PostgreSQL schema, NestJS repositories, and versioned SQL migrations.
- **Related:** [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md), [CODING_STANDARDS.md](../05-development-standards/CODING_STANDARDS.md)

### ADR-013 — Synchronous internal HTTP call (`<= 2000ms` timeout) with signed service authentication for Slice 1 risk calculation

- **Status:** Accepted (Resolves `OPEN-004`)
- **Date:** 2026-11-19
- **Context:** Deterministic rule evaluation in `ai-services/risk_engine/` takes single-digit milliseconds in memory. Requiring Redis/BullMQ queue polling for a single user-triggered rule calculation in Slice 1 adds unnecessary latency and moving parts, whereas batch/ingestion recalculations and reports still benefit from asynchronous queues later.
- **Decision:**
  1. For the first vertical slice (`POST /api/v1/me/risk-assessments`), the NestJS core API calls `ai-services` (`POST /internal/v1/risk-assessments/calculate`) **synchronously over the private network** with a strict **`2000ms` timeout**.
  2. Internal requests are authenticated with a dedicated **`X-Internal-Service-Token`** (shared high-entropy secret / HMAC verified in constant time by FastAPI middleware) plus `X-Request-Id` propagation.
  3. If `ai-services` times out or is unreachable, the core API records and returns a safe `failed`/unavailable status—never inferring low risk.
- **Consequences:**
  - Immediate response for citizen-triggered rule assessments in Slice 1 while preserving the exact internal contract for future BullMQ workers.
- **Related:** [AI_ARCHITECTURE.md](../04-artificial-intelligence/AI_ARCHITECTURE.md), [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [SECURITY.md](../03-security-and-privacy/SECURITY.md)

### ADR-014 — Standardized discrete risk-level vocabulary (`low`, `moderate`, `high`, and `null` when `limited` or `failed`)

- **Status:** Accepted (Resolves `OPEN-005`)
- **Date:** 2026-11-19
- **Context:** `UI_UX.md` §6, `DATABASE_SCHEMA.md` §18, and `RISK_SCORING.md` §5.4 required final sign-off on the risk-level vocabulary and whether raw numeric point totals are exposed to citizens.
- **Decision:**
  1. Standardize `risk_assessment.status` as `queued | processing | complete | limited | failed | superseded`.
  2. Standardize `risk_assessment.level` as **`low | moderate | high`** when `status === "complete"`, and **`null`** whenever `status` is `"limited"`, `"failed"`, `"queued"`, or `"processing"`.
  3. Do **not** display raw numerical weight sums or percentages in the citizen UI; display the discrete level (`low`, `moderate`, `high`), ordered contributing factors, provenance timestamp, rule version, mandatory non-diagnostic limitations, and preventive next steps.
- **Consequences:**
  - Prevents false clinical precision and prevents clinical staging confusion (`mild`, `severe`, `positive`, `diagnosed` are forbidden).
- **Related:** [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md), [UI_UX.md](../02-architecture-and-engineering/UI_UX.md), [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md)

### ADR-015 — Resolution of Phase 1 contract discrepancies

- **Status:** Accepted (Synchronizes Phase 1 API, schema, security, privacy, and AI contracts)
- **Date:** 2026-11-25
- **Deciders / Owner:** Architecture, Core API, Security/Privacy, and AI Governance leads (Apex Phantoms)
- **Context:** Pre-implementation contract verification surfaced minor field-naming, consent-code, role-wording, open-decision, and phase cross-reference discrepancies across `docs/` that would otherwise force engineers or AI agents to invent conventions in violation of `AGENTS.md` Rule 1.
- **Decision:**
  1. **Standardize `rule_model_version` with full semver:** Use `rule_model_version` (e.g., `"rules-v1.0.0"`) uniformly across public `/api/v1` responses, internal `/internal/v1` AI-service contracts, and PostgreSQL records—replacing `rule_set_version: "rules-v1"` in `API_DOCUMENTATION.md` §8.4 and `CODING_STANDARDS.md` §3.1.
  2. **Standardize use-case code without version suffix:** Use `lifestyle_ncd_preventive` everywhere (removing `_v1` in `RISK_SCORING.md` §5.1) because semantic version metadata always travels separately in `rule_model_version`.
  3. **Canonical versioned (`v1`) consent purpose codes:** Standardize the nine machine-readable `consent_purpose.code` identifiers (at `version: "v1"`) derived from `DATA_PRIVACY.md` §6 for backend enforcement:
     - `health_input_storage` — storing approved self-reported health and lifestyle inputs
     - `preventive_risk_calculation` — calculating non-diagnostic preventive risk indicators
     - `wellbeing_check_ins` — storing and safety-screening structured wellbeing check-ins
     - `environmental_context` — using area-level location for environmental observations
     - `facility_location_search` — using bounded location criteria for healthcare facility discovery
     - `provider_data_sharing` — scoped sharing of permitted records with an assigned provider or CHW
     - `notifications_delivery` — opt-in preventive reminders and notifications
     - `report_generation` — generating personal printable trend and risk reports
     - `assistant_conversations` — safety-gated AI assistant turns and explanations
     *(Approved for synthetic development and automated testing; final production legal wording and retention periods remain gated on `OPEN-007` and `OPEN-008`.)*
  4. **Close resolved open-decision bullets:** Mark items already settled by `ADR-010`–`ADR-014` (and `ADR-015`–`ADR-017`) as resolved with explicit ADR links across `SECURITY.md` §20, `AI_ARCHITECTURE.md` §13, `ARCHITECTURE.md` §17, `TECH_STACK.md` §16, `SYSTEM_DESIGN.md` §22, `DATABASE_SCHEMA.md` §18, `RISK_SCORING.md` §13, `MODEL_DOCUMENTATION.md` §8, and `API_DOCUMENTATION.md` §13.
  5. **Align active role scoping:** Across `ACCESS_CONTROL.md` §17 and `ADR-011`, the role enum is `citizen`, `provider`, `facility_user`, `community_health_worker`, and `platform_admin`. Citizen vertical-slice `/me/*` routes serve `citizen` callers, administrative routes (`/api/v1/admin/*`) serve `platform_admin` callers (with zero automatic health-record access per `FR-035`), and provider/CHW/facility workflows remain runtime-gated behind `FEATURE_PROVIDER_PORTAL_ENABLED` pending `OPEN-009`.
  6. **Cross-reference and rule-card clarifications:**
     - Fix phase/section cross-references in `RISK_SCORING.md` §10 ("Phase 7" → Roadmap Phase 6), `AI_ASSISTANT.md` §1 (mental-wellness hub → Roadmap Phase 5 / Scope Phase 2), `DECISIONS.md` `OPEN-009` ("Phase 4" → Roadmap Phase 3), and `TESTING_STRATEGY.md` §6 (`PROJECT_STATUS.md` §9 → §10).
     - Add a disambiguation note in `ROADMAP.md` §1 clarifying that the "Phase 1–3" labels in `AI_ARCHITECTURE.md` §5 denote AI-evolution stages rather than product delivery roadmap phases.
     - Explicitly note in `MODEL_DOCUMENTATION.md` §6.1 (`lifestyle_ncd_preventive` — `rules-v1.0.0`) that `diet_fruit_veg_servings_per_day` of `2`–`4` servings/day is neutral (`+0` points, emitting no `contributing_factors` entry) pending clinical reviewer sign-off under `OPEN-006`.
- **Consequences:**
  - Eliminates naming drift between NestJS DTOs, Prisma models, and FastAPI Pydantic schemas.
  - Provides deterministic, seeded consent purpose codes for authorization integration tests without pre-empting legal/privacy production review.
- **Related documents:** [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md), [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md), [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md), [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md), [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md), [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md), [CODING_STANDARDS.md](../05-development-standards/CODING_STANDARDS.md), [TESTING_STRATEGY.md](../05-development-standards/TESTING_STRATEGY.md), [ROADMAP.md](../01-project-foundation/ROADMAP.md)

### ADR-016 — Backend-only onboarding boundary and toolchain selection (Bun + Python 3.12 / `uv` + Docker + GitHub Actions)

- **Status:** Accepted (Supersedes initial `pnpm`/`Node` assumption and scopes engineering onboarding boundary)
- **Date:** 2026-11-25
- **Deciders / Owner:** Project Owner and Lead Engineering / Architecture Team (Apex Phantoms)
- **Context:** To establish rock-solid domain, authorization, persistence, and AI safety boundaries first without coupling backend velocity to UI scaffolding, project leadership directed that initial repository onboarding focus exclusively on `backend/`, `ai-services/`, `infrastructure/`, and CI. In addition, the team required fast, deterministic lockfile-enforced package managers across TypeScript and Python.
- **Decision:**
  1. **Backend and AI onboarding scope boundary:** Initial engineering onboarding implements **`backend/`** (NestJS modular monolith + BullMQ job worker), **`ai-services/`** (FastAPI deterministic risk engine, safety screeners, and bounded adapters), **`infrastructure/`** (Docker Compose and container hardening), and **CI**. The **`frontend/`** Next.js web application remains part of the target product architecture (`ADR-008`, `TECH_STACK.md` §3, `UI_UX.md`) but is **explicitly deferred** to a separate frontend onboarding track.
  2. **Bun for `backend/`:** Adopt **Bun** (`bun.lock`, `bun install --frozen-lockfile`, `bun run ...`) in place of `npm` or `pnpm` as the JavaScript/TypeScript package manager, script runner, and container build/runtime toolchain for `backend/`.
  3. **Python 3.12 + `uv` for `ai-services/`:** Standardize on **Python 3.12** (`python:3.12-slim` container base) managed by **`uv`** (`pyproject.toml` + committed `uv.lock`, `uv sync --frozen`) with `ruff`, `mypy --strict`, and `pytest`.
  4. **Local infrastructure and CI:** Standardize local/test orchestration in `docker-compose.yml` using `postgis/postgis:16-3.4`, `redis:7-alpine`, and `minio/minio` (S3-compatible private object storage), and adopt **GitHub Actions** (`.github/workflows/ci.yml`) for automated pull-request verification (while cloud hosting and production CD remain tracked under `OPEN-012`).
- **Consequences:**
  - Zero `frontend/` files, `package-lock.json`, or `pnpm-lock.yaml` are created during backend/AI onboarding; API contracts and UI safety fields (`limitations`, `contributing_factors`, `calculated_at`, `recommended_next_steps`) are verified end-to-end via integration and OpenAPI contract tests.
  - Fast, reproducible dependency resolution in local development, Docker multi-stage builds, and GitHub Actions CI via `bun install --frozen-lockfile` and `uv sync --frozen`.
- **Related documents:** [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md), [ARCHITECTURE.md](../02-architecture-and-engineering/ARCHITECTURE.md), [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [CODING_STANDARDS.md](../05-development-standards/CODING_STANDARDS.md), [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md), [TESTING_STRATEGY.md](../05-development-standards/TESTING_STRATEGY.md)

### ADR-017 — Runtime governance circuit breakers, supersession semantics, and complete backend domain contracts

- **Status:** Accepted (Governs safe coexistence of complete backend/AI domain code with `OPEN-006`–`OPEN-012` pre-production gates)
- **Date:** 2026-11-25
- **Deciders / Owner:** Architecture, Security/Privacy, and AI Safety leads (Apex Phantoms)
- **Context:** Onboarding the complete backend and AI domain surface (`identity-access`, `consent`, `health-profile`, `risk-assessment`, `facilities-care`, `notifications-reports`, `assistant`, `consultations`, `admin`, and `audit`) requires strict technical enforcement so features gated on clinical, legal, or vendor sign-off (`OPEN-006`–`OPEN-012`) cannot be accidentally exposed in production while still remaining 100% testable on synthetic data in `development` and `test`. In addition, health-input rectification (`FR-005`, `FR-008`, `SYSTEM_DESIGN.md` §7, `DATA_PRIVACY.md` §9) and external integration/storage ports needed explicit implementation semantics.
- **Decision:**
  1. **Runtime governance circuit breakers (feature flags):** Enforce startup-validated runtime flags across `backend/`:
     - `FEATURE_PROVIDER_PORTAL_ENABLED` — gates `/api/v1/provider/*` and provider-initiated consultation workflows (`OPEN-009`)
     - `FEATURE_ASSISTANT_ENABLED` — gates `/api/v1/assistant/*` (`OPEN-006`, `OPEN-011`)
     - `FEATURE_CHECKINS_ENABLED` — gates `/api/v1/me/check-ins` (`OPEN-006`)
     - `APPROVED_RISK_RULE_VERSIONS` — explicit allowlist of permitted `use_case_code:rule_model_version` pairs (defaulting to `lifestyle_ncd_preventive:rules-v1.0.0`)
     In `production`, gated flags default conservatively to `false` (returning a safe `503 FEATURE_DISABLED` / `unavailable` state when disabled), while `development` and `test` environments enable full automated verification exclusively against synthetic fixtures.
  2. **Immutable health-input supersession (`PATCH /api/v1/me/health-inputs/:inputId`):** Correcting a health input never overwrites historical values in place. Inside a single database transaction, the existing `health_inputs` row is marked `status = 'superseded'` and a new `status = 'active'` row is inserted with `supersedes_input_id` pointing to the prior row, preserving auditability and `input_snapshot` reproducibility (`SYSTEM_DESIGN.md` §7, `DATA_PRIVACY.md` §9).
  3. **Typed integration adapters and private report object storage:** External weather/environmental feeds, map/routing lookups, and notification delivery channels are isolated behind typed adapter interfaces in `backend/src/integrations/` backed by deterministic synthetic/sandbox implementations until `OPEN-010` vendor contracts are approved. Generated personal reports (`POST /api/v1/me/reports`) are stored in private S3-compatible object storage (`minio/minio` in local/test environments) and accessed exclusively via short-lived, owner-authorized presigned URLs (`INTEGRATIONS.md` §14).
- **Consequences:**
  - Full domain logic, authorization matrices, consent withdrawal, crisis escalation, and adapter fallbacks are continuously verified in CI without violating clinical or regulatory pre-production gates.
  - Historical risk assessments remain 100% reproducible even after a citizen corrects a self-reported health input.
- **Related documents:** [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md), [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md), [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [INTEGRATIONS.md](../02-architecture-and-engineering/INTEGRATIONS.md), [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md), [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md), [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md)

---

## 4. Remaining open decisions register (`OPEN-006` to `OPEN-012` — post-Slice 1 & pre-production gates)

The Phase 1 foundation, toolchain, and first vertical-slice technical decisions (`OPEN-001` through `OPEN-005` plus contract alignments) are **resolved and recorded in `ADR-010` through `ADR-017` above**. The remaining operational, clinical, vendor, and regulatory decisions below apply before enabling gated modules in production or collecting live citizen data:

| ID | Decision topic | Candidate options / recommendation | Blocking milestone | Primary doc references |
|---|---|---|---|---|
| **OPEN-006** | **Clinical reviewers and Rwanda emergency / self-harm escalation directory (FR-024)** | Name the qualified health/clinical reviewer(s) for production rule sign-off (including reviewing whether `2`–`4` fruit/veg servings/day in `rules-v1.0.0` remains silent/neutral) and approve the verified Rwanda emergency, ambulance, and mental-health helpline contacts for the escalation card. | Before enabling `FEATURE_CHECKINS_ENABLED`, `FEATURE_ASSISTANT_ENABLED`, or production clinical release | [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md) §4, §10, [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md) §6.1, §8 |
| **OPEN-007** | **Rwanda Law N° 058/2021 compliance, NCSA registration, and hosting residency** | Confirm legal controller entity, Data Protection Officer/owner, NCSA registration, final production consent wording, 48-hour breach procedure, and hosting region (local Rwanda hosting vs. NCSA-authorized cloud region). Genetic data mentioned in the proposal remains permanently excluded unless separately approved. | Before collecting any real personal data in production | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §3.1, §6, §12, §18–19 |
| **OPEN-008** | **Data retention periods, deletion grace period, and consent-withdrawal effects** | Approve exact retention durations per data category, backup expiry cycle, and confirm the conservative consent-withdrawal rule (immediately stop future processing and provider access). | Before production launch | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §7.3, §8, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §8.1 |
| **OPEN-009** | **First-release provider portal inclusion vs. facility discovery only** | Decide whether the first public release includes only citizen facility discovery/directions (`FR-026` to `FR-028`) or also enables `FEATURE_PROVIDER_PORTAL_ENABLED` for provider assignment and portal access (`FR-031` to `FR-034`). | Roadmap Phase 3 (First preventive-health release scope) | [PROJECT_SCOPE.md](../01-project-foundation/PROJECT_SCOPE.md) §7, [ROADMAP.md](../01-project-foundation/ROADMAP.md) §3, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §17, §19 |
| **OPEN-010** | **Rwanda facility, map, weather, air-quality, and notification providers** | Select authoritative Rwanda facility data source (e.g., MoH/RBC registry or approved dataset), map/routing provider, meteorological/air-quality APIs (e.g., Meteo Rwanda / approved weather API), and external notification channel to replace synthetic/sandbox adapters (`ADR-017`). | Before enabling live environmental risk use cases, external maps, and external alerts | [INTEGRATIONS.md](../02-architecture-and-engineering/INTEGRATIONS.md) §19 |
| **OPEN-011** | **AI assistant first-release inclusion and adapter implementation** | Decide whether the assistant (`Should`, gated behind `FEATURE_ASSISTANT_ENABLED`) is included in the first release or staged after MVP, and whether it launches as an in-house deterministic template/knowledge-retrieval assistant or uses a residency-compliant external LLM API. | AI Evolution Stage 2 / Roadmap Phase 5 (Assistant activation) | [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md) §9–12 |
| **OPEN-012** | **Production hosting infrastructure, CD target, observability backend, and RPO/RTO targets** | Select production container hosting platform, production S3/object-storage vendor, secret manager, OpenTelemetry/Grafana observability target, and backup recovery targets (RPO/RTO). *(GitHub Actions is adopted for CI per `ADR-016`.)* | Staging and production deployment setup | [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md) §11, [SECURITY.md](../03-security-and-privacy/SECURITY.md) §20 |
