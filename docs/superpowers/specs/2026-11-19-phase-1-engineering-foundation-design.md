# Phase 1 — Engineering foundation design

**Date:** 2026-11-19
**Status:** Approved (with scope & toolchain overrides recorded in [ADR-016](../../06-technical-decisions/DECISIONS.md) and [ADR-017](../../06-technical-decisions/DECISIONS.md))
**Roadmap phase:** Phase 1 — Architecture and engineering foundation ([ROADMAP.md](../../01-project-foundation/ROADMAP.md) §3)

> [!IMPORTANT]
> **Implementation override (`2026-11-25` — [ADR-016](../../06-technical-decisions/DECISIONS.md) & [ADR-017](../../06-technical-decisions/DECISIONS.md)):** Per project owner directive, initial repository onboarding builds **`backend/`**, **`ai-services/`**, **`infrastructure/`**, and **GitHub Actions CI** with complete domain contracts and runtime governance circuit breakers (`FEATURE_*`), explicitly deferring **`frontend/`** (and Playwright browser E2E) to a separate frontend onboarding track. In addition, **Bun** (`bun.lock`, `bun install --frozen-lockfile`) replaces `pnpm`/Node as the JavaScript/TypeScript package manager and script runner for `backend/`, alongside **Python 3.12 + `uv`** (`uv.lock`) for `ai-services/`. Where §6 below mentions `frontend/` or `pnpm`, `ADR-016` governs.

## 1. Intent

Meet the Phase 1 completion gate: *"A developer can implement the first vertical slice without inventing core architecture, data ownership, security behavior, or API conventions."*

Two things currently block that gate:

1. Documentation gaps that would force a developer to invent contracts (see §4).
2. No runnable repository skeleton: there is no `frontend/`, `backend/`, `ai-services/`, local environment, test tooling, or CI.

Phase 1 closes both. It delivers **no product features**. Authentication, consent, health inputs, risk scoring, and the dashboard belong to vertical slice 1 (the next piece of work).

## 2. Goals, non-goals, anti-goals

**Goals**

- Resolve the documentation discrepancies that block slice 1, and record them in `DECISIONS.md`.
- Scaffold the three applications in the documented layout (CODING_STANDARDS §3) with strict typing, linting, formatting, and a passing test suite each.
- Implement the cross-cutting plumbing every later feature relies on: startup config validation, request-ID propagation, the API error envelope, redacted structured logging, health endpoints, and internal service-token authentication.
- Run the whole stack locally with one `docker compose up` command, using hardened, multi-stage, non-root images.
- Add a CI pipeline that runs secret scanning, dependency scanning, lint, type checks, tests, a migration check, and image builds on every pull request.

**Non-goals (slice 1 or later)**

- Domain database tables, auth guards, the JWT test signer, consent, health inputs, the risk engine, and dashboard UI.
- Hosting, staging, production deployment, and the secret manager (OPEN-012).
- shadcn/ui components beyond initialization.

**Anti-goals (failure even if it "works")**

- Any endpoint, table, role, or rule that is not documented.
- Logging request bodies, headers containing tokens, or validation input values.
- Real or realistic personal data anywhere, including `.env.example` files.
- Kubernetes, extra services, or extra databases.

## 3. Constraints

- AGENTS.md rules 1–12, CODING_STANDARDS, SECURITY §7 and §11, DEPLOYMENT §2–§7, and TESTING_STRATEGY §2.
- Accepted ADRs: ADR-001 (monolith + AI service), ADR-008 (Postgres/PostGIS, Redis jobs-only, Docker without Kubernetes), ADR-012 (Prisma + Prisma Migrate), and ADR-013 (synchronous call, `X-Internal-Service-Token`, 2000 ms timeout).
- Tests never touch live external services (TESTING_STRATEGY §2.4).

## 4. Documentation discrepancies resolved in this phase

