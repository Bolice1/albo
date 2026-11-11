# Requirements

**Status:** Draft — validate with the team and proposal owners

## Functional requirements

- Users can register, authenticate, manage consent, and manage profiles.
- Users can enter or connect approved health, lifestyle, wellbeing, and environmental data.
- The system can calculate an explainable initial risk indicator from approved inputs.
- Users can view risk levels, contributing factors, limitations, and preventive next steps.
- The assistant can provide approved health information and wellness support.
- The system can show relevant facilities, providers, maps, and directions.
- Users can receive contextual notifications according to consent and preferences.
- Authorized providers can view permitted records and initiate approved consultations.
- Users can view trends and generate printable reports.
- Sensitive access and changes produce audit events.

## Non-functional requirements

- Privacy and security are designed before production data is used.
- APIs are authenticated, authorized, validated, versioned, and documented.
- Health records preserve integrity, transaction safety, backup, and recovery controls.
- AI outputs include limitations, uncertainty where relevant, and escalation guidance.
- Observability must not require logging sensitive payloads.
- Core behavior is covered by automated tests.
- The system can scale individual workloads without prematurely requiring microservices.

## Readiness rule

No requirement is implementation-ready until its actor, behavior, data access, failure behavior, privacy impact, and test approach are understood.
