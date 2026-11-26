# Albo project documentation status

**Date:** 2026-11-26  
**Status:** Approved — all six documentation areas (`01` through `06`) approved  
**Implementation status:** Backend (`backend/` with Bun + NestJS + Prisma/PostGIS + BullMQ) and AI services (`ai-services/` with Python 3.12 + `uv` + FastAPI + 7 safety suites), Docker packaging, and CI are **implemented and verified** (`frontend/` deferred per `ADR-016`)

## 1. Project foundation approved

### PROJECT_OVERVIEW.md (approved)

- Product vision and problem statement
- Users and stakeholders
- Proposed product capabilities
- Citizen and provider journeys
- Information and data domains
- Development direction
- Expected impact
- Product boundaries and safety commitments

### PROJECT_SCOPE.md (approved)

- First-release scope
- Later development phases
- Explicitly excluded features
- Scope-control rules
- Completion criteria
- Open product decisions

### REQUIREMENTS.md (approved)

- System actors
- Functional requirements with IDs and priorities
- Privacy and security requirements
- AI safety requirements
- Non-functional requirements
- Acceptance criteria format
- Requirement readiness rules
- Requirements still requiring validation

### ROADMAP.md (approved)

- Product foundation phase
- Architecture and engineering phase
- Core platform phase
- First preventive-health release
- Validation and production readiness
- Expanded platform services
- Advanced intelligence and interoperability
- Scale and ecosystem integration
- Completion gates and cross-phase workstreams

## 2. Architecture and engineering approved

### ARCHITECTURE.md (approved)

- Modular-monolith architecture direction
- Core API and AI-service boundaries
- System context and component responsibilities
- Domain module boundaries
- Data and request flows
- Security and privacy architecture
- Deployment shape
- Resilience and observability
- Architecture acceptance criteria

### SYSTEM_DESIGN.md (approved)

- Runtime topology
- Repository and application layout
- Protected request flow
- Onboarding and health-input flows
- Risk-assessment flow
- External-data flow
- Facility and map flow
- Assistant, report, and notification flows
- Background jobs and state transitions
- Failure and degraded-mode behavior
- First vertical slice

### API_DOCUMENTATION.md (approved)

- API boundary and `/api/v1` versioning
- Authentication and authorization
- Request and response conventions
- Error contract
- Proposed first-release resources and endpoints
- Internal AI-service contract
- Rate limits and idempotency
- Audit behavior
- API testing requirements

### DATABASE_SCHEMA.md (approved)

- Identity and application-user model
- Roles, organizations, and provider assignments
- Consent records
- Health inputs and wellbeing check-ins
- Environmental observations
- Data provenance and ingestion records
- Risk use cases, rule versions, input snapshots, and assessments
- Facilities, referrals, and consultations
- Notifications, reports, and audit events
- Data classification and integrity constraints
- Retention, deletion, and migration rules

### INTEGRATIONS.md (approved)

- Integration principles and adapter architecture
- Identity integration
- Maps, geocoding, and facility data
- Weather and environmental sources
- Rwanda public-health and news sources
- RSS and social-media boundaries
- Notification channels
- Internal AI-service integration
- Future device and EHR/FHIR integrations
- Security, reliability, and testing requirements

### TECH_STACK.md (approved)

- Next.js and TypeScript
- Tailwind CSS and shadcn/ui
- NestJS modular backend
- Python and FastAPI AI service
- PostgreSQL and PostGIS
- Redis and background jobs
- Authentication options
- OpenAPI/Swagger
- Object storage
- Testing, Docker, CI/CD, and observability
- First-release stack and open technology decisions

### UI_UX.md (approved)

- User roles and navigation
- First-release screen inventory
- Citizen and provider journeys
- Dashboard structure
- Risk-indicator presentation rules
- Consent and privacy experience
- Assistant and wellbeing guidance
- Facility and map experience
- Reports and reusable interface states
- Accessibility and responsive behavior
- Figma handoff requirements
- UI/UX acceptance criteria

## 3. Repository guidance approved

- [README.md](../README.md) — human-facing repository introduction (approved)
- [AGENTS.md](../AGENTS.md) — AI coding-agent instructions (approved)
- [Documentation map](README.md) — documentation structure and ownership (approved)

## 4. Security and privacy approved

### ACCESS_CONTROL.md (approved)

