# Albo data privacy

**Status:** Approved — baseline privacy contract (production legal and retention gates tracked in `OPEN-007` and `OPEN-008`)  
**Owner:** Security and privacy (shared / collaborator-led)  
**Related:** [Access control](ACCESS_CONTROL.md), [Security](SECURITY.md), [Threat model](THREAT_MODEL.md), [Requirements](../01-project-foundation/REQUIREMENTS.md), [Project scope](../01-project-foundation/PROJECT_SCOPE.md), [Database schema](../02-architecture-and-engineering/DATABASE_SCHEMA.md), [API documentation](../02-architecture-and-engineering/API_DOCUMENTATION.md), [Integrations](../02-architecture-and-engineering/INTEGRATIONS.md), [UI/UX](../02-architecture-and-engineering/UI_UX.md)

## 1. Purpose and scope

This document defines how Albo collects, uses, shares, retains, and deletes personal data, and how people can exercise control over their data.

The proposal describes Albo as a platform that collects **consent-based** data, including lifestyle, stress, physical activity, diet, location-based environmental exposure, connected-device data, and electronic health records. Most of this is sensitive personal data. Privacy is therefore a core product requirement, not a later compliance task.

> [!IMPORTANT]
> This is an engineering privacy design, not legal advice. The legal summary in section 3 must be validated by qualified legal counsel before production health data is collected.

Items marked `Proposed` or `To validate` are not approved until accepted and recorded in [DECISIONS.md](../06-technical-decisions/DECISIONS.md).

## 2. Privacy principles

1. **Purpose limitation.** Data is collected only for a documented purpose and approved category (DP-001).
2. **Data minimization.** Collect the fewest fields, lowest precision, and shortest history that the purpose needs.
3. **Consent and transparency.** People understand what is collected, why, who sees it, and its limits before it is collected (FR-002, FR-003).
4. **User control.** People can review, withdraw, correct, export, and request deletion according to approved policy (FR-003, FR-006).
5. **Storage limitation.** Every category has a retention decision before production use (DP-007).
6. **Accuracy and provenance.** Every input records its source, time, and type (FR-008).
7. **Privacy by default.** Optional data, provider sharing, and notifications start off until the user opts in.
8. **No secondary use without approval.** Data is not reused for model training, research, analytics, or partners without a separate approved purpose and consent.
9. **Synthetic data outside production** (DP-005).

## 3. Legal and regulatory context (To validate)

The first-release geography is still an open decision (REQUIREMENTS §9). The proposal is grounded in Rwanda, so Rwanda's data-protection law is the primary candidate framework.

### 3.1 Rwanda — Law N° 058/2021 of 13/10/2021 relating to the protection of personal data and privacy

Points relevant to Albo, to be confirmed by legal counsel:

| Topic | Summary | Albo implication |
|---|---|---|
| Supervisory authority | National Cyber Security Authority (NCSA), through its data protection office | Albo's controller organization identifies its regulator contact |
| Registration | Data controllers and processors must register with NCSA | Registration before processing real personal data |
| Sensitive data | Health data is sensitive personal data with stricter processing conditions | Explicit consent and stronger safeguards for health, wellbeing, and mental-health data |
| Data subject rights | Includes access, rectification, erasure, objection, restriction, portability, and rights related to automated decision-making | Product flows for each right (section 9) |
| Children | Processing a child's data requires consent from a holder of parental responsibility; minor threshold reported as under 16 | Age policy required (section 10) |
| Storage location | Personal data is expected to be stored in Rwanda unless NCSA authorizes storage outside Rwanda | Hosting choice directly affected (section 12) |
| Breach notification | Reported as notification to NCSA within 48 hours of awareness, with a follow-up report; affected people notified when high risk | Incident-response process in [SECURITY.md](SECURITY.md) §15 must meet this timeline |

### 3.2 Other frameworks

If Albo later serves users outside Rwanda (the proposal describes global ambitions), each new jurisdiction requires its own legal review before launch. Global expansion is not in first-release scope.

### 3.3 Health-sector rules

Rules that apply to health-service providers, health-information exchange, telemedicine, and clinical records in Rwanda must be identified before provider access, consultations, or EHR integration are enabled. To validate.

## 4. Roles and responsibilities

| Role | Responsibility | Status |
|---|---|---|
| Data controller | The legal entity operating Albo that decides purposes and means of processing | To decide — legal entity not yet defined |
| Data protection officer or privacy owner | Owns this policy, privacy reviews, rights requests, and regulator contact | To assign |
| Data processors | Vendors processing data on Albo's behalf (hosting, identity, notifications, maps, model providers) | Each requires a data-processing agreement |
| Healthcare organizations | Providers and facilities accessing assigned citizen data | Controller/processor relationship to be defined before provider access is enabled |
| Engineering team | Implements privacy controls and never uses real personal data in development | Ongoing |

