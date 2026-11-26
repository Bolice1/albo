# Albo AI Services (`ai-services/`)

Internal stateless Python 3.12 / FastAPI computation service for Albo's deterministic preventive risk indicators, crisis and acute-symptom safety screeners, and bounded non-diagnostic preventive assistant.

## Architectural boundaries

- **Internal-only boundary**: Authenticated via constant-time `X-Internal-Service-Token` verification (`ADR-013`). Never exposed directly to browsers.
- **Stateless & PII-free**: Receives minimized, pre-authorized input snapshots from the NestJS Core API (`ADR-001`, `AI_ARCHITECTURE.md` §3).
- **Rules & weights first**: Deterministic, wall-clock-independent rule specifications in `risk_engine/` (`ADR-002`, `ADR-010`, `ADR-014`).
- **Safe degradation**: Missing, stale, or unavailable required inputs always return `status: "limited"` and `level: null`—never `low` (`ADR-003`, `HAZ-01`).
- **Zero sensitive logging**: Structured JSON logs and `422`/`500` error envelopes strip all submitted health values, messages, and tokens (`ADR-007`, `T-017`).

## Local development

```bash
cp .env.example .env
uv sync
uv run ruff check .
uv run ruff format --check .
uv run mypy --strict app data_processing risk_engine model_adapters evaluation
uv run pytest -v
```
