# Albo changelog

**Status:** Active repository and documentation changelog  
**Format:** Chronological by date and milestone (aligned with [Keep a Changelog](https://keepachangelog.com/))  
**Related:** [Decisions](DECISIONS.md), [Project status](../PROJECT_STATUS.md), [Documentation map](../README.md)

## 1. Purpose

This document tracks major additions, architectural contracts, security/privacy policies, AI governance updates, and future application releases across the Albo repository.

Every significant change to requirements, APIs, database schemas, security/privacy policies, AI rules/models, or application code should add an entry under `[Unreleased]` or the current date milestone.

---

## [Unreleased — Complete Documentation & Engineering Contract Baseline]

**Implementation status:** All 6 documentation folders (`01` through `06`) completed as reviewable engineering contracts; application code implementation has not started yet (ready for the first vertical slice).

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
  - [DECISIONS.md](DECISIONS.md): Recorded foundational Architecture Decision Records (`ADR-001` through `ADR-009`) and consolidated the master open-decisions register (`OPEN-001` through `OPEN-012`).
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
