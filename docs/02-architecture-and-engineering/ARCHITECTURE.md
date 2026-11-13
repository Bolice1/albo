# Architecture

**Status:** Proposed — owner: project foundation and architecture lead

## Direction

Start with a modular monolith for the core application plus a separate Python AI service. This keeps domains explicit while limiting early operational complexity. Extract services only when scale, isolation, or ownership justifies it.

## High-level components

```text
Web client (Next.js)
        |
Core API / business modules (NestJS)
   |         |          |
PostgreSQL  Redis       external integrations
   |
AI service (FastAPI) -> rules, analytics, model adapters
```

The core API owns identity, consent, authorization, workflows, records, notifications, facilities, consultations, and audit. The AI service owns data preparation, risk calculations, model execution, and model metadata. It must not become a second user-management system.

## Domain modules

Auth, users, citizens, providers, health records, consent, risk assessment, environmental data, facilities, consultations, notifications, reports, and audit logs.

## Architectural constraints

- All access to sensitive data passes through authorization and consent checks.
- AI requests contain only the minimum permitted data.
- Risk outputs include version, inputs used, timestamp, explanation, and limitations.
- External providers are isolated behind adapters.
- Module boundaries are enforced in code and documented when changed.
