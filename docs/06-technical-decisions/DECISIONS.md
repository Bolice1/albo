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
  2. **Role consolidation:** Remove the undefined `support_operator` candidate role. The approved role enum is strictly: `citizen`, `provider`, `facility_user`, `community_health_worker`, and `platform_admin` (with only `citizen` and `platform_admin` active in the first vertical slice).
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

---

## 4. Remaining open decisions register (`OPEN-006` to `OPEN-012` — post-Slice 1 & pre-production gates)

The first vertical-slice technical decisions (`OPEN-001` through `OPEN-005`) are now **resolved and promoted to `ADR-010` through `ADR-014` above**. The remaining operational, clinical, vendor, and regulatory decisions below apply before later feature phases or live production citizen data:

| ID | Decision topic | Candidate options / recommendation | Blocking milestone | Primary doc references |
|---|---|---|---|---|
| **OPEN-006** | **Clinical reviewers and Rwanda emergency / self-harm escalation directory (FR-024)** | Name the qualified health/clinical reviewer(s) for production rule sign-off and approve the verified Rwanda emergency, ambulance, and mental-health helpline contacts for the escalation card. | Before enabling wellbeing check-ins, the AI assistant, or production clinical release | [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md) §4, §10, [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md) §8 |
| **OPEN-007** | **Rwanda Law N° 058/2021 compliance, NCSA registration, and hosting residency** | Confirm legal controller entity, Data Protection Officer/owner, NCSA registration, 48-hour breach procedure, and hosting region (local Rwanda hosting vs. NCSA-authorized cloud region). Genetic data mentioned in the proposal remains permanently excluded unless separately approved. | Before collecting any real personal data in production | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §3.1, §12, §18–19 |
| **OPEN-008** | **Data retention periods, deletion grace period, and consent-withdrawal effects** | Approve exact retention durations per data category, backup expiry cycle, and confirm the conservative consent-withdrawal rule (immediately stop future processing and provider access). | Before production launch | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §7.3, §8, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §8.1 |
| **OPEN-009** | **First-release provider portal inclusion vs. facility discovery only** | Decide whether the first public release includes only citizen facility discovery/directions (`FR-026` to `FR-028`) or also provider assignment and portal access (`FR-031` to `FR-034`). | Phase 4 (First preventive-health release scope) | [PROJECT_SCOPE.md](../01-project-foundation/PROJECT_SCOPE.md) §7, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §17, §19 |
| **OPEN-010** | **Rwanda facility, map, weather, air-quality, and notification providers** | Select authoritative Rwanda facility data source (e.g., MoH/RBC registry or approved dataset), map/routing provider, meteorological/air-quality APIs (e.g., Meteo Rwanda / approved weather API), and notification channel. | Before enabling environmental risk use cases, maps, and external alerts | [INTEGRATIONS.md](../02-architecture-and-engineering/INTEGRATIONS.md) §19 |
| **OPEN-011** | **AI assistant first-release inclusion and adapter implementation** | Decide whether the assistant (`Should`) is included in the first release or staged after MVP, and whether it launches as an in-house deterministic template/knowledge-retrieval assistant or uses a residency-compliant external LLM API. | Phase 2 AI evolution / Assistant activation | [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md) §9–12 |
| **OPEN-012** | **Hosting infrastructure, CI/CD, observability backend, and RPO/RTO targets** | Select container hosting platform, secret manager, OpenTelemetry/Grafana observability target, and backup recovery targets (RPO/RTO). | Staging and production deployment setup | [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md) §11, [SECURITY.md](../03-security-and-privacy/SECURITY.md) §20 |
