# Albo

Albo is an AI-powered preventive digital health hub designed to help people identify possible health risks earlier, understand modifiable and environmental factors, and connect with appropriate healthcare services.

## Project status

All six engineering documentation areas (`01-project-foundation` through `06-technical-decisions`) are **approved**, and the complete **Backend (`backend/`)** and **AI Services (`ai-services/`)** platform—including PostgreSQL/PostGIS migrations, BullMQ background workers, the 7 pre-release AI safety evaluation suites, Docker packaging, and GitHub Actions CI—is **implemented and verified** (`frontend/` is deferred to a separate onboarding track per [ADR-016](docs/06-technical-decisions/DECISIONS.md)).

## Repository layout

```text
backend/             NestJS modular monolith + BullMQ job worker (Bun + TypeScript strict + Prisma/PostGIS)
ai-services/         Internal FastAPI risk engine, safety screeners, Stage-1 assistant & 7 safety suites (Python 3.12 + uv)
infrastructure/      Local Docker Compose dependencies & PostGIS bootstrap SQL
docker-compose.yml   Full hardened local container stack (edge + private network isolation)
.github/workflows/   CI pipeline (Gitleaks, Ruff/Mypy/Pytest, PostGIS migrations, Bun Lint/Typecheck/Jest, Docker builds)
docs/                Authoritative product, architecture, security, privacy, AI, and decision contracts
```

## Quick start (local development with 100% synthetic data)

### Option A — Full containerized stack (`docker compose`)

```bash
cp .env.example .env
docker compose up --build -d
curl -fsS http://127.0.0.1:4000/health/ready
```

Only `core-api` binds to `127.0.0.1:4000`; `postgres` (PostGIS 16), `redis`, `minio`, `ai-services`, and `job-worker` run isolated on the internal `private` Docker network.

### Option B — Local workstation services (`Bun` + `uv`)

1. Start local infrastructure dependencies (PostGIS, Redis, MinIO):
   ```bash
   docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
   ```
2. Run `ai-services` (`Python 3.12` + `uv`):
   ```bash
   cd ai-services
   cp .env.example .env
   uv sync --frozen
   uv run ruff check .
   uv run mypy --strict app data_processing risk_engine model_adapters evaluation
   uv run pytest -v
   uv run uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
   ```
3. Run `backend` (**Bun** + NestJS + Prisma):
   ```bash
   cd backend
   cp .env.example .env
   bun install --frozen-lockfile
   bun x prisma migrate deploy
   bun run seed:synthetic
   bun run lint
   bun run typecheck
   bun run test
   bun run start:dev
   ```
   *(In non-production environments, interactive OpenAPI documentation is served at `http://127.0.0.1:4000/api/docs`.)*

## Documentation map

- [Project documentation status](docs/PROJECT_STATUS.md)
- [Documentation map](docs/README.md)
- [AI development instructions](AGENTS.md)
- [Project overview](docs/01-project-foundation/PROJECT_OVERVIEW.md)
- [Project requirements](docs/01-project-foundation/REQUIREMENTS.md)
- [Project scope](docs/01-project-foundation/PROJECT_SCOPE.md)
- [Roadmap](docs/01-project-foundation/ROADMAP.md)
- [Architecture](docs/02-architecture-and-engineering/ARCHITECTURE.md)
- [System design](docs/02-architecture-and-engineering/SYSTEM_DESIGN.md)
- [Technology stack](docs/02-architecture-and-engineering/TECH_STACK.md)
- [API documentation](docs/02-architecture-and-engineering/API_DOCUMENTATION.md)
- [Database schema](docs/02-architecture-and-engineering/DATABASE_SCHEMA.md)
- [Access control](docs/03-security-and-privacy/ACCESS_CONTROL.md)
- [Security](docs/03-security-and-privacy/SECURITY.md)
- [Data privacy](docs/03-security-and-privacy/DATA_PRIVACY.md)
- [AI architecture](docs/04-artificial-intelligence/AI_ARCHITECTURE.md)
- [Risk scoring](docs/04-artificial-intelligence/RISK_SCORING.md)
- [AI assistant](docs/04-artificial-intelligence/AI_ASSISTANT.md)
- [Model documentation](docs/04-artificial-intelligence/MODEL_DOCUMENTATION.md)
- [AI safety](docs/04-artificial-intelligence/AI_SAFETY.md)
- [Coding standards](docs/05-development-standards/CODING_STANDARDS.md)
- [Testing strategy](docs/05-development-standards/TESTING_STRATEGY.md)
- [Deployment](docs/05-development-standards/DEPLOYMENT.md)
- [Architectural decisions](docs/06-technical-decisions/DECISIONS.md)
- [Changelog](docs/06-technical-decisions/CHANGELOG.md)

## Important principles

- Never commit credentials or real patient data.
- Use 100% synthetic or properly de-identified data outside production.
- Treat AI output strictly as a preventive risk indicator, never a medical diagnosis or prescription.
- Never turn missing, stale, or unavailable inputs into a reassuring low-risk result (`status: "limited"`, `level: null`).
- Enforce deny-by-default authentication, ownership and assignment authorization (`404 NOT_FOUND` cross-user isolation), active purpose-bound consent, and redacted auditing.
- Keep implementation and documentation synchronized (`AGENTS.md`).
