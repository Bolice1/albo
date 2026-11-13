# Albo requirements

**Status:** Draft — validate with the team, proposal owners, and appropriate health stakeholders  
**Scope:** First release unless marked `Later`  
**Source:** `PROJECT_OVERVIEW.md`, `PROJECT_SCOPE.md`, and `Albo_Project_Proposal.docx`

## 1. How to read this document

`Must` requirements are candidates for the first release. `Should` requirements are important but may be staged. `Later` requirements belong to a future phase. A requirement is not approved merely because it appears here; it becomes implementation-ready after its owner, data, safety impact, and acceptance test are agreed.

## 2. Actors

| Actor | Description |
|---|---|
| Citizen | Person using Albo for personal preventive-health support |
| Family member | Person assisting a citizen only where explicit authorization exists |
| Healthcare provider | Authorized professional supporting one or more citizens |
| Facility or pharmacy user | Authorized representative of a healthcare organization |
| Community health worker | Approved worker supporting a defined community or assigned people |
| Platform administrator | Operator managing configuration and access without automatic health-record access |
| AI service | Internal service that calculates or prepares AI-related outputs, not a human actor |
| External provider | Approved weather, map, facility, device, identity, or health-data integration |

## 3. Functional requirements

### 3.1 Identity, onboarding, and consent

| ID | Priority | Requirement |
|---|---|---|
| FR-001 | Must | A citizen can create an account, sign in, sign out, and recover access through the approved identity system. |
| FR-002 | Must | The system explains Albo's purpose, data uses, AI limitations, and support boundaries during onboarding. |
| FR-003 | Must | A citizen can give, review, withdraw, and where appropriate update consent for each approved data category or use. |
| FR-004 | Must | The system records consent status, version, timestamp, actor, and purpose without storing unnecessary sensitive content. |
| FR-005 | Must | A user can view and update their permitted profile information. |
| FR-006 | Should | A user can request account or data deletion, export, or correction according to the approved retention policy. |

### 3.2 Profiles and personal information

| ID | Priority | Requirement |
|---|---|---|
| FR-007 | Must | A citizen can provide the limited health, lifestyle, wellbeing, and environmental fields approved for the first release. |
| FR-008 | Must | Each stored input records its source, collection time, and whether it was self-reported, imported, or generated. |
| FR-009 | Must | The system validates inputs, handles incomplete data, and tells the user when missing or stale information limits an output. |
| FR-010 | Later | A citizen can connect an approved health device or electronic health-record source after integration, consent, and governance approval. |

### 3.3 Dashboard and recommendations

| ID | Priority | Requirement |
|---|---|---|
| FR-011 | Must | A citizen can view a dashboard containing approved personal trends, current risk indicators, environmental summaries, and recommendations. |
| FR-012 | Must | Every risk indicator displays its timestamp, status, contributing factors, relevant source data, limitations, and suggested next step. |
| FR-013 | Must | The interface distinguishes a preventive risk indicator from a confirmed diagnosis or clinical judgment. |
| FR-014 | Must | Recommendations are limited to approved preventive guidance and do not independently prescribe treatment. |
| FR-015 | Should | A citizen can configure notification preferences for approved reminders and alerts. |

### 3.4 Risk indicators and analytics

| ID | Priority | Requirement |
|---|---|---|
| FR-016 | Must | The system calculates a documented, explainable rule-based or weighted risk indicator for each approved first-release use case. |
| FR-017 | Must | Each calculation records the rule-set version, inputs used, calculation time, and output limitations. |
| FR-018 | Must | The system does not calculate or display an indicator when required inputs are invalid, unauthorized, or insufficient without showing an appropriate limitation. |
| FR-019 | Must | Risk outputs can be reproduced for evaluation using the same input snapshot and rule-set version. |
| FR-020 | Later | A validated machine-learning model may be introduced only after clinical review, representative evaluation, fairness assessment, monitoring, and approval. |

### 3.5 Assistant and wellbeing support

| ID | Priority | Requirement |
|---|---|---|
| FR-021 | Should | A citizen can ask the assistant approved preventive-health and wellbeing questions in understandable language. |
| FR-022 | Should | The assistant can explain Albo outputs using only information the user is authorized to receive. |
| FR-023 | Must | The assistant communicates uncertainty and does not claim to diagnose, prescribe, or replace qualified care. |
| FR-024 | Must | Emergency, severe-symptom, and self-harm signals follow a reviewed escalation flow instead of relying only on an automated response. |
| FR-025 | Later | A dedicated mental-wellness hub is introduced only when its safety, referral, and clinical-review procedures are approved. |

### 3.6 Facilities, maps, and healthcare access

| ID | Priority | Requirement |
|---|---|---|
| FR-026 | Must | A citizen can search approved healthcare facilities and providers using relevant location and service criteria. |
| FR-027 | Must | The system shows the source and last-updated time of facility information where available. |
| FR-028 | Must | A citizen can view directions or location guidance without exposing precise location to parties that do not need it. |
| FR-029 | Should | A citizen can use an approved referral, contact, or consultation-request workflow. |
| FR-030 | Later | Live video consultations, device integrations, and full electronic health-record exchange require separate approved requirements. |

### 3.7 Provider and organization access

| ID | Priority | Requirement |
|---|---|---|
| FR-031 | Must | A provider can access only citizens, records, and actions allowed by role, assignment, consent, and organizational policy. |
| FR-032 | Must | A provider view clearly identifies data provenance, data age, model/rule version, and limitations. |
| FR-033 | Must | A provider can record permitted follow-up actions without silently changing the citizen's source data or AI output. |
| FR-034 | Should | An authorized provider can initiate a reviewed consultation or visit workflow. |
| FR-035 | Must | Platform administrators can manage approved configuration and accounts without automatically receiving unrestricted health-record access. |