Each resolution is recorded as **ADR-015** and the affected documents are updated in the same change.

| # | Discrepancy | Resolution |
|---|---|---|
| 1 | The public API (§8.4) uses `rule_set_version: "rules-v1"`, while the internal contract and database use `rule_model_version: "rules-v1.0.0"` | Use **`rule_model_version`** with full semver (`rules-v1.0.0`) everywhere. Update API_DOCUMENTATION §8.4 and the CODING_STANDARDS §3.1 naming example. |
| 2 | Use-case code is `lifestyle_ncd_preventive_v1` in RISK_SCORING §5.1 but `lifestyle_ncd_preventive` elsewhere | Use **`lifestyle_ncd_preventive`**. The version always travels separately in `rule_model_version`. |
| 3 | Slice-1 consent purpose codes are undefined | Define two purposes, both at version `v1`, taken from the DATA_PRIVACY §6 candidates: **`health_input_storage`** and **`preventive_risk_calculation`**. Status: approved for the **synthetic** slice only. The consent wording still requires privacy-owner approval before production (OPEN-007/008). |
| 4 | Open-decision lists still show items that ADR-011 to ADR-014 resolved | Mark them resolved, with links, in SECURITY §20, AI_ARCHITECTURE §13, ARCHITECTURE §17, TECH_STACK §16, SYSTEM_DESIGN §22, and API_DOCUMENTATION §13. |
| 5 | Slice-1 active roles: ADR-011 says `citizen` + `platform_admin`, while ACCESS_CONTROL §17 says citizen only | `platform_admin` exists in the role enum, but no slice-1 route serves it. Align ACCESS_CONTROL §17 and ADR-011 wording to say that. |
| 6 | Wrong phase and section cross-references | Fix: RISK_SCORING §10 ("Phase 7" → Roadmap Phase 6), AI_ASSISTANT §1 (wellness hub → Roadmap Phase 5 / Scope Phase 2), OPEN-009 ("Phase 4" → Roadmap Phase 3), and TESTING_STRATEGY §6 (PROJECT_STATUS §9 → §10). Add a short phase-numbering note to ROADMAP explaining that the AI "Phase 1–3" labels in AI_ARCHITECTURE §5 are AI-evolution stages, not roadmap phases. |

**Left open, flagged for slice 1:** in the `rules-v1.0.0` rule card, a fruit/vegetable intake of 2–4 servings/day emits no `factor_code`. This is clinical rule logic, so it is not decided here. It is added to the rule card as an open item for the clinical reviewer (OPEN-006).

## 5. Approaches considered

| Approach | Trade-off | Outcome |
|---|---|---|
| **A. Foundation first:** settle the contracts, scaffold all three apps with cross-cutting plumbing and CI, and add no features | Nothing user-visible yet, but slice 1 starts on a reviewed, tested base | **Chosen by the project owner** |
| B. Full vertical slice 1 in one go | One very large change that is hard to review; the plumbing gets designed under feature pressure | Next, after A |
| C. Risk engine only | Fast and testable, but leaves the gate unmet and nothing runs end to end | Rejected |

## 6. Design

### 6.1 Repository layout (root)

```text
frontend/            Next.js app (pnpm package)
backend/             NestJS core API + worker entrypoint (pnpm package)
ai-services/         FastAPI service (uv project)
infrastructure/
  docker/            Shared compose overrides, Postgres init SQL (enables PostGIS)
docker-compose.yml   Local stack
pnpm-workspace.yaml  frontend + backend
.github/workflows/   ci.yml
.gitleaks.toml, .editorconfig, .gitignore, .dockerignore files
```

### 6.2 Toolchain (builder's calls, recorded as ADR-016)

