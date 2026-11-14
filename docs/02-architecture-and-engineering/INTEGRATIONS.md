# Albo integrations

**Status:** Proposed integration strategy — providers and contracts require approval  
**Related:** [Architecture](ARCHITECTURE.md), [Database schema](DATABASE_SCHEMA.md), [API documentation](API_DOCUMENTATION.md), [Project scope](../01-project-foundation/PROJECT_SCOPE.md)

## 1. Purpose

This document defines how Albo connects to identity, environmental, geographic, healthcare, messaging, storage, and AI systems.

An integration is not approved merely because a provider has an API or feed. Each integration must have a documented purpose, owner, data contract, privacy review, security review, freshness expectation, failure behavior, and test strategy.

## 2. Integration principles

- External systems are accessed through backend adapters, not scattered through domain modules or browser code.
- Provider credentials are stored in approved secret management and never in source code, logs, documentation, or client bundles.
- The core API owns authorization, consent, business rules, persistence, and audit behavior.
- External data is normalized into an Albo-owned representation with provenance and freshness metadata.
- External data does not automatically become clinical evidence or risk-score input.
- Integrations fail safely: stale, unavailable, or incomplete data is shown as such.
- Requests use timeouts, bounded retries, rate limits, and idempotency where duplicate work is possible.
- The minimum necessary data is sent to each provider.
- Provider terms, licensing, attribution, data residency, and usage limits are reviewed before production use.
- Development and tests use synthetic data or provider sandboxes where available.

## 3. Integration categories and release position

| Category | Purpose | First release | Later / conditional |
|---|---|---:|---:|
| Identity | Sign-in, tokens, account recovery | Required | Provider migration if justified |
| Database and storage | Durable records and reports | Required | Alternative storage only by decision |
| Maps and geocoding | Facility discovery and directions | Limited | Advanced geospatial features |
| Facility directory | Approved hospitals, pharmacies, and providers | Required | Live availability and partner systems |
| Weather/environment | Contextual environmental information | Limited | More sources and automated risk inputs |
| Notifications | In-app and approved delivery channels | Limited | SMS, email, push, or messaging expansion |
| AI/analytics | Risk rules and approved assistant workflows | Internal service | External model providers or advanced ML |
| Health devices | Import approved personal data | Not initially | Apple Health, Google Fit, Fitbit, others |
| EHR/interoperability | Exchange clinical records | Not initially | FHIR or partner-specific exchange |
| Public-health context | Aggregated alerts or reports | Conditional | Approved Rwanda and global sources |
| Social platforms | Trend/content monitoring | Out of scope | Separate product decision and permitted APIs |

## 4. Core integration architecture

```text
Core domain module
       |
       v
Integration port / adapter interface
       |
       +--> provider client
       +--> authentication and secrets
       +--> timeout / retry / rate limit
       +--> response validation
       +--> normalization and provenance
       +--> persistence or safe failure
```

An adapter may talk to a provider, but it must return an Albo-owned result rather than leaking provider-specific response shapes into the rest of the application.

## 5. Integration contract

Every integration record should define:

- Integration name and provider
- Business and health purpose
- Owning Albo module and technical owner
- Data categories sent and received
- Consent and authorization requirements
- Authentication method and secret location
- Endpoint/feed/API version and usage limits
- Request and response schema
- Mapping and normalization rules
- Source timestamp and Albo ingestion timestamp
- Freshness and quality rules
- Timeout, retry, rate-limit, and fallback behavior
- Audit events and sensitive fields
- Data retention and deletion behavior
- Cost, licensing, attribution, and terms
- Sandbox and test strategy
- Exit or replacement plan

## 6. Identity integration

### Purpose

Authenticate citizens and approved staff, issue access tokens, support account recovery, and provide identity claims needed by the core API.

### Candidate approach

Use the currently approved identity provider or an OIDC-compatible provider. Supabase Auth may be used where it remains the selected platform, but the core API must keep identity-provider details behind an adapter.

### Rules

