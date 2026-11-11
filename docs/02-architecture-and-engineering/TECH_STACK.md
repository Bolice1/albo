# Technology stack

**Status:** Proposed — validate against team skills, cost, hosting, and requirements

| Layer | Selection | Reason |
|---|---|---|
| Web | Next.js + TypeScript | Structured multi-view web application |
| UI | Tailwind CSS + shadcn/ui | Consistent accessible interface |
| Core API | NestJS + TypeScript | Modular backend, guards, validation, OpenAPI |
| AI service | Python + FastAPI | Data science and model ecosystem |
| Database | PostgreSQL + PostGIS | Relational integrity and geospatial queries |
| Cache/jobs | Redis + BullMQ | Caching, rate limits, and background work |
| ORM | Prisma | Typed database access and migrations |
| ML | Rules first; scikit-learn/XGBoost when justified | Progressive complexity and explainability |
| Auth | OIDC provider or Keycloak | Centralized identity and roles |
| Files | S3-compatible object storage | Reports and documents |
| API contract | OpenAPI/Swagger | Shared, testable API contract |
| Testing | Jest, Pytest, Playwright | Unit, service, and end-to-end coverage |
| Operations | Docker; OpenTelemetry/Grafana | Reproducibility and observability |

Do not add Kubernetes, multiple primary databases, a proprietary LLM, or microservices without a recorded decision.