- **Node 24 LTS**, with **pnpm** via corepack and a root workspace; `pnpm install --frozen-lockfile` in CI and Docker.
- **Python 3.12**, managed by **uv** with a committed `uv.lock`. Python 3.12 is chosen over the local 3.14 for mature `python:3.12-slim` images and dependency support. Tooling: ruff (lint and format), mypy `--strict`, pytest.
- **GitHub Actions** for CI. The repository is on GitHub, and DEPLOYMENT §11 names it as the example; production CD remains OPEN-012.
- Library versions are the latest stable at install time, pinned by lockfiles. Docker base images are pinned by tag.

### 6.3 `backend/` (NestJS)

- TypeScript `strict`, ESLint (with security rules) and Prettier, `tsc --noEmit`.
- **Config:** `ConfigModule` with a zod schema. The app fails fast at boot if `DATABASE_URL`, `REDIS_URL`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` (minimum 32 characters), `AI_SERVICE_TIMEOUT_MS` (default 2000), or `NODE_ENV` is missing or invalid.
- **Request ID:** middleware that accepts a client `X-Request-Id` only if it is a safe opaque token (≤ 128 characters, `[A-Za-z0-9._-]`) and otherwise generates a UUID. It echoes the ID back in the response header and attaches it to the log context.
- **Error envelope:** a global exception filter that maps everything to the API §6 shape (`code`, `message`, `details`, `request_id`). Unknown errors become `500 INTERNAL_ERROR` with no stack trace, SQL, or vendor payload. The global `ValidationPipe` uses `whitelist`, `forbidNonWhitelisted`, and `transform`. Validation details carry `field` and `reason` only, never the submitted value.
- **Logging:** pino through `nestjs-pino`, as structured JSON. Fields follow the CODING_STANDARDS §8.2 allowlist: request logs record method, route pattern, status, duration, and request ID only. Bodies, query values, and `authorization`/`cookie` headers are never logged, with redaction as a second line of defense.
- **Health:** `GET /health/live` (process up) and `GET /health/ready` (Postgres, Redis, and `ai-services` `/internal/v1/health` reachable). Both sit outside `/api/v1` and return no secrets. `/api/v1` is the global prefix for future routes.
- **AI-service client:** a typed adapter in `src/integrations/ai-service/` that sends `X-Internal-Service-Token` and `X-Request-Id`, applies a 2000 ms timeout, and maps failures to a typed `DependencyUnavailable` error. In this phase it only calls health.
- **Prisma:** `prisma/schema.prisma` with the datasource and no domain models yet, plus one initial migration that runs `CREATE EXTENSION IF NOT EXISTS postgis;`. The scripts are `migrate:deploy` (never `db push`) and `migrate:check`.
- **Worker entrypoint:** `src/worker.ts` connects BullMQ to Redis, registers no queues yet, and shuts down gracefully. This keeps the `job-worker` container real without inventing jobs.
- **Module folders** from CODING_STANDARDS §3 are created empty with a README stub. No domain code goes in them.
- **Tests (Jest + Supertest):** config fail-fast; request-ID generation, echo, and rejection of unsafe IDs; error-envelope shape for 404, 422, and 500 (no stack traces); validation errors exclude submitted values; the log-redaction test captures log output during a request carrying a synthetic token and body and asserts neither appears; health live and ready (ready reports unhealthy when a dependency is down, using mocked dependencies); AI client timeout maps to `DependencyUnavailable`.

### 6.4 `ai-services/` (FastAPI)

- Package layout per AI_ARCHITECTURE §4 (`app/contracts`, `app/safety`, `risk_engine`, `data_processing`, `model_adapters`, `evaluation`, `tests`). The domain packages are empty modules.
- **Config:** `pydantic-settings`; the service refuses to start without `INTERNAL_SERVICE_TOKEN` (minimum 32 characters).
- **Auth middleware:** every `/internal/v1/*` route except health requires `X-Internal-Service-Token`, compared with `hmac.compare_digest`. A missing or wrong token gets `401` with a redacted log line (security signal T-013). **Health is exempt** so orchestrator probes work; it exposes only service status and the loaded rule versions (an empty list for now). This is the builder's call.
- **Request ID** propagation identical to the backend.
- **Errors:** a custom `RequestValidationError` handler and a catch-all handler return `{error:{code,message,details:[{field,reason}],request_id}}`. They log only field paths and error codes (AI_ARCHITECTURE §10, T-017).
- **Contracts:** Pydantic v2 base model with `extra="forbid"`, ready for slice 1.
- **Tests (pytest):** health returns 200 without a token; a protected stub route returns 401 with a wrong or missing token and 200 with the right one (the stub is registered only in the test app, not the production router); a 422 response and the captured logs contain no submitted synthetic values; config fails fast when the token is missing.

### 6.5 `frontend/` (Next.js)

- App Router, TypeScript `strict`, Tailwind, shadcn/ui initialized (`components.json`, `cn` util) with no components added. ESLint with `jsx-a11y`.
- One neutral placeholder landing page stating Albo's purpose and its "not a diagnosis" boundary, using the wording already in UI_UX §8. No sign-in and no data.
- `src/lib/config.ts` exposes only `NEXT_PUBLIC_API_BASE_URL`. A test asserts no non-public environment variables leak into the client config.
- **Tests:** Vitest + React Testing Library for the page; Playwright + `@axe-core/playwright` smoke test (the page loads with no serious accessibility violations).

### 6.6 Docker and the local stack

- **Dockerfiles:** one each for `frontend`, `backend` (shared image; the `core-api` and `job-worker` containers differ by command), and `ai-services`. All are multi-stage, have frozen lockfiles, run as non-root `USER albo`, declare a `HEALTHCHECK`, contain no secrets in `ARG`/`ENV`, and use a `.dockerignore` that excludes `.env*`.
- **`docker-compose.yml`:**
  - `postgres` uses `postgis/postgis:16-3.4`; the other dependencies are `redis:7-alpine` and `minio`.
  - The application services are `core-api`, `job-worker`, `ai-services`, `frontend`, and a one-shot `migrate` service.
  - Two networks: `edge` (frontend, core-api) and `private` (everything).
  - Only `frontend:3000` and `core-api:4000` publish ports to the host, bound to `127.0.0.1`.
- **Environment files:** `.env.example` files hold variable names and obviously fake local values only. A developer copies them to `.env`, which is gitignored.

### 6.7 CI (`.github/workflows/ci.yml`)

Jobs run on every pull request and on pushes to `main` and `Albert`:

1. `secrets`: gitleaks.
2. `node`: pnpm install, lint, typecheck, unit/integration tests for backend and frontend, and `pnpm audit --audit-level high`.
3. `python`: uv sync, ruff, mypy, pytest, and pip-audit.
4. `migrations`: ephemeral PostGIS service container; `prisma migrate deploy` and a status check.
5. `images`: `docker build` for all three images (no push).
6. `e2e`: Playwright with axe on the frontend.

### 6.8 Documentation updates in the same change

- DECISIONS.md: ADR-015 (§4 resolutions) and ADR-016 (toolchain and CI).
- CHANGELOG.md, PROJECT_STATUS.md (Phase 1 status), and the root README ("Run locally" section).
- The documents listed in §4.

## 7. Delivery and verification

- Work happens on branch `chore/phase-1-engineering-foundation`, and the pull request targets `Albert` (the repository's default PR base). Commits and pushes happen only when the owner says so.
- "Done" means: all local checks pass (lint, typecheck, tests in all three apps); `docker compose up` brings every service to healthy; `/health/ready` returns OK; the migration applies cleanly to a fresh database; the CI workflow file passes a syntax check (a real run happens once the change is pushed).

## 8. Left to the builder

Exact library minor versions, file-level organization inside each app, the logger wiring details, test file naming within the documented locations, and the MinIO bucket bootstrap (a bucket is created; nothing writes to it yet).