- Access-control principles and deny-by-default decision model
- Candidate roles and service identities
- Proposed permission matrix
- Assignment- and organization-scoped access
- Consent- and purpose-aware access, including proposed withdrawal effects
- Administrative access, separation of duties, and break-glass position
- Enforcement points, location and report access
- Access auditing, lifecycle, and authorization test matrix
- Open decisions and documentation discrepancies to resolve

### SECURITY.md (approved)

- Security objectives, principles, and trust boundaries
- Authentication and data protection in transit and at rest
- Secrets management
- Application, AI-service, and integration security
- Infrastructure and environment separation
- Logging, monitoring, and audit rules
- Secure development lifecycle and vulnerability management
- Proposed incident-response outline, backup and recovery
- First-release security baseline and open decisions

### DATA_PRIVACY.md (approved)

- Privacy principles
- Rwanda Law N° 058/2021 context (to validate with legal counsel)
- Roles, data inventory, purposes, and lawful basis
- Consent management and withdrawal
- Retention and deletion approach (periods not yet approved)
- Data subject rights and automated-processing safeguards
- Children, sharing, data residency, and cross-border transfers
- Privacy impact assessment, breach handling, and first-release baseline

### THREAT_MODEL.md (approved)

- Assets, threat actors, trust boundaries, and entry points
- Proposed likelihood × impact rating method
- STRIDE threats per boundary (T-001 to T-033)
- Health, privacy, and AI abuse cases (T-034 to T-047)
- First-release priority risks and required evidence
- Assumptions, residual risks, and maintenance rules

All four `03-security-and-privacy/` documents are approved.

## 5. Artificial intelligence approved

### AI_ARCHITECTURE.md (approved)

- Core AI architectural principles and strict core-API vs. AI-service ownership split
- Internal `ai-services/` FastAPI package layout (`contracts`, `data_processing`, `risk_engine`, `model_adapters`, `safety`, `evaluation`)
- Phased evolution gates: Phase 1 deterministic rules, Phase 2 safety-gated assistant, Phase 3 validated ML models
- Internal service-to-service API contract and PII-free input snapshot schema
- Synchronous vs. asynchronous execution, stateless versioning, and failure/degraded-mode behavior
- Redacted observability, first-release scope, and open decisions

### RISK_SCORING.md (approved)

- Preventive indicator vs. medical diagnosis boundary and core scoring principles
- Candidate proposal risk domains and first-release gating
- 8-step risk-assessment evaluation pipeline
- Declarative rule-set specification standard (inputs, freshness windows, thresholds, bounded weights, floor guardrails)
- Standardized risk-level vocabulary (`low`, `moderate`, `high`, plus `limited` and `failed` statuses)
- Contributing-factor structure, mandatory limitations, and non-prescriptive next steps
- Reproducibility, clinical review workflow, synthetic test matrix, and future ML transition gates

### AI_ASSISTANT.md (approved)

- Safety-gated (`Should`) status and informational/navigation boundary
- Explicit permitted vs. prohibited assistant capabilities
- 5-step conversation pipeline with pre-model crisis screening and post-model output safety filters
- Caller-scoped context assembly and PII exclusion rules
- Grounding and hallucination prevention (verified facility cards injected by core API, never generated from model weights)
- Deterministic emergency, severe-symptom, and self-harm escalation flow (FR-024)
- Prompt-injection defenses and staged implementation options (in-house template/retrieval vs. gated external LLM)

### MODEL_DOCUMENTATION.md (approved)

- Governance contract and immutable version lifecycle (`draft` → `under_review` → `approved`/`active` → `retired`)
- Standardized 7-part Rule / Model Card template (AI-001, DATABASE_SCHEMA §8.2)
- Additional Phase 3 ML validation gates (representativeness, baseline comparison, calibration, subgroup fairness, drift monitoring, rollback)
- Initial candidate catalog across Phases 1–3 and baseline rule card for the first vertical-slice indicator (`lifestyle_ncd_preventive` — `rules-v1.0.0`)

### AI_SAFETY.md (approved)

