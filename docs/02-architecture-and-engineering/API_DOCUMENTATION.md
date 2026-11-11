# API documentation

**Status:** Contract template — endpoints are not approved yet

All APIs must define authentication, authorization, request validation, response shape, error codes, pagination, rate limits, audit behavior, and sensitive-field handling. OpenAPI is the generated contract once implementation begins.

## Candidate resource groups

`/auth`, `/users`, `/consents`, `/profiles`, `/health-records`, `/risk-assessments`, `/environment`, `/facilities`, `/providers`, `/consultations`, `/notifications`, `/reports`, and `/audit-events`.

Do not expose internal model inputs or provider credentials by default. Version breaking changes and document consent requirements per endpoint.
