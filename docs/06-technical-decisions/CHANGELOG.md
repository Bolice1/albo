# Albo changelog

**Status:** Approved — active repository and documentation changelog  
**Format:** Chronological by date and milestone (aligned with [Keep a Changelog](https://keepachangelog.com/))  
**Related:** [Decisions](DECISIONS.md), [Project status](../PROJECT_STATUS.md), [Documentation map](../README.md)

## 1. Purpose

This document tracks major additions, architectural contracts, security/privacy policies, AI governance updates, and future application releases across the Albo repository.

Every significant change to requirements, APIs, database schemas, security/privacy policies, AI rules/models, or application code should add an entry under `[Unreleased]` or the current date milestone.

---

## [Unreleased — Frontend onboarding track (`frontend/`)]

### 2026-11-27 — Auth screens, onboarding, notification settings, and brand mark

- Added sign-in, sign-up and password-reset screens behind a mock `AuthAdapter` with non-revealing errors (FR-001, `ADR-018`).
- Added `/onboarding`: purpose, data-use and AI explanation, consent choices with nothing preselected, and profile name (FR-002–FR-005).
- Added `/settings/notifications`: channels, categories and quiet hours, with consent gating for external channels (FR-015).
- Wired the Settings profile form to `PATCH /me/profile` (mock).
- Adopted the Albo mark and Pillio-inspired visual direction (`ADR-018`).

## [Unreleased — Backend & AI Services Onboarding Complete (`backend/` + `ai-services/`)]

**Implementation status:** All backend (`backend/`) and AI-service (`ai-services/`) domains, PostgreSQL/PostGIS migrations, BullMQ background workers, 7 pre-release AI safety evaluation suites, authorization/IDOR/consent/redaction integration suites, multi-stage non-root Docker packaging, and GitHub Actions CI are **implemented and passing** (`frontend/` deferred per `ADR-016`).

### 2026-11-26 — Complete Backend (`backend/`) and AI Services (`ai-services/`) Phased Implementation

#### Added
- **`ai-services/` (Python 3.12 + `uv` + FastAPI):**
  - Core infrastructure (`app/config.py`, `app/middleware.py`, `app/errors.py`, `app/logging.py`, `app/contracts/`): fail-fast settings validation, `X-Request-Id` propagation, constant-time `hmac.compare_digest` `X-Internal-Service-Token` verification, strict `extra="forbid"` Pydantic v2 schemas, and zero-value-leak error/log redaction (`T-017`).
  - Deterministic risk engine (`data_processing/`, `risk_engine/`, `model_adapters/`): wall-clock-independent completeness/range/freshness validation, pure 8-step evaluation pipeline, active `lifestyle_ncd_preventive` (`rules-v1.0.0`) baseline, 4 governance-gated draft rule sets (`malaria_exposure_preventive`, `respiratory_air_quality_preventive`, `water_hygiene_preventive`, `wellbeing_checkin_screener`), and uniform `RiskModelAdapter` / `TemplateGuidedAssistantAdapter` (`kb-v1.0.0`) interfaces.
  - Safety guardrails & 7 pre-release evaluation suites (`app/safety/`, `evaluation/`, `tests/`): two-category deterministic crisis/emergency screener (`FR-024`), prompt-injection & diagnostic/prescription pre/post guards (`HAZ-01`–`HAZ-09`), and 138 passing `pytest` tests across all 7 required safety suites.
- **`backend/` (Bun + NestJS Modular Monolith + Prisma/PostGIS + BullMQ):**
  - Core platform (`src/config/`, `src/common/`, `src/database/`, `src/health/`, `prisma/`): Zod startup fail-fast validation, `AsyncLocalStorage` request context, API §6 `GlobalExceptionFilter`, redacted `ValidationPipe`, `EnvelopeInterceptor`, opaque cursor pagination, SHA-256 `IdempotencyInterceptor`, Redis Lua `RateLimitGuard`, `/health/live` & `/health/ready`, normalized 27-table PostgreSQL/PostGIS migration (stored generated `geography(Point, 4326)` + GIST index, `risk_assessments_status_level_chk` check constraint, append-only `audit_events` trigger), and non-production synthetic baseline seeding (`bun run seed:synthetic`).
  - Domain modules (`src/modules/` & `src/integrations/` & `src/jobs/`):
    - `identity-access`, `consent`, `audit`: OIDC/JWT verification + offline test JWT signer (`ADR-011`), 8-step `AccessPolicyService` (`404 NOT_FOUND` cross-user isolation), `/api/v1/me/*` (profile, data exports, account deletion requests), `/api/v1/me/consents/*`, `/api/v1/admin/*` (strict separation of duties & zero admin health-record access), and append-only redacted `AuditService`.
    - `health-profile`, `environment`, `risk-assessment`: allowlisted health inputs (`HEALTH_INPUT_FIELD_ALLOWLIST`), immutable supersession (`PATCH /api/v1/me/health-inputs/:id`), safety-screened `/api/v1/me/check-ins` with synchronous crisis escalation, coarse regional `/api/v1/environment` + sandbox weather adapter, PII-free `input_snapshots`, and `<= 2000ms` synchronous + queued `ai-services` risk orchestration degrading safely to `limited`/`failed` (`level: null`).
    - `facilities-care`, `notifications-reports`, `assistant`, `jobs`: PostGIS `ST_DWithin` proximity search, map directions fallback, public provider directory, referrals & consultations, `FEATURE_PROVIDER_PORTAL_ENABLED`-gated Provider Portal (`FR-031`–`FR-034`), quiet-hour zero-PHI notifications, `/api/v1/me/trends`, private S3/MinIO reports with `<= 300s` presigned URLs & `ReportAccess`, grounded `/api/v1/assistant/conversations` with deterministic DB facility injection (`HAZ-04`), and consent-revalidating BullMQ workers (`src/worker.ts`).
- **Infrastructure & CI (`docker-compose.yml`, `infrastructure/`, `.github/workflows/ci.yml`, `.gitleaks.toml`):** Multi-stage non-root `Dockerfile`s (`USER albo`), `edge` + `private` Docker network isolation, Gitleaks config, and 5-job GitHub Actions CI workflow.

---

### 2026-11-25 — Phase 1 contract synchronization, backend-only onboarding boundary, and documentation baseline approval (`ADR-015`–`ADR-017`)

#### Added
- **[DECISIONS.md](DECISIONS.md):**
  - `ADR-015`: Standardized `rule_model_version` (`"rules-v1.0.0"`), use-case code `lifestyle_ncd_preventive`, nine canonical `v1` `consent_purpose.code` identifiers for synthetic development/testing, role-scoping wording across `/me/*`, `/admin/*`, and gated `/provider/*`, resolved open-decision cross-links, phase cross-reference fixes, and neutral `2`–`4` fruit/veg servings/day rule-card note (`OPEN-006`).
  - `ADR-016`: Recorded the backend/AI-only engineering onboarding boundary (`backend/`, `ai-services/`, `infrastructure/`, and GitHub Actions CI, deferring `frontend/` to a separate track) and adopted **Bun** (`bun.lock`, `bun install --frozen-lockfile`) for `backend/` and **Python 3.12 + `uv`** (`uv.lock`) for `ai-services/`.
  - `ADR-017`: Recorded runtime governance circuit breakers (`FEATURE_PROVIDER_PORTAL_ENABLED`, `FEATURE_ASSISTANT_ENABLED`, `FEATURE_CHECKINS_ENABLED`, `APPROVED_RISK_RULE_VERSIONS`), immutable health-input correction supersession (`supersedes_input_id`), typed synthetic/sandbox integration adapters, and private S3/MinIO presigned-URL report storage.

#### Updated
- **Synchronized contracts across `docs/01-*` through `docs/05-*` and `docs/superpowers/specs/`:** Updated `API_DOCUMENTATION.md`, `CODING_STANDARDS.md`, `DEPLOYMENT.md`, `TECH_STACK.md`, `ARCHITECTURE.md`, `SYSTEM_DESIGN.md`, `DATABASE_SCHEMA.md`, `INTEGRATIONS.md`, `ACCESS_CONTROL.md`, `DATA_PRIVACY.md`, `SECURITY.md`, `AI_ARCHITECTURE.md`, `AI_SAFETY.md`, `RISK_SCORING.md`, `AI_ASSISTANT.md`, `MODEL_DOCUMENTATION.md`, `TESTING_STRATEGY.md`, `ROADMAP.md`, and `2026-11-19-phase-1-engineering-foundation-design.md` to align with `ADR-015`–`ADR-017`.
- **All documentation status headers (`docs/01-*` through `docs/06-*`, `docs/README.md`, `docs/PROJECT_STATUS.md`, and root `README.md`):** Marked all 26 domain and governance documents as **Approved** and promoted `ADR-004`, `ADR-008`, and `ADR-009` to `Accepted` (`ADR-001` through `ADR-017` now all `Accepted`).

---

### 2026-11-19 — Artificial intelligence (`04`), development standards (`05`), and technical decisions (`06`)

#### Added
- **Artificial intelligence contracts (`docs/04-artificial-intelligence/`):**
  - [AI_ARCHITECTURE.md](../04-artificial-intelligence/AI_ARCHITECTURE.md): Defined the boundary between the NestJS core API and the internal Python/FastAPI `ai-services/` application, the 6 internal packages (`contracts`, `data_processing`, `risk_engine`, `model_adapters`, `safety`, `evaluation`), the 3-phase evolution gates (deterministic rules → safety-gated assistant → validated ML models), PII-free `/internal/v1/*` JSON schemas, and validation-log redaction rules.
  - [RISK_SCORING.md](../04-artificial-intelligence/RISK_SCORING.md): Defined the preventive indicator vs. diagnosis boundary, candidate proposal risk domains (lifestyle/NCDs, malaria/vector-borne, cholera/water-hygiene, respiratory/air quality, wellbeing/stress), the 8-step evaluation pipeline, declarative rule-set specifications, freshness windows, `low` / `moderate` / `high` levels, and mandatory `status: "limited"` (`level: null`) degradation on missing or stale inputs.
  - [AI_ASSISTANT.md](../04-artificial-intelligence/AI_ASSISTANT.md): Defined the safety-gated (`Should`) conversational assistant contract, permitted vs. prohibited capabilities, pre-model crisis screening, single-user context isolation, deterministic facility-card injection from the core API (preventing hallucinated facilities or phone numbers), and staged implementation options.
  - [MODEL_DOCUMENTATION.md](../04-artificial-intelligence/MODEL_DOCUMENTATION.md): Established the immutable version lifecycle (`draft` → `under_review` → `approved`/`active` → `retired`), the mandatory 7-part Rule / Model Card template (`AI-001`), Phase 3 ML validation gates (`AI-006`), and the initial candidate catalog.
  - [AI_SAFETY.md](../04-artificial-intelligence/AI_SAFETY.md): Established non-negotiable AI safety invariants, the hazard taxonomy (`HAZ-01` to `HAZ-09`), the deterministic two-category emergency and self-harm escalation protocol (`FR-024`), the 7 automated CI evaluation suites in `ai-services/evaluation/`, and runtime kill switches / version rollback procedures.
- **Development standards (`docs/05-development-standards/`):**
  - [CODING_STANDARDS.md](../05-development-standards/CODING_STANDARDS.md): Defined repository structure, naming conventions, strict TypeScript/Python typing, server-side token identity derivation, allowlisted DTOs, pure scoring functions, non-diagnostic UI prop constraints, and the structured logging allowlist.
  - [TESTING_STRATEGY.md](../05-development-standards/TESTING_STRATEGY.md): Defined the 4-layer testing pyramid, the mandatory authorization/IDOR/consent-withdrawal test matrix, database and audit-redaction tests, synthetic test-data governance, and the 8-step automated acceptance test plan for the first vertical slice.
  - [DEPLOYMENT.md](../05-development-standards/DEPLOYMENT.md): Defined the Docker packaging baseline, public-edge vs. private-network topology, 4-environment isolation rule (`development`, `test`, `staging`, `production`), multi-stage non-root Dockerfile rules, 6-stage CI/CD pipeline, expand-and-contract migrations, backup/restore drills, and Rwanda Law N° 058/2021 pre-production readiness checklist.
  - [CONTRIBUTING.md](../05-development-standards/CONTRIBUTING.md): Defined the contributor and AI-agent workflow, doc-sync rules, tiered reviewer requirements (including dual review for security/auth and clinical sign-off for risk/escalation rules), and PR verification checklist.
- **Technical decisions (`docs/06-technical-decisions/`):**
  - [DECISIONS.md](DECISIONS.md): Recorded foundational Architecture Decision Records (`ADR-001` through `ADR-014`, resolving all first vertical-slice technical decisions `OPEN-001` through `OPEN-005`) and consolidated the remaining post-Slice-1/pre-production open-decisions register (`OPEN-006` through `OPEN-012`).
  - [CHANGELOG.md](CHANGELOG.md): Created this repository changelog.

#### Updated
- [PROJECT_STATUS.md](../PROJECT_STATUS.md) and root [README.md](../../README.md): Updated to reflect 100% completion of the initial draft documentation across all six documentation folders.

---

### 2026-11-18 — Security and privacy contracts (`03`)

#### Added
- **Security and privacy contracts (`docs/03-security-and-privacy/`):**
  - [ACCESS_CONTROL.md](../03-security-and-privacy/ACCESS_CONTROL.md): Defined the 8-step deny-by-default authorization decision pipeline, candidate roles (`citizen`, `provider`, `facility_user`, `community_health_worker`, `platform_admin`), service identities, proposed permission matrix, organization and assignment scoping, consent-withdrawal access effects, `404 NOT_FOUND` cross-user denial semantics, and the mandatory authorization test matrix. Flagged the `support_operator` and `DP-003` identity-provider discrepancies for resolution.
  - [SECURITY.md](../03-security-and-privacy/SECURITY.md): Consolidated trust boundaries, authentication, encryption in transit and at rest, secrets management, application and AI-service hardening, environment isolation, redacted logging and security monitoring, secure development lifecycle, vulnerability management, and incident-response outline.
  - [DATA_PRIVACY.md](../03-security-and-privacy/DATA_PRIVACY.md): Defined privacy principles, Rwanda Law N° 058/2021 regulatory context (NCSA registration, 48-hour breach notification, under-16 parental consent, and local storage/residency rules — to validate with legal counsel), personal data inventory, consent purposes, prohibited secondary uses (including explicit exclusion of genetic data until separately approved), retention and account-deletion workflow, data-subject rights, and privacy impact assessment rules.
  - [THREAT_MODEL.md](../03-security-and-privacy/THREAT_MODEL.md): Authored the design-time STRIDE and domain-specific threat model covering 12 core assets, 8 threat actors, 3 trust boundaries, 8 entry points, 33 STRIDE threats (`T-001` to `T-033`), 14 health/privacy/AI abuse cases (`T-034` to `T-047`), and the top 7 release-blocking risks for the first vertical slice.

---

### 2026-11-14 — Project foundation (`01`) and architecture & engineering (`02`)

#### Added
- **Project foundation (`docs/01-project-foundation/`):**
  - [PROJECT_OVERVIEW.md](../01-project-foundation/PROJECT_OVERVIEW.md): Translated `Albo_Project_Proposal.docx` (16th e-ICON World Contest, Team Apex Phantoms — Rwanda Coding Academy) into product vision, users, capabilities, journeys, data domains, and safety boundaries.
  - [PROJECT_SCOPE.md](../01-project-foundation/PROJECT_SCOPE.md): Defined first-release scope, later phases, explicit exclusions, and scope-control rules.
  - [REQUIREMENTS.md](../01-project-foundation/REQUIREMENTS.md): Defined system actors, functional requirements (`FR-001` to `FR-039`), security/privacy requirements (`DP-001` to `DP-009`), AI safety requirements (`AI-001` to `AI-006`), and non-functional requirements (`NFR-001` to `NFR-015`).
  - [ROADMAP.md](../01-project-foundation/ROADMAP.md): Defined the 8 delivery phases, completion gates, and roadmap governance rules.
- **Architecture and engineering (`docs/02-architecture-and-engineering/`):**
  - [ARCHITECTURE.md](../02-architecture-and-engineering/ARCHITECTURE.md): Established the NestJS modular monolith and Python/FastAPI AI-service boundary, module ownership, data flows, resilience, and observability.
  - [SYSTEM_DESIGN.md](../02-architecture-and-engineering/SYSTEM_DESIGN.md): Defined runtime topology, repository layout, request/onboarding/risk/ingestion/facility/assistant/report/notification flows, state transitions, degraded-mode behavior, and the 10-step first vertical slice.
  - [API_DOCUMENTATION.md](../02-architecture-and-engineering/API_DOCUMENTATION.md): Defined `/api/v1` conventions, auth headers, cursor pagination, error envelope, first-release endpoint proposals, internal AI-service contract, rate limits, idempotency, and audit events.
  - [DATABASE_SCHEMA.md](../02-architecture-and-engineering/DATABASE_SCHEMA.md): Defined the conceptual PostgreSQL/PostGIS data domains, data classification table, integrity invariants, indexing rules, and migration principles.
  - [INTEGRATIONS.md](../02-architecture-and-engineering/INTEGRATIONS.md): Defined backend adapter architecture, identity/map/weather/public-health/notification/AI/storage integration rules, failure fallbacks, and security checklist.
  - [TECH_STACK.md](../02-architecture-and-engineering/TECH_STACK.md): Defined the proposed stack (`Next.js`, `TypeScript`, `Tailwind CSS`, `shadcn/ui`, `NestJS`, `Python`, `FastAPI`, `PostgreSQL/PostGIS`, `Redis/BullMQ`, `OpenAPI`, `Jest`, `Pytest`, `Playwright`, `Docker`, `OpenTelemetry`).
  - [UI_UX.md](../02-architecture-and-engineering/UI_UX.md): Defined role navigation, first-release screen inventory, calm non-diagnostic risk presentation rules, consent UX, accessibility requirements, and Figma handoff rules.
- **Status & navigation:**
  - [docs/README.md](../README.md) and [PROJECT_STATUS.md](../PROJECT_STATUS.md).

---

### 2026-11-11 — Repository initialization and AI agent rules

#### Added
- Initialized repository structure with empty documentation placeholders across `docs/01-*` through `docs/06-*`.
- Added root [README.md](../../README.md) and [AGENTS.md](../../AGENTS.md) establishing the 12 core development, privacy, security, and AI safety rules.