## 5. Personal data inventory

Categories come from the proposal and DATABASE_SCHEMA. First-release fields require approval (REQUIREMENTS §9).

| Category | Examples | Classification | Source | Release |
|---|---|---|---|---|
| Account | Application account ID, status, language, timezone | Account | User / system | First release |
| Identity | Name, email, phone, credentials | Highly restricted | Identity provider | First release (held by identity provider) |
| Lifestyle and behavior | Activity, diet, sleep, tobacco or alcohol habits | Sensitive | Self-reported | First release, approved fields only |
| Health history | Chronic conditions, relevant history | Sensitive | Self-reported | To validate, allowlisted fields only |
| Wellbeing check-ins | Stress, mood, exhaustion responses | Sensitive | Self-reported | First release, subject to safety review |
| Assistant conversations | Messages with the AI assistant | Sensitive | User input | Should / safety gate |
| Location | Area for environmental context, location for facility search | Sensitive when precise | Device / user | First release, minimum precision |
| Environmental observations | Weather, air quality, rainfall by area | Public / non-personal unless linked to a person | External sources | First release, source dependent |
| Derived outputs | Risk indicators, recommendations, reports | Derived (sensitive) | Generated | First release |
| Consent records | Purpose, version, status, timestamps | Account | System | First release |
| Provider relationships | Assignments, referrals, follow-up actions | Sensitive | System / provider | Open decision |
| Device data | Apple Health, Google Fit, Fitbit | Sensitive | Imported | Later (FR-010) |
| Electronic health records | Clinical records | Highly restricted | Imported | Later (FR-010, FR-030) |
| Genetic data | Mentioned as optional in the proposal | Highly restricted | Imported | **Excluded** until a separate legal, ethical, and safety approval |
| Audit and telemetry | Actor, action, resource ID, request ID | Account / operational | System | First release, no sensitive payloads |

## 6. Purposes and lawful basis

Each processing activity is linked to a consent purpose (DATABASE_SCHEMA §5.1). Per [ADR-015](../06-technical-decisions/DECISIONS.md), the nine canonical `v1` `consent_purpose.code` values below are standardized for backend enforcement in synthetic development/testing (final production legal wording remains tracked under `OPEN-007`/`OPEN-008`):

| Processing activity | Canonical `code` (`v1`) | Data used | Basis |
|---|---|---|---|
| Provide account and service | *(Service baseline — non-optional)* | Account, identity mapping | Necessary to provide the service (to validate, `OPEN-007`) |
| Store health and lifestyle inputs | `health_input_storage` | Approved health inputs | Explicit consent |
| Store wellbeing check-ins | `wellbeing_check_ins` | Check-in responses | Explicit consent (`FEATURE_CHECKINS_ENABLED`) |
| Calculate preventive risk indicators | `preventive_risk_calculation` | Inputs, environmental context | Explicit consent |
| Use location for environmental context | `environmental_context` | Area-level location | Explicit consent |
| Use location for facility search | `facility_location_search` | Location for the current search | Explicit consent, per use or session |
| Share data with an assigned provider | `provider_data_sharing` | Scoped records per assignment | Explicit consent per provider/organization (`FEATURE_PROVIDER_PORTAL_ENABLED`) |
| Send notifications | `notifications_delivery` | Contact channel, notification category | Opt-in |
| Generate reports | `report_generation` | User's own records | Explicit consent / user request |
| Assistant conversations | `assistant_conversations` | Messages, minimum context | Explicit consent (`FEATURE_ASSISTANT_ENABLED`) |
| Security and audit | *(Operational / legal baseline)* | Audit events, operational logs | Legal obligation / legitimate security need (to validate, `OPEN-007`) |

The following uses are **not approved** and require a new purpose, consent, and review:

- Training or fine-tuning machine-learning models on user data
- Research or publication
- Sharing with public-health authorities, insurers, employers, or advertisers
- Marketing or advertising
- Selling data in any form

Aggregated public-health reporting is a later phase and requires an approved aggregation and de-identification method (PROJECT_SCOPE).

## 7. Consent management

### 7.1 Requirements

- Consent is granular by purpose; one checkbox must not cover unrelated purposes.
- Consent text is plain-language and versioned (NFR-010).
- Each record stores purpose, version, status, timestamp, actor, and policy version without unnecessary sensitive content (FR-004).
- The core API checks consent at processing time, not only at collection ([ACCESS_CONTROL.md](ACCESS_CONTROL.md) §8).
- Refusing optional consent must not block unrelated features.
- Consent changes are audited (FR-038).

### 7.2 Changes to purposes

When a purpose's wording or data categories change materially, a new version is created and users are asked to review it. Processing under the new version requires new consent.

### 7.3 Withdrawal