### 3.8 Reports and auditability

| ID | Priority | Requirement |
|---|---|---|
| FR-036 | Must | A citizen can view approved historical trends over a selected period. |
| FR-037 | Must | A citizen can generate a printable report containing source, time range, limitations, and clear distinctions between reported, imported, generated, and clinically confirmed information. |
| FR-038 | Must | The system records auditable events for sensitive access, consent changes, risk calculations, provider actions, and relevant administrative changes. |
| FR-039 | Must | Audit records do not contain raw credentials or unnecessary health, identity, location, or AI-prompt content. |

## 4. Security, privacy, and data requirements

| ID | Priority | Requirement |
|---|---|---|
| DP-001 | Must | Sensitive data is collected only for a documented purpose and approved data category. |
| DP-002 | Must | Access to sensitive data requires authentication, authorization, least privilege, and applicable consent. |
| DP-003 | Must | The application never exposes Supabase/Auth-managed identity data directly to an untrusted client; application profiles use a controlled public data model. |
| DP-004 | Must | Secrets are stored outside source code, documentation, logs, fixtures, and client bundles. |
| DP-005 | Must | Development, demonstrations, and automated tests use synthetic or properly de-identified data. |
| DP-006 | Must | Data is protected in transit and at rest according to the approved security design. |
| DP-007 | Must | Retention, deletion, correction, export, consent withdrawal, backup, and recovery behavior are documented before production health data is used. |
| DP-008 | Must | Logs and telemetry minimize or redact sensitive payloads. |
| DP-009 | Must | External integrations are isolated, authenticated, rate-limited, time-bounded, and monitored for failure without leaking credentials. |

## 5. AI safety and governance requirements

| ID | Priority | Requirement |
|---|---|---|
| AI-001 | Must | AI features have a documented purpose, intended users, excluded uses, owner, version, and approval status. |
| AI-002 | Must | AI requests contain only the minimum authorized data required for the task. |
| AI-003 | Must | AI outputs show relevant uncertainty, limitations, provenance, and escalation guidance. |
| AI-004 | Must | The system prevents an AI output from being represented as a confirmed diagnosis or guaranteed prediction. |
| AI-005 | Must | AI behavior is evaluated for safety, factuality, privacy leakage, harmful advice, and regression before release. |
| AI-006 | Later | Predictive models require representative data, clinical validation, calibration, fairness review, monitoring, and rollback before operational use. |

## 6. Non-functional requirements

### Security and privacy

- **NFR-001:** All protected API operations enforce authentication and authorization.
- **NFR-002:** Authorization tests cover citizens, providers, community workers, administrators, and unauthorized access attempts.
- **NFR-003:** Security-sensitive actions are auditable without storing unnecessary sensitive payloads.

### Reliability and data integrity

- **NFR-004:** Database writes preserve referential integrity and use transactions where a partial write could create an unsafe state.
- **NFR-005:** External service failures produce safe, understandable fallbacks and do not fabricate data.
- **NFR-006:** Backups, restoration, migrations, and disaster-recovery expectations are documented before production.

### Performance and scalability

- **NFR-007:** The first release defines performance targets for the approved user journeys before performance testing.
- **NFR-008:** Long-running work such as report generation, data ingestion, notifications, and model processing can run asynchronously where appropriate.
- **NFR-009:** The design permits independent scaling of the web client, core API, background jobs, database, and AI service without requiring premature microservices.

### Usability and accessibility

- **NFR-010:** Health information, risk levels, consent, and limitations use plain language.
- **NFR-011:** Important information is not communicated by color alone.
- **NFR-012:** The approved first-release journeys are tested with representative users and accessibility checks.

### Maintainability and observability

- **NFR-013:** APIs, database changes, risk rules, integrations, and significant architecture decisions are documented and versioned.
- **NFR-014:** Core domain logic has automated unit and integration tests; critical journeys have end-to-end coverage.
- **NFR-015:** Metrics, traces, and logs support diagnosis without exposing sensitive health or identity information.

## 7. Requirement acceptance format

Before implementation, every approved requirement should have:

- A unique ID and priority
- An owner and affected actor
- Preconditions and authorized data
- Main success behavior
- Validation and failure behavior
- Privacy and safety impact
- Acceptance tests
- Related scope, architecture, API, and data documents

Example acceptance statement:

> Given an authenticated citizen with consented profile data, when an approved rule set calculates a risk indicator, then Albo stores the rule version and input snapshot, shows the contributing factors and limitations, and does not label the result as a diagnosis.

## 8. Requirement readiness rule

No requirement is implementation-ready until its actor, behavior, data access, failure behavior, privacy impact, safety impact, external dependencies, and test approach are understood and approved.

Requirements that conflict with `PROJECT_SCOPE.md`, `PROJECT_OVERVIEW.md`, or `AGENTS.md` must be resolved and documented before implementation begins.

## 9. Requirements still requiring validation

- First-release geography, language, and target users
- First-release risk use cases and clinical reviewers
- Approved data fields and data sources available in Rwanda
- Provider roles, assignments, and organization workflows
- Emergency and self-harm escalation procedure
- Applicable legal and regulatory obligations
- Retention, deletion, export, and consent withdrawal rules
- Performance, availability, and recovery targets
- Success metrics and evaluation population