- The browser uses the provider's supported client flow.
- The core API validates issuer, audience, signature, expiry, and required claims.
- Application profiles reference the immutable identity subject ID.
- Identity-provider-managed tables are not exposed through the public API.
- Roles, organization membership, assignment, consent, and resource access are decided by Albo policy.
- Logout, account deletion, suspension, and token revocation behavior must be documented.

## 7. Maps, geocoding, and facilities

### Purpose

Help users find approved healthcare facilities, pharmacies, consultants, and directions.

### Data flow

```text
Approved facility source / administrator
  → adapter
  → validate and normalize facility data
  → store source and freshness metadata
  → indexed facility search
  → bounded map/direction request
  → sanitized client response
```

### Rules

- Facility records have a source, last-verified time, and status.
- A map provider is not the authority for clinical service availability.
- Precise user location is optional, minimized, and never shared with facilities by default.
- Geocoding and routing requests use coarse or user-approved locations where possible.
- Provider terms, map display requirements, caching limits, and attribution are reviewed.
- Missing or stale facility data is shown as unavailable or last updated; it is not presented as guaranteed service availability.

## 8. Weather and environmental data

### Purpose

Provide environmental context such as weather, rainfall, air quality, or other approved observations.

### Candidate sources

Potential sources include an approved Rwanda meteorological or environmental authority, a documented weather provider, air-quality services, and trusted public-health sources. Specific providers must be selected after checking coverage, licensing, reliability, cost, and data quality.

### Rules

- Store source identity, observation time, location precision, units, quality status, and ingestion time.
- Normalize units and validate ranges before storing or displaying data.
- Distinguish observed, forecast, estimated, and missing values.
- Use an area or grid representation instead of precise user coordinates when possible.
- A weather or environmental observation may inform context but cannot automatically become a disease prediction input.
- Any source used in a risk calculation requires an approved use case, freshness threshold, transformation, and evaluation plan.

## 9. Public-health and news sources

### Purpose

Potentially provide public-health context, outbreak notices, environmental alerts, or community information.

### Approved use boundary

Official public-health communications and carefully reviewed sources may support contextual displays or human-reviewed alerts. RSS feeds and news articles are not automatically clinical evidence and must not silently change a user's risk score.

For each feed or source, record:

- Publisher and source authority
- Publication and update timestamps
- Geographic coverage
- Topic classification
- Verification status
- Content license and reuse conditions
- Human-review requirement
- Whether the source is display-only or permitted as a calculation input

General worldwide news aggregation, Google Trends, and social-media content creation are outside the current Albo scope. Any future trend-monitoring feature requires a separate product decision and must use permitted APIs or licensed feeds rather than unauthorized scraping.

## 10. Notification integrations

### Purpose

Deliver approved reminders, alerts, report availability, and workflow updates.

### Channels

Start with in-app notifications where possible. SMS, email, push notifications, or messaging platforms require separate provider, cost, consent, and delivery-policy decisions.

### Rules

- Respect user preferences, consent, quiet hours, and notification category.
- Do not put unnecessary health details in SMS, email previews, or push payloads.
- Use protected in-app references for sensitive content.
- Store delivery status, provider message ID where necessary, retry count, and sanitized failure code.
- Do not claim a notification is delivered when the provider has not confirmed it.
- Rate-limit repeated alerts and prevent panic-inducing duplicates.

## 11. AI and analytics integration

The FastAPI AI service is an internal integration boundary, not a public provider.

### Core API sends

- Approved use-case and rule/model version
- Minimum necessary authorized input snapshot
- Consent and policy context already checked
- Request and trace IDs
- Timeout and processing constraints

### AI service returns

- Structured result or safe failure
- Rule/model version
- Contributing factors where approved
- Limitations and safety metadata
- Provenance reference

The AI service must not independently authorize users, access arbitrary records, expose raw prompts, or write unreviewed results directly to client-facing storage.

If an external model provider is later used, add a separate review for data processing, retention, regional availability, model behavior, prompt injection, privacy leakage, cost, and fallback behavior.

## 12. Health-device integrations

