# Albo architecture

**Status:** Proposed — owner: project foundation and architecture lead  
**Related:** [System design](SYSTEM_DESIGN.md), [Technology stack](TECH_STACK.md), [API documentation](API_DOCUMENTATION.md), [Database schema](DATABASE_SCHEMA.md)

## 1. Architecture purpose

This document defines the structural boundaries of Albo: which components exist, what each component owns, how they communicate, and which constraints protect the product's health, privacy, and safety goals.

The architecture is intentionally designed for progressive delivery. The first release should be a small, testable system with strong boundaries. Components may be extracted later when scale, security isolation, or team ownership makes that worthwhile.

## 2. Architectural direction

Albo will begin with:

- A responsive web client
- A NestJS core API organized as a modular monolith
- PostgreSQL as the primary relational database, with PostGIS where approved geographic queries require it
- Redis and background jobs for bounded asynchronous work where needed
- A separate Python/FastAPI AI and analytics service
- Adapter modules for weather, maps, facilities, messaging, identity, devices, and other external systems

The core API remains the system of record for application workflows and permissions. The AI service is specialized computation; it is not a second backend for users, consent, or authorization.

## 3. System context

```text
                         +-----------------------+
                         |  Citizens / providers |
                         +-----------+-----------+
                                     |
                              HTTPS, API v1
                                     |
+----------------+        +---------v---------+        +-------------------+
| Web application| <-----> |   Core API        | <----> | External adapters |
| Next.js        |        | NestJS monolith   |        | maps, weather,    |
+----------------+        +---+-----+-----+---+        | facilities, auth  |
                              |     |     |            +-------------------+
                         +----v+ +--v--+ +-v----------+
                         | DB  | |Jobs | | AI service |
                         |PG/  | |Redis| |FastAPI     |
                         |GIS  | +-----+ +------------+
                         +-----+
```

The browser communicates with the core API. The core API validates the request, checks authorization and consent, applies business rules, persists approved data, and returns a sanitized response. The AI service receives only the minimum authorized input required for an approved calculation.

## 4. Component responsibilities

| Component | Owns | Must not own |
|---|---|---|
| Web client | Presentation, navigation, form state, accessibility, user-facing error handling | Secrets, authorization decisions, trusted risk calculations |
| Core API | Public API, identity integration, authorization, consent, workflows, persistence, audit | Hidden model reasoning, direct browser access to sensitive providers |
| AI service | Data preparation, rules, analytics, model adapters, model/rule metadata | User identity, consent decisions, unrestricted record access |
| PostgreSQL/PostGIS | Durable relational data, constraints, transactions, approved spatial data | Application secrets or unbounded raw model prompts |
| Redis/job workers | Cache, rate limiting, bounded queues, asynchronous coordination | Primary health-record storage |
| External adapters | Provider-specific authentication, mapping, normalization, retries, timeouts | Core business rules or direct authorization decisions |
| Object storage | Approved reports or documents with controlled access | Public storage of sensitive records by default |
| Observability | Health, performance, errors, and traces with redaction | Raw health records, credentials, tokens, or unrestricted prompts |

## 5. Core API module boundaries

The core API is a modular monolith. Each module owns its domain behavior and persistence access through explicit interfaces.

### Identity and access

Integrates with the approved identity provider and maps authenticated identities to Albo roles, organizations, assignments, and application records. It must not expose identity-provider-managed tables directly to clients.

### Profiles and citizen data

Owns approved profile fields, health inputs, wellbeing check-ins, provenance, timestamps, validation, and correction workflows. It does not decide clinical meaning by itself.

### Consent

Owns consent purposes, data categories, versions, status, withdrawal, and consent audit events. Sensitive processing must check this module before proceeding.

### Risk assessment

Owns the workflow for requesting, storing, retrieving, and explaining risk assessments. It calls the AI service through a controlled interface and records the rule/model version and input snapshot reference.

### Facilities and providers

Owns normalized facility/provider records, service capabilities, approved geographic information, freshness metadata, and search behavior. External source-specific logic stays in adapters.

### Notifications

Owns preferences, approved notification events, delivery state, retries, and suppression rules. It must respect consent and avoid sending alarming or unsupported clinical claims.

### Consultations and referrals

Owns approved referral, contact, visit, or consultation workflows. Live consultation features remain separately gated by product, clinical, security, and operational approval.

### Reports

Owns report requests, status, provenance, access permissions, and controlled file delivery. Report generation may run asynchronously.

### Audit

Owns append-oriented audit events for sensitive access and changes. Audit records must be useful for accountability without storing unnecessary sensitive payloads.

## 6. Dependency direction

```text
HTTP controllers / API adapters
              ↓
Application use cases
              ↓
Domain modules and policies
              ↓
Persistence and external-provider ports
              ↓
Database / queues / provider adapters
```

Rules:

- Controllers validate transport input and delegate; they do not contain core business rules.
- Domain modules communicate through explicit application interfaces.
- A module must not query another module's tables directly when an interface can express the operation.
- External providers are replaceable adapters, not domain dependencies.
- The frontend must not duplicate authorization or risk-calculation logic.

## 7. Request and data flow

### 7.1 Protected application request

```text
Client request
  → token validation
  → request validation
  → identity, role, assignment, and consent checks
  → domain use case
  → database or approved adapter
  → audit event where required
  → sanitized API response
```

The API must derive the caller from the validated token. A client-provided user ID must not be trusted to select another person's records.

