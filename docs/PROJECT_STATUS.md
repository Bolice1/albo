# Albo project documentation status

**Date:** 2026-11-14  
**Status:** Documentation foundation and architecture/engineering draft completed  
**Implementation status:** Application code has not started

## 1. Project foundation completed

### PROJECT_OVERVIEW.md

- Product vision and problem statement
- Users and stakeholders
- Proposed product capabilities
- Citizen and provider journeys
- Information and data domains
- Development direction
- Expected impact
- Product boundaries and safety commitments

### PROJECT_SCOPE.md

- First-release scope
- Later development phases
- Explicitly excluded features
- Scope-control rules
- Completion criteria
- Open product decisions

### REQUIREMENTS.md

- System actors
- Functional requirements with IDs and priorities
- Privacy and security requirements
- AI safety requirements
- Non-functional requirements
- Acceptance criteria format
- Requirement readiness rules
- Requirements still requiring validation

### ROADMAP.md

- Product foundation phase
- Architecture and engineering phase
- Core platform phase
- First preventive-health release
- Validation and production readiness
- Expanded platform services
- Advanced intelligence and interoperability
- Scale and ecosystem integration
- Completion gates and cross-phase workstreams

## 2. Architecture and engineering completed

### ARCHITECTURE.md

- Modular-monolith architecture direction
- Core API and AI-service boundaries
- System context and component responsibilities
- Domain module boundaries
- Data and request flows
- Security and privacy architecture
- Deployment shape
- Resilience and observability
- Architecture acceptance criteria

### SYSTEM_DESIGN.md

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

### API_DOCUMENTATION.md

- API boundary and `/api/v1` versioning
- Authentication and authorization
- Request and response conventions
- Error contract
- Proposed first-release resources and endpoints
- Internal AI-service contract
- Rate limits and idempotency
- Audit behavior
- API testing requirements

### DATABASE_SCHEMA.md

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

### INTEGRATIONS.md

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

### TECH_STACK.md

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

### UI_UX.md

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

## 3. Repository guidance completed

- [README.md](../README.md) — human-facing repository introduction
- [AGENTS.md](../AGENTS.md) — AI coding-agent instructions
- [Documentation map](README.md) — documentation structure and ownership

## 4. Collaborator-owned documentation

The following documentation areas intentionally remain empty for collaborators:

- `03-security-and-privacy/`
- `04-artificial-intelligence/`
- `05-development-standards/`
- `06-technical-decisions/`

## 5. Current overall status

The project foundation and architecture/engineering documentation are complete as proposed drafts. They are ready for team review, clarification, and approval before implementation.

No application code has been implemented yet.

## 6. Main decisions still requiring approval

- First-release geography, language, users, and risk use cases
- Identity provider and authentication boundary
- First-release database fields and provider-access model
- Facility, map, weather, and environmental-data providers
- Consent, retention, deletion, and export rules
- Clinical review and emergency/self-harm escalation process
- First vertical slice to implement
- Hosting, budget, operational ownership, and recovery targets

## 7. Recommended next step

Review and approve the first vertical slice before implementation:

1. Citizen signs in.
2. The core API creates or retrieves the application account.
3. The citizen grants a test consent purpose.
4. The citizen submits one approved synthetic health or lifestyle input.
5. The system stores the input with provenance.
6. A documented rule calculates one non-diagnostic risk indicator.
7. The dashboard displays the result, contributing factor, limitation, and next step.
8. Authorization and audit tests verify the data boundary.