- Non-negotiable AI safety invariants (non-diagnostic, no false low-risk fallback, deterministic crisis escalation, provenance, minimum data)
- Hazard taxonomy (`HAZ-01` to `HAZ-09`) mapped to technical and product guardrails
- Two-category emergency and self-harm escalation protocol (FR-024)
- 7-suite pre-release AI safety evaluation matrix for CI (`ai-services/evaluation/`)
- Runtime circuit breakers (kill switches), version rollback, and clinical/safety incident response

All five `04-artificial-intelligence/` documents are approved.

## 6. Development standards approved

### CODING_STANDARDS.md (approved)

- Universal engineering rules and strict boundary separation (`frontend/` vs. `backend/` vs. `ai-services/`)
- Repository layout and naming conventions across TypeScript/NestJS, Next.js/React, Python/FastAPI, and PostgreSQL
- Server-side token identity derivation, centralized policy guards, and DTO allowlist validation
- Pure, wall-clock-independent scoring functions and Pydantic v2 validation error redaction
- Non-diagnostic UI prop enforcement, structured logging allowlist, linting/static analysis, and PR review checklist

### TESTING_STRATEGY.md (approved)

- 4-layer testing pyramid (Jest/Pytest unit, Supertest + Test DB integration, `ai-services/evaluation/` safety suites, Playwright + axe-core E2E)
- Mandatory authentication, horizontal IDOR (`404 NOT_FOUND`), role isolation, provider assignment, and consent-withdrawal test matrix
- Database migration, transaction atomicity, and audit-redaction tests
- Risk reproducibility, `limited`-status degradation, crisis escalation recall (100%), and prompt-injection evaluation requirements
- Synthetic test-data governance and 8-step first vertical-slice acceptance test plan

### DEPLOYMENT.md (approved)

- Docker packaging baseline and public-edge vs. private-network runtime topology
- Strict 4-environment isolation rule (`development`, `test`, `staging`, `production` — zero production data outside production)
- Startup config validation, secret management, and runtime AI safety kill switches / version pinning
- Multi-stage non-root Dockerfile standards, 6-stage CI/CD pipeline, and expand-and-contract database migrations
- Health checks, redacted OpenTelemetry observability, backup/restore drills, rollback procedures, and Rwanda Law N° 058/2021 pre-production readiness checklist

### CONTRIBUTING.md (approved)

- Pre-implementation reading requirements and scope/decision verification workflow
- Branching, commit, and documentation-synchronization rules
- Non-negotiable safety and privacy rules for human developers and AI coding agents
- Tiered review requirements (including dual review for security/auth and clinical sign-off for risk/assistant rules) and PR checklist

All four `05-development-standards/` documents are approved.

## 7. Technical decisions approved

### DECISIONS.md (approved)

- Decision governance rules and ADR lifecycle (`Accepted (Baseline)`, `Proposed`, `Open / To Decide`, `Superseded`)
- Accepted Architecture Decision Records (`ADR-001` through `ADR-014`):
  - `ADR-001`: NestJS modular monolith + separate internal Python/FastAPI AI service
  - `ADR-002`: Deterministic rules and weighted scoring first; no proprietary LLM training
  - `ADR-003`: Non-diagnostic framing and `status: "limited"` (`level: null`) degradation on missing/stale inputs
  - `ADR-004`: Deny-by-default, relationship- and consent-aware access control (`404 NOT_FOUND` on cross-user access; no automatic admin health-record access)
  - `ADR-005`: Standards-based external identity provider with isolated application accounts
  - `ADR-006`: Deterministic emergency, severe-symptom, and self-harm escalation (`FR-024`)
  - `ADR-007`: 100% synthetic data outside production and zero sensitive-payload logging
  - `ADR-008`: PostgreSQL/PostGIS durable store, Redis/BullMQ for jobs only, and Docker packaging without initial Kubernetes
  - `ADR-009`: Single citizen vertical slice as the first implementation target
  - `ADR-010`: First vertical-slice geography (Rwanda, adults `18+`, English with Kinyarwanda/French localization keys) and self-contained `lifestyle_ncd_preventive` (`rules-v1.0.0`) use case
  - `ADR-011`: Standards-based OIDC/JWT auth boundary (Supabase Auth default + local offline JWT test signer) and removal of unused `support_operator` role
  - `ADR-012`: Prisma ORM + Prisma Migrate with `user_accounts` table naming
  - `ADR-013`: Synchronous NestJS ↔ FastAPI HTTP call (`<= 2000ms` timeout) authenticated via `X-Internal-Service-Token` for Slice 1
  - `ADR-014`: Discrete risk-level vocabulary (`low`, `moderate`, `high`, and `null` when `limited` or `failed`)
  - `ADR-015`: Resolution of Phase 1 contract discrepancies (`rule_model_version`, `lifestyle_ncd_preventive`, nine canonical `v1` consent purpose codes, active role scoping, resolved decision links, and phase cross-references)
  - `ADR-016`: Backend-only onboarding boundary (`backend/`, `ai-services/`, `infrastructure/`, CI; `frontend/` deferred) and toolchain selection (**Bun** + **Python 3.12 / `uv`** + Docker Compose + GitHub Actions)
  - `ADR-017`: Runtime governance circuit breakers (`FEATURE_*`), immutable health-input supersession (`supersedes_input_id`), typed synthetic/sandbox integration adapters, and private S3/MinIO presigned report URLs