### 7.2 Risk-assessment request

```text
Approved user input
  → validate provenance, freshness, consent, and completeness
  → create immutable input snapshot
  → call approved rules/AI service
  → validate returned result and safety metadata
  → store versioned assessment
  → create audit event
  → return explanation, limitations, and next steps
```

An assessment must not be produced from unauthorized, invalid, or insufficient input. The API must represent that limitation rather than inventing a result.

### 7.3 External-data flow

```text
Scheduled or user-requested adapter job
  → authenticate to provider
  → fetch bounded data
  → validate and normalize
  → record provenance and freshness
  → store approved representation
  → optionally queue a derived calculation
```

External data is not automatically clinical evidence. Each source requires a purpose, owner, freshness policy, failure behavior, and approval for any risk-calculation use.

## 8. Synchronous and asynchronous work

Keep short, bounded requests synchronous when the user needs an immediate response. Use background jobs for:

- Report generation
- Environmental-data ingestion
- Notification delivery and retries
- Long-running or expensive analytics
- Model evaluation and batch processing
- Reconciliation with external providers

Jobs must be idempotent, observable, retry-bounded, and safe when dependencies are unavailable. A failed dependency must not cause fabricated health information.

## 9. AI-service boundary

The core API sends the AI service:

- An approved use-case identifier and version
- A minimum necessary authorized input snapshot
- Consent and policy context already checked by the core API
- Request and trace identifiers
- A bounded timeout

The AI service returns structured output containing:

- Result status
- Rule/model version
- Structured result or safe failure
- Contributing factors where approved
- Limitations and safety metadata
- Provenance references

The AI service must not:

- Authenticate users independently
- Decide whether a caller may access data
- Fetch arbitrary records
- Write directly to client-facing data without a core-API workflow
- Return hidden reasoning, raw prompts, credentials, or unnecessary health data
- Label a preventive indicator as a diagnosis

## 10. Data ownership and consistency

PostgreSQL is the durable source of truth for approved application records. Redis is not a primary store for health records. Derived data must retain a link to its source, version, timestamp, and input snapshot where required.

Transactions are required when partial writes could create an unsafe state, such as consent changes, profile updates with audit events, assessment creation, or referral creation. Background work must use explicit status transitions and retry behavior.

Detailed entities and relationships are defined in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Route behavior is defined in [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

## 11. Security and privacy architecture

- All sensitive access passes through authentication, authorization, least privilege, and applicable consent.
- Application profiles and domain tables are separated from identity-provider-managed data.
- Sensitive fields are minimized, encrypted or protected according to the security design, and excluded from ordinary logs.
- Provider and administrator access is scoped; privileged roles do not imply unrestricted health-data access.
- External credentials are stored in approved secret management, never in source code or client bundles.
- Audit events record sensitive access and changes without copying raw records or prompts.
- Development and testing use synthetic or properly de-identified data.
- Precise location is collected and shared only when needed for an approved purpose.

## 12. Deployment shape

The initial deployment may run as a small set of independently deployable applications:

```text
Frontend application
Core API application
AI service application
PostgreSQL/PostGIS
Redis and job worker
Object storage, if reports require it
```

Docker is the proposed packaging baseline. Development, test, staging, and production must have separate configuration and access controls. Kubernetes is not an initial requirement.

## 13. Resilience and failure behavior

- External integrations use timeouts, bounded retries, circuit protection where needed, and clear stale/unavailable states.
- The system does not turn missing data into a low-risk conclusion.
- Queue jobs are idempotent and can be retried without duplicate notifications, reports, or referrals.
- Database migrations are reviewable and reversible where practical.
- Backups and restoration are tested before production health data is accepted.
- A degraded mode must preserve user safety and clearly communicate limitations.

## 14. Observability

Observability should provide:

- Request IDs and trace correlation
- Service health and dependency status
- Latency and error rates by endpoint category
- Queue depth and job failure metrics
- Assessment and integration success/failure counts without raw inputs
- Security and authorization failure signals
- Audit access for approved operators

Logs and traces must not contain access tokens, passwords, raw health records, precise locations unless explicitly necessary, or unrestricted AI prompts and responses.

## 15. Evolution strategy

Start with the modular monolith. Extract a module only when at least one of these is demonstrated:

- Independent scaling is required.
- A security boundary requires isolation.
- A team owns and deploys it independently.
- Reliability or workload characteristics require separation.
- The operational cost is justified by measurable benefit.

Extraction must preserve API contracts, authorization, auditability, provenance, and failure behavior. Microservices are not an architectural goal by themselves.

## 16. Architecture acceptance criteria

The architecture is ready for first-release implementation when:

- Component and module ownership is approved.
- Public API and internal AI boundaries are documented.
- Authentication, authorization, consent, and audit flows are testable.
- First-release data entities and ownership are approved.
- External integrations have adapter and failure contracts.
- Sensitive-data logging and storage rules are defined.
- Local development and environment separation are documented.
- The first vertical slice can be built without inventing core boundaries.

## 17. Open architecture decisions

- Final identity provider and token claims
- Exact first-release domain modules and owners
- Final database schema and migration tool
- Whether risk calculation is synchronous for the first use cases
- Queue and worker deployment model
- Approved hosting, object storage, and observability services
- Facility, map, weather, and environmental data providers
- Provider organization and assignment model
- Clinical review and safety-governance integration points
- Performance, availability, backup, and recovery targets