Withdrawal is as easy as granting. The proposed effects are defined in [ACCESS_CONTROL.md](ACCESS_CONTROL.md) §8.1: future access and processing stop; stored data and derived outputs follow the retention and deletion policy below. The user is told clearly what withdrawal does and does not delete.

## 8. Retention and deletion

No retention periods are approved yet (DATABASE_SCHEMA §15). Before production health data is used, each category requires an approved period and end-of-retention action.

| Category | Proposed retention approach | Period |
|---|---|---|
| Account | While the account is active, then deletion after an approved grace period | To decide |
| Health inputs and check-ins | While consent is active and the account exists; superseded values retained only as needed for provenance | To decide |
| Assistant conversations | Minimal storage; shortest period needed for the user experience and safety review | To decide |
| Precise location | Not stored by default; used transiently for a search | Transient unless approved |
| Risk assessments and input snapshots | Retained for user history and reproducibility while the account exists | To decide |
| Reports | Short-lived files; metadata retained for audit | To decide |
| Notifications | Delivery records retained briefly | To decide |
| Consent records | Retained as evidence of consent beyond account deletion where law requires | To decide |
| Audit events | Retained for accountability; must not contain sensitive payloads | To decide |
| Backups | Expire on a fixed cycle; deleted data disappears when backups expire | To decide |

### 8.1 Account deletion (Proposed)

1. User requests deletion and confirms.
2. Account is suspended immediately and provider access ends.
3. After an approved grace period, personal records are deleted or irreversibly de-identified.
4. Records that must be kept by law (for example, consent evidence or audit events) are retained in minimized form.
5. Object-storage files are deleted.
6. Deletion propagates to processors where they hold copies.
7. Backups expire on their normal cycle and are not restored into production without re-applying deletions.

Destructive cascades are avoided where traceability is required; status changes and controlled deletion are preferred (DATABASE_SCHEMA §15).

## 9. Data subject rights

| Right | Albo mechanism | Requirement | Status |
|---|---|---|---|
| Be informed | Onboarding explanation, privacy notice, consent text | FR-002 | First release |
| Access | View own profile, inputs, assessments, consents, and reports | FR-005, FR-011, FR-036 | First release |
| Rectification | Correct editable inputs via immutable supersession (`supersedes_input_id`, [ADR-017](../06-technical-decisions/DECISIONS.md)) | FR-005, FR-008 | First release |
| Withdraw consent | Consent management screen | FR-003 | First release |
| Erasure | Account and data deletion request | FR-006 | Should |
| Portability / export | Machine-readable export of own data | FR-006 | Should |
| Restriction and objection | Withdraw specific purposes; pause processing | FR-003 | To validate |
| Automated decision-making | See section 9.1 | FR-013, AI-004 | First release |

Requests are verified against the authenticated account, completed within the period required by law (to validate), and audited.

### 9.1 Automated processing

Albo's risk indicators are generated automatically. To respect rights related to automated decision-making:

- Indicators are preventive and non-diagnostic, and are presented as such (FR-013, AI-004).
- Albo does not make legal, insurance, employment, or treatment decisions about anyone.
- Every indicator shows contributing factors, data used, limitations, and a next step (FR-012).
- Users can see which inputs were used and correct them.
- Provider follow-up is a human decision and does not silently change source data or AI output (FR-033).

## 10. Children and vulnerable users

- **First-release target population ([ADR-010](../06-technical-decisions/DECISIONS.md)):** Limited to **adult citizens in Rwanda (`18+`)**; minors are excluded until a guardian-consent flow, age verification approach, and child-safety review are approved (`OPEN-007`).
- Mental-health and self-harm signals require the reviewed escalation flow (FR-024, `ADR-006`).
- Family-member access requires an approved delegation model ([ACCESS_CONTROL.md](ACCESS_CONTROL.md) §4).

## 11. Sharing and disclosure

| Recipient | What may be shared | Conditions |
|---|---|---|
| Assigned provider or community health worker | Scoped records per assignment | Active assignment and explicit consent ([ACCESS_CONTROL.md](ACCESS_CONTROL.md) §7) |
| Facility receiving a referral | Minimum information needed for the referral | User-initiated, consent recorded (FR-029) |
| AI service (internal) | Minimum input snapshot | Consent checked by the core API (AI-002) |
| Map, geocoding, routing provider | Search location at the lowest workable precision | No identity attached where possible |
| Notification provider | Contact channel and generic message | No health details in message bodies |
| Identity provider | Identity and authentication data | Data-processing agreement |
| Hosting and storage providers | Encrypted data at rest | Data-processing agreement; residency per section 12 |
| External AI model provider | None approved | Requires separate review of retention, training use, and residency |
| Authorities | Only where legally required | Legal review; disclosure logged |

Albo never sells personal data.

## 12. Data residency and cross-border transfers