- Consolidated register of remaining post-Slice-1 / pre-production decisions (`OPEN-006` through `OPEN-012`)

### CHANGELOG.md (approved)

- Chronological record of all repository milestones from initialization (2026-11-11) through project foundation and architecture (2026-11-14), security and privacy (2026-11-18), artificial intelligence, development standards, and technical decisions (2026-11-19), and full documentation baseline + Phase 1 contract synchronization (2026-11-25)

Both `06-technical-decisions/` documents are approved.

## 8. Current overall status

All 26 domain documentation files across `01-project-foundation/`, `02-architecture-and-engineering/`, `03-security-and-privacy/`, `04-artificial-intelligence/`, `05-development-standards/`, and `06-technical-decisions/` (plus `README.md`, `AGENTS.md`, `docs/README.md`, and `docs/PROJECT_STATUS.md`) are approved and synchronized with the implemented backend and AI codebase (`ADR-001` through `ADR-017`).

Per `ADR-016` and `ADR-017`:
- **`backend/`** (Bun + NestJS modular monolith + Prisma/PostGIS + Redis/BullMQ + S3/MinIO) is implemented and passing strict lint, `tsc --noEmit`, build, and `33/33` unit and live integration tests (including Vertical Slice 1, horizontal IDOR `404` isolation, consent withdrawal, immutable supersession, PostGIS spatial search, Provider Portal scoping, presigned private reports, and BullMQ worker consent re-checks).
- **`ai-services/`** (Python 3.12 + `uv` + FastAPI) is implemented and passing `ruff`, `mypy --strict`, and `138/138` `pytest` tests across all 7 pre-release AI safety evaluation suites.
- **`frontend/`** (Next.js UI) remains deferred to the dedicated frontend onboarding track.

## 9. Remaining pre-production decisions (`OPEN-006` through `OPEN-012`)

First vertical-slice and Phase 1 foundation decisions (`OPEN-001`–`OPEN-005`) are resolved in `ADR-010`–`ADR-017`. Remaining pre-production gates before enabling gated features in production or collecting live citizen data:

- Clinical reviewer sign-off and verified Rwanda emergency/self-harm escalation directory (`OPEN-006`)
- Legal controller entity, NCSA registration, final production consent wording, and Rwanda data-residency compliance (`OPEN-007`)
- Production data retention periods, backup expiry, and deletion grace period (`OPEN-008`)
- First public-release inclusion of `FEATURE_PROVIDER_PORTAL_ENABLED` vs. facility discovery only (`OPEN-009`)
- Authoritative Rwanda facility, map, weather/air-quality, and external notification vendor contracts (`OPEN-010`)
- Production AI assistant inclusion (`FEATURE_ASSISTANT_ENABLED`) and model-adapter vendor choice (`OPEN-011`)
- Production cloud hosting, S3 vendor, secret manager, observability backend, and RPO/RTO targets (`OPEN-012`)

## 10. Recommended next steps

1. Onboard the deferred `frontend/` Next.js web client against `/api/v1/*` and OpenAPI contracts (`ADR-016`).
2. Complete clinical review (`OPEN-006`) and legal/privacy validation under Rwanda Law N° 058/2021 (`OPEN-007`, `OPEN-008`) before enabling gated runtime flags or accepting real citizen data.
3. Replace sandbox weather, map/directions, and notification channel adapters in `backend/src/integrations/` once `OPEN-010` vendor agreements are finalized.