# Albo database schema

**Status:** Conceptual draft — no migrations approved  
**Primary store:** PostgreSQL; PostGIS only for approved geographic use cases  
**Related:** [Architecture](ARCHITECTURE.md), [API documentation](API_DOCUMENTATION.md), [Requirements](../01-project-foundation/REQUIREMENTS.md)

## 1. Purpose and scope

This document defines the proposed data domains, relationships, ownership rules, provenance requirements, and database constraints for Albo.

It is not a final SQL migration. Exact fields, retention periods, legal classifications, and clinical record structures require review before implementation. The first release should implement only the entities required by the approved first-release user journeys.

## 2. Database principles

- PostgreSQL is the durable source of truth for approved application records.
- PostGIS is used only where geographic queries are an approved product requirement.
- Redis is not the primary store for health or identity records.
- Every sensitive record has an owner, access policy, source, timestamp, and retention decision.
- Derived outputs retain the rule/model version and source-input reference needed for explanation and reproduction.
- Identity-provider-managed records remain in the identity provider's protected schema; application data references the provider subject ID.
- Foreign keys, uniqueness, check constraints, and transactions protect integrity.
- Real patient data is never used in examples, fixtures, local development, or demonstrations.
- JSON is used only for bounded, versioned, genuinely variable data—not as a replacement for the core relational model.

## 3. Conceptual relationship model

```text
Identity subject ── 1:1 ── User account ── 1:N ── Consent records
                              │       │
                              │       ├─ 1:N ── Health inputs
                              │       ├─ 1:N ── Wellbeing check-ins
                              │       ├─ 1:N ── Risk assessments
                              │       ├─ 1:N ── Notifications
                              │       ├─ 1:N ── Reports
                              │       └─ 1:N ── Referrals / consultations
                              │
                              └─ N:M ── Organizations / roles

Risk use case ── 1:N ── Risk assessments ── N:1 ── Rule/model version
                                  │
                                  └─ 1:1 ── Immutable input snapshot

Facility ── 1:N ── Facility services
Provider ── N:M ── Organizations
Provider assignment ── scopes provider access to a user or group

All sensitive domains ── 1:N ── Audit events
```

## 4. Identity and access domain

### 4.1 Identity subject

Managed by the approved identity provider. The application stores only the external subject identifier and the minimum mapping metadata required for authorization.

Candidate attributes:

- `id` — immutable provider subject ID
- `provider` — identity-provider identifier
- `created_at`, `last_seen_at`
- `status` — active, suspended, or deleted mapping

Do not duplicate passwords, access tokens, recovery secrets, or full identity-provider records in the application database.

### 4.2 User account

Application-level account record linked one-to-one to an identity subject.

Candidate attributes:

- `id`
- `identity_subject_id` — unique foreign key
- `account_status`
- `preferred_language` — only after language scope is approved
- `timezone`
- `created_at`, `updated_at`, `deleted_at` where policy requires it

### 4.3 Roles, organizations, and assignments

Candidate entities:

- `role`
- `organization`
- `organization_membership`
- `provider_profile`
- `provider_assignment`

An assignment should specify the provider, target user or approved group, organization, scope, start/end dates, and status. A role alone must not grant unrestricted access to health records.

## 5. Consent domain

### 5.1 Consent purpose

Defines a documented reason for processing, such as storing a wellbeing check-in, calculating an approved risk indicator, sharing information with an assigned provider, or using an external integration.

Candidate attributes:

- `id`
- `code` — stable machine-readable purpose
- `version`
- `description`
- `data_categories`
- `status` — draft, active, retired

### 5.2 Consent record

Records a user's decision for a purpose and version.

Candidate attributes:

- `id`
- `user_account_id`
- `consent_purpose_id`
- `status` — granted, withdrawn, expired, or rejected
- `granted_at`, `withdrawn_at`, `expires_at`
- `recorded_by`
- `policy_version`

Consent changes must be auditable. Withdrawal must define whether it stops future collection only, prevents future processing, removes derived outputs, or triggers deletion subject to approved policy.

## 6. Personal health and wellbeing domain

### 6.1 Health input

Stores an approved user-provided or imported data point. The first release should use an allowlist of fields rather than accepting arbitrary clinical data.

Candidate attributes:

- `id`
- `user_account_id`
- `category` — lifestyle, activity, diet, health history, environmental exposure, or approved category
- `field_code`
- `value` or a controlled typed representation
- `unit`, where applicable
- `observed_at`
- `source_type` — self-reported, imported, provider-recorded, or generated
- `source_reference`
- `created_at`, `updated_at`
- `valid_from`, `valid_until`, where applicable
- `status` — active, corrected, superseded, or retracted

