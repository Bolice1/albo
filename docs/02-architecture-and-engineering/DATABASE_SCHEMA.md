# Database schema

**Status:** Conceptual draft — no migrations approved

## Core entities

User, role, consent, health profile, health record, wellbeing check-in, environmental observation, risk assessment, risk factor, facility, provider, consultation, notification, report, audit event, and model version.

## Required relationships

- A user has controlled profiles, consents, assessments, notifications, and audit history.
- A provider receives scoped access through explicit authorization, not ordinary ownership.
- A risk assessment references a model/rule version and the permitted input snapshot used.
- A facility may have a geospatial location and service capabilities.
- A consultation links authorized participants and has its own access policy.

## Data rules

Use constraints, timestamps, provenance, soft-deletion or retention policy where required, and geospatial indexes where needed. Never place real patient data in examples. Detailed fields require a privacy review before implementation.