Device integrations are later scope. Before approval, define:

- Supported device and platform
- Data categories and exact fields
- User connection, consent, revocation, and reauthorization
- Data freshness and missing-data behavior
- Vendor permissions and terms
- Whether data is display-only or used in risk calculations
- Data deletion and provider disconnect behavior
- Security and clinical validation requirements

Albo must not assume that data from Apple Health, Google Fit, Fitbit, or another device is accurate, complete, or clinically validated merely because it is available through an API.

## 13. EHR and interoperability integrations

Electronic health-record exchange is later scope. An integration may use HL7 FHIR or a partner-specific interface only after the partner, resources, identity matching, consent, provenance, terminology, audit, retention, and clinical responsibilities are defined.

Do not copy a full clinical record into Albo when a narrowly scoped, time-bounded query or reference is sufficient. EHR data must not be used in a risk calculation without an approved clinical and technical validation process.

## 14. Object storage and reports

Use controlled S3-compatible object storage for generated reports or approved documents when database storage is not appropriate.

Rules:

- Store only an object reference and required metadata in PostgreSQL.
- Use private buckets and short-lived, authorized download URLs.
- Do not expose predictable object paths.
- Scan and validate uploaded files if uploads are introduced.
- Apply retention and deletion policies to both database metadata and objects.
- Never place credentials or raw patient records in public storage.

## 15. Reliability and failure behavior

All adapters must define:

- Connection and request timeout
- Maximum retry count and backoff
- Retryable versus non-retryable errors
- Rate-limit handling
- Circuit protection or temporary disablement
- Stale-data behavior
- User-facing fallback
- Alert and operator signal
- Reconciliation strategy

Safe examples:

- If weather data is unavailable, show the last verified observation or an unavailable state.
- If a map provider fails, show stored facility details without pretending directions are available.
- If a risk dependency fails, return a limited or unavailable assessment instead of a low-risk result.
- If notification delivery fails, preserve the in-app event and record the delivery failure.

## 16. Security and privacy checklist

Before enabling an integration, confirm:

- Credentials are in secret management.
- TLS and certificate validation are enabled.
- Provider access uses least privilege.
- Request payloads contain the minimum necessary data.
- Consent and authorization are checked before personal data leaves Albo.
- Sensitive responses are redacted from logs and traces.
- Provider data retention and deletion are understood.
- Webhooks verify signatures and prevent replay.
- Rate limits and abuse protections exist.
- Audit events identify sensitive transfers without copying payloads.
- The provider's terms, licensing, data residency, and breach process are reviewed.

## 17. Integration testing

Each adapter requires:

- Contract tests against documented schemas
- Mock or sandbox tests for success and failure responses
- Authentication and secret-configuration tests
- Timeout, retry, rate-limit, and duplicate-delivery tests
- Data-validation and unit-conversion tests
- Provenance and freshness tests
- Consent and authorization tests for personal-data transfers
- Observability and redaction tests
- A safe fallback test when the provider is unavailable

Production credentials and real patient data must never be used in automated tests.

## 18. Integration lifecycle

1. Identify a product requirement and integration purpose.
2. Confirm the integration is in current scope.
3. Select candidate providers and compare coverage, terms, cost, and reliability.
4. Define the data contract and ownership.
5. Review privacy, security, clinical safety, and legal implications.
6. Implement an adapter with mocks or a sandbox.
7. Test failure, provenance, freshness, and authorization behavior.
8. Approve production configuration and monitoring.
9. Review quality and cost periodically.
10. Retire or replace the integration with a documented migration plan when needed.

## 19. Open integration decisions

- Final identity provider and OIDC/Supabase boundary
- First map, geocoding, and routing provider
- Source of truth for Rwanda facility and provider data
- First weather, air-quality, and environmental sources
- Whether public-health feeds are display-only or calculation inputs
- First notification channel
- Object-storage provider and report retention
- AI model provider, if any external model is used
- Webhook and background-job infrastructure
- Data residency, licensing, attribution, and provider-cost constraints