- Hosting location and data residency are open decisions (TECH_STACK §16).
- Given the reported Rwandan storage expectation (section 3.1), the default options are: host personal data in Rwanda, or obtain NCSA authorization before storing it elsewhere.
- Every processor's storage location is recorded before it receives personal data.
- No personal data is sent to a third-party AI or analytics service outside approved residency without review.

## 13. Privacy in engineering

- Health information stays out of URLs, query strings, analytics, and browser logs (TECH_STACK §3).
- Logs, traces, and audit events exclude sensitive payloads (DP-008, FR-039).
- Precise coordinates are not stored with environmental observations; area or grid references are preferred (DATABASE_SCHEMA §6.3).
- Free-text sensitive fields are avoided unless a reviewed use case requires them (DATABASE_SCHEMA §6.1).
- Fixtures, seeds, demos, screenshots, prompts, and evaluation sets use synthetic data only (AGENTS.md).
- New fields, integrations, or purposes require a privacy review before implementation (section 14).
- Responses use field allowlists per role ([ACCESS_CONTROL.md](ACCESS_CONTROL.md) §11.1).

## 14. Privacy impact assessment (Proposed)

A privacy impact assessment is completed before:

- Collecting real personal data for the first time
- Adding a new data category, purpose, or sensitive field
- Enabling provider access, consultations, or referrals
- Adding device, EHR, or external AI-model integrations
- Launching in a new jurisdiction

The assessment records the purpose, data, recipients, retention, residency, risks, mitigations, and approver. Outcomes are summarized in [DECISIONS.md](../06-technical-decisions/DECISIONS.md).

## 15. Personal data breaches

Breach handling follows the incident-response process in [SECURITY.md](SECURITY.md) §15, with privacy-specific requirements:

- Assess which people and data categories are affected, using audit events.
- Notify the supervisory authority within the legally required period (reported as 48 hours in Rwanda — to validate).
- Notify affected people when the breach is likely to cause high risk, in plain language with recommended actions.
- Processors must notify Albo promptly under their data-processing agreements.
- Record every breach, including those not notified, with the decision rationale.

## 16. First-release privacy baseline

Aligned with the first vertical slice in [PROJECT_STATUS.md](../PROJECT_STATUS.md):

- Onboarding explanation of purpose, data use, AI limitations, and support boundaries
- Granular, versioned consent with withdrawal
- Allowlisted, minimum health inputs with provenance
- Consent checked before risk calculation
- Users can view and correct their own data
- No provider sharing until approved
- No precise-location storage by default
- No secondary use of data
- Synthetic data in all non-production environments
- Retention periods and controller registration approved before real data is collected

## 17. Acceptance criteria

The privacy design is ready for production use when:

- Legal counsel has validated the applicable framework and obligations.
- The data controller entity and privacy owner are named.
- Registration with the supervisory authority is complete where required.
- First-release data fields and purposes are approved.
- Retention periods and deletion behavior are approved.
- Hosting location satisfies residency requirements.
- Data-processing agreements exist for all processors.
- The privacy notice and consent texts are reviewed and versioned.
- A privacy impact assessment for the first release is approved.

## 18. Open and resolved privacy decisions

### Resolved for synthetic Slice 1 & backend onboarding
- **First-release target geography and minimum age:** **Resolved in [ADR-010](../06-technical-decisions/DECISIONS.md)** — adult citizens (`18+`) in Rwanda (minors excluded until guardian consent is approved).
- **First-release data fields and canonical `v1` consent purpose codes:** **Resolved in [ADR-010](../06-technical-decisions/DECISIONS.md) & [ADR-015](../06-technical-decisions/DECISIONS.md)** for synthetic development/testing; health-input rectification uses immutable supersession (`ADR-017`).

### Remaining pre-production legal & retention decisions (`OPEN-007`, `OPEN-008`)
- Legal counsel sign-off on Rwanda Law N° 058/2021 obligations, data controller entity, DPO/privacy owner, NCSA registration, final production consent wording, and hosting residency (`OPEN-007` in [DECISIONS.md](../06-technical-decisions/DECISIONS.md))
- Retention periods per category, backup expiry cycle, account-deletion grace period, legally retained minimized records, and rights-request SLA (`OPEN-008`)
- Assistant conversation retention duration (`OPEN-008`, `OPEN-011`) and provider/facility controller-processor agreements (`OPEN-009`)

## 19. Discrepancies to resolve

| Topic | Observation | Action |
|---|---|---|
| Genetic data | The proposal mentions optional genetic data during onboarding; no requirement, scope item, or schema entity covers it | Confirm exclusion from scope or define a separately approved requirement |
| Data residency | Rwanda's reported storage expectation may constrain hosting, which TECH_STACK leaves open | Make the hosting decision with residency as a requirement |
