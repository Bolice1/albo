# Albo architectural and technical decisions

**Status:** Active decision log — single source of truth for architectural, product-boundary, security, privacy, and AI governance decisions  
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

## 3. Baseline and proposed architecture decision records (ADRs)

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

- **Status:** Proposed (Drafted in ACCESS_CONTROL.md from FR-003, FR-031, FR-035, DP-002)
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

- **Status:** Proposed (ARCHITECTURE §10, §12, DATABASE_SCHEMA §2, TECH_STACK §6, §11)
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

- **Status:** Proposed (SYSTEM_DESIGN §20, PROJECT_STATUS §10)
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

## 4. Open decisions register (`OPEN-001` to `OPEN-012`)

The following decisions are documented across `docs/` (`01`–`05`) and require explicit team sign-off before the corresponding modules or production launch proceed:

| ID | Decision topic | Candidate options / recommendation | Blocking milestone | Primary doc references |
|---|---|---|---|---|
| **OPEN-001** | **First-release geography, languages, target users, and first vertical-slice risk use case** | *Recommended:* Launch first in Rwanda for adult citizens (`18+`, or `16+` per Law N° 058/2021 after legal check), starting with the self-contained `lifestyle_ncd_preventive` indicator (`rules-v1.0.0`) for the first vertical slice before adding weather-dependent malaria/respiratory indicators. Confirm language scope (English, Kinyarwanda, French). | First vertical slice & Phase 1 scope | [PROJECT_SCOPE.md](../01-project-foundation/PROJECT_SCOPE.md) §7, [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md) §3 |
| **OPEN-002** | **Identity provider selection and DP-003 wording alignment** | Managed OIDC provider vs. self-hosted Keycloak vs. confirmed Supabase Auth boundary (with Albo-owned PostgreSQL application tables). Also resolve whether `support_operator` in `API_DOCUMENTATION.md` §4.2 is retained or removed. | First vertical slice Step 1 (Auth) | [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md) §7, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §19–20 |
| **OPEN-003** | **ORM, migration tool, and application table naming (`user_accounts` vs. `users`)** | Select one typed TypeScript ORM + migration runner for NestJS (e.g., Prisma, Drizzle, or TypeORM with `synchronize: false`) and finalize table names and first-release allowlisted `field_code` values. | First vertical slice database migration | [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md) §18, [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md) §16 |
| **OPEN-004** | **Internal NestJS ↔ FastAPI execution mode and service auth** | *Recommended for first vertical slice:* Synchronous HTTP call with strict timeout (`<= 2000ms`) and signed internal service bearer token (or mTLS), adding BullMQ async worker queue for batch/ingestion triggers. | First vertical slice Step 6 (Risk engine call) | [AI_ARCHITECTURE.md](../04-artificial-intelligence/AI_ARCHITECTURE.md) §6–7, §13 |
| **OPEN-005** | **Risk-level vocabulary and display rules** | *Recommended:* Approve discrete levels `low`, `moderate`, `high` (for `status: "complete"`), `null` (for `status: "limited"` and `"failed"`), hiding raw numerical weights from citizen UI to avoid false clinical precision. | First vertical slice Step 7 (Dashboard UI) | [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md) §5.4, §13, [UI_UX.md](../02-architecture-and-engineering/UI_UX.md) §6 |
| **OPEN-006** | **Clinical reviewers and Rwanda emergency / self-harm escalation directory (FR-024)** | Name the qualified health/clinical reviewer(s) for rule-card sign-off and approve the verified Rwanda emergency, ambulance, and mental-health helpline contacts for the escalation card. | First clinical rule approval & before enabling wellbeing check-ins or AI assistant | [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md) §4, §10, [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md) §8 |
| **OPEN-007** | **Rwanda Law N° 058/2021 compliance, NCSA registration, and hosting residency** | Confirm legal controller entity, Data Protection Officer/owner, NCSA registration, 48-hour breach procedure, and hosting region (local Rwanda hosting vs. NCSA-authorized cloud region). Also confirm permanent exclusion of genetic data mentioned in proposal onboarding. | Before collecting any real personal data in production | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §3.1, §12, §18–19 |
| **OPEN-008** | **Data retention periods, deletion grace period, and consent-withdrawal effects** | Approve exact retention durations per data category, backup expiry cycle, and confirm the proposed conservative consent-withdrawal rule (immediately stop future processing and provider access). | Before production launch | [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md) §7.3, §8, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §8.1 |
| **OPEN-009** | **First-release provider portal inclusion vs. facility discovery only** | Decide whether the first public release includes only citizen facility discovery/directions (`FR-026` to `FR-028`) or also provider assignment and portal access (`FR-031` to `FR-034`). (Excluded from the first vertical slice in either case.) | Phase 4 (First preventive-health release scope) | [PROJECT_SCOPE.md](../01-project-foundation/PROJECT_SCOPE.md) §7, [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md) §17, §19 |
| **OPEN-010** | **Rwanda facility, map, weather, air-quality, and notification providers** | Select authoritative Rwanda facility data source (e.g., MoH/RBC registry or approved dataset), map/routing provider, meteorological/air-quality APIs (e.g., Meteo Rwanda / approved weather API), and notification channel. | Before enabling environmental risk use cases, maps, and external alerts | [INTEGRATIONS.md](../02-architecture-and-engineering/INTEGRATIONS.md) §19 |
| **OPEN-011** | **AI assistant first-release inclusion and adapter implementation** | Decide whether the assistant (`Should`) is included in the first release or staged after MVP, and whether it launches as an in-house deterministic template/knowledge-retrieval assistant or uses a residency-compliant external LLM API. | Phase 2 AI evolution / Assistant activation | [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md) §9–12 |
| **OPEN-012** | **Hosting infrastructure, CI/CD, observability backend, and RPO/RTO targets** | Select container hosting platform, secret manager, OpenTelemetry/Grafana observability target, and backup recovery targets (RPO/RTO). | Staging and production deployment setup | [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md) §11, [SECURITY.md](../03-security-and-privacy/SECURITY.md) §20 |