Do not use unrestricted free-text fields for sensitive clinical information unless a specific reviewed use case requires them.

### 6.2 Wellbeing check-in

Stores a structured check-in using approved questions and response options.

Candidate attributes:

- `id`
- `user_account_id`
- `questionnaire_version`
- `responses` — bounded, versioned structure
- `completed_at`
- `source_type`
- `safety_status` — normal, needs-review, or escalated according to the approved workflow

Responses require a separate safety and retention review. The database must not imply a clinical diagnosis from a check-in status.

### 6.3 Environmental observation

Stores normalized environmental information used for display or an approved calculation.

Candidate attributes:

- `id`
- `source_id`
- `observation_type` — weather, air quality, rainfall, or approved type
- `observed_at`
- `location_area_id` or privacy-preserving geographic reference
- `value`, `unit`
- `quality_status`
- `source_timestamp`
- `ingested_at`

Precise user coordinates should not be stored with environmental observations unless required, approved, and protected. Prefer an appropriate area, grid, or geohash precision.

## 7. Provenance and external-source domain

### 7.1 Data source

Defines an approved external or internal source.

Candidate attributes:

- `id`
- `name`
- `source_type`
- `owner`
- `purpose`
- `trust or quality status`
- `terms_reference`
- `last_reviewed_at`

### 7.2 Ingestion record

Records a fetch or import attempt without storing credentials or unrestricted raw payloads.

Candidate attributes:

- `id`
- `data_source_id`
- `started_at`, `completed_at`
- `status`
- `items_received`, `items_accepted`
- `error_code`, sanitized error summary
- `source_cursor` or bounded synchronization marker

External data must not become a clinical input automatically. Its purpose, freshness, transformation, and permitted consumers must be documented.

## 8. Risk and AI domain

### 8.1 Risk use case

Defines an approved use case such as a preventive indicator for an agreed condition or concern.

Candidate attributes:

- `id`
- `code`, `name`, `description`
- `intended_use`
- `excluded_use`
- `required_input_categories`
- `status` — draft, approved, retired
- `clinical_review_status`, where applicable

### 8.2 Rule/model version

Defines the exact version used to produce a derived output.

Candidate attributes:

- `id`
- `risk_use_case_id`
- `version`
- `implementation_type` — rule, weighted score, or approved model
- `configuration_reference`
- `effective_from`, `retired_at`
- `approval_status`
- `limitations`
- `evaluation_reference`

Secrets, proprietary prompts, and private training data must not be stored in ordinary database records.

### 8.3 Input snapshot

An immutable, minimum-necessary reference to the authorized inputs used for one calculation.

Candidate attributes:

- `id`
- `user_account_id`
- `risk_use_case_id`
- `created_at`
- `consent_reference`
- `input_summary` or references to versioned inputs
- `data_quality_status`
- `expires_at`, if applicable

The snapshot should support reproducibility without copying more sensitive information than necessary.

### 8.4 Risk assessment

Stores the resulting preventive indicator.

Candidate attributes:

- `id`
- `user_account_id`
- `risk_use_case_id`
- `rule_model_version_id`
- `input_snapshot_id`
- `status` — queued, processing, complete, limited, failed, or superseded
- `level` — only approved, documented levels
- `calculated_at`
- `contributing_factors`
- `limitations`
- `recommended_next_steps`
- `created_at`

The schema and API must make it impossible or clearly invalid to represent this record as a confirmed diagnosis.

## 9. Healthcare access domain

### 9.1 Facility

Stores an approved healthcare facility or service location.

Candidate attributes:

- `id`
- `name`
- `facility_type`
- `status`
- `address`
- `location` — PostGIS point or approved geographic representation
- `contact_details`
- `source_id`, `source_reference`
- `last_verified_at`
- `created_at`, `updated_at`

### 9.2 Facility service

Stores the services a facility offers, with status and freshness information. Do not imply availability in real time unless the source supports it.

### 9.3 Referral or consultation

Stores a controlled interaction or request between authorized parties.

Candidate attributes:

- `id`
- `citizen_user_id`
- `provider_id` or `facility_id`
- `created_by`
- `type`
- `status`
- `purpose`
- `consent_reference`
- `scheduled_at`, where applicable
- `created_at`, `updated_at`

Live consultation content and clinical records require additional approval and must not be added merely because a referral table exists.

## 10. Notification and reporting domain

### 10.1 Notification preference

Stores user-approved channels, categories, quiet hours, and opt-in status. Preferences must not override safety or consent requirements.

### 10.2 Notification

Stores a bounded notification event and delivery state.

Candidate attributes:

- `id`
- `user_account_id`
- `category`
- `source_reference`
- `content_template_version`
- `status`
- `scheduled_at`, `sent_at`, `failed_at`
- `failure_code`

Avoid storing unnecessary health details in notification bodies. Prefer a protected in-app reference.

### 10.3 Report and report access

`report` stores the request, status, time range, source references, template version, and file location reference. `report_access` records who may view or download it and until when.

Report files belong in controlled object storage, not as unbounded binary data in the primary database, unless a later decision requires otherwise.

## 11. Audit domain

### Audit event

Append-oriented record of sensitive access or change.

Candidate attributes:

- `id`
- `occurred_at`
- `actor_id` and actor type
- `action`
- `resource_type`, `resource_id`
- `outcome`
- `request_id`
- `organization_id`, where applicable
- `reason or purpose code`, where required
- `metadata` — allowlisted, redacted, and bounded

Audit events must not contain passwords, access tokens, raw prompts, or unnecessary health, identity, or precise-location payloads.

## 12. Data classification

| Classification | Examples | Minimum handling |
|---|---|---|
| Public | Approved facility name, public service description | Source, freshness, integrity, moderation |
| Account | User preferences, application status | Authenticated access and user control |
| Sensitive | Health inputs, wellbeing responses, risk assessments, precise location | Least privilege, consent, encryption/protection, audit |
| Highly restricted | Identity-provider data, credentials, raw clinical records, private prompts | Restricted service access, never client-exposed by default |
| Derived | Risk levels, recommendations, reports | Provenance, version, limitations, access control |

Classification must be confirmed with the privacy and security owners before production use.

## 13. Integrity constraints and invariants

- Identity subject IDs are immutable and unique.
- A user cannot have two active application accounts for the same identity subject without an approved merge process.
- Consent records reference a valid purpose and version.
- A risk assessment references exactly one approved or explicitly recorded rule/model version and input snapshot.
- A derived result cannot be marked complete when required input validation failed.
- Provider access requires a valid, non-expired role, assignment, and applicable consent.
- Facility and provider source references are unique within their source where possible.
- Audit events are append-oriented and not casually edited or deleted.
- Foreign keys use controlled deletion behavior; sensitive records are not cascaded away accidentally.
- Timestamps are stored in UTC.

## 14. Indexing and geographic queries

Indexes should be added only for approved access patterns, including:

- Identity subject lookup
- User-owned records by `user_account_id` and time
- Active consent by user and purpose
- Risk assessments by user, use case, and calculated time
- Provider assignments by provider, user, organization, and status
- Notifications by user and delivery status
- Reports by user and status
- Audit events by resource, actor, and time
- Facility location using a PostGIS spatial index where needed

Every index involving sensitive data should have a documented query purpose and performance justification.

## 15. Retention, correction, and deletion

Retention periods are not yet approved. Before production health data is used, define:

- Retention by data category and purpose
- Consent withdrawal behavior
- Correction and supersession behavior
- Account deletion and legal hold behavior
- Derived risk and report deletion behavior
- Backup expiry and restoration handling
- Audit-retention requirements

Prefer status changes, supersession, or controlled deletion over destructive cascades when traceability or legal obligations require preservation.

## 16. Migration and implementation rules

- All schema changes use reviewed, versioned migrations.
- Migrations must be safe for the deployment sequence and include rollback or recovery instructions where practical.
- Production data is never used to test an unreviewed migration.
- Seed data is synthetic and clearly separated from migrations.
- Database permissions follow module ownership and least privilege.
- Row-level authorization is enforced at the application boundary and, where appropriate, at the database layer.
- Schema changes update the API contract, requirements, tests, and relevant decision records.

## 17. First-release entity set

The likely minimum first-release set is:

- Identity subject mapping and user account
- Roles and provider assignments, if provider access is included
- Consent purpose and consent record
- Approved health inputs and wellbeing check-ins
- Risk use case, rule/model version, input snapshot, and risk assessment
- Facility and facility service
- Notification preference and notification
- Report and report access
- Audit event

Device connections, full clinical records, EHR resources, live consultation content, advanced model artifacts, and broad public-health datasets remain later or separately approved domains.

## 18. Open schema decisions

- Final application naming: `users`, `profiles`, or `user_accounts`
- Exact first-release health-input fields and types
- Whether provider access is included in the first release
- Consent granularity and withdrawal behavior
- Location precision and geographic representation
- Risk-level vocabulary and factor representation
- Whether input snapshots store references, bounded summaries, or encrypted copies
- Retention, deletion, and audit periods
- Database migration and ORM conventions
- Row-level security and database-role strategy
