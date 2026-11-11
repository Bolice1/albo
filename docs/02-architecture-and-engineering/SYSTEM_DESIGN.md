# System design

**Status:** Proposed

The system follows a layered flow: authenticated client request → API validation and authorization → domain module → persistence or queued work → optional AI/integration adapter → sanitized response and audit event.

Long-running work such as environmental ingestion, report generation, notifications, and model processing should use background jobs. User-facing responses must remain bounded, explainable, and safe when an external dependency is unavailable.

## Initial repository shape

```text
frontend/       Next.js application
backend/        NestJS modular monolith
ai-services/    FastAPI analytics and AI service
docs/           source-of-truth documentation
infrastructure/ local and deployment configuration
```

The implementation is not yet present. This layout is a proposed target, not permission to build every module immediately.
