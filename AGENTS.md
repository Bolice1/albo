# Albo AI development instructions

Albo is a preventive-health platform that may process sensitive health, wellbeing, location, environmental, and provider information.

Before changing code or architecture, read the relevant files in `docs/`. At minimum read the project overview, requirements, scope, architecture, database schema, security, and AI safety documents.

Rules:

1. Do not invent undocumented business logic.
2. Prefer a modular monolith for the core application until extraction is justified.
3. Keep core business rules in the main backend and AI-specific processing in the AI service.
4. Update documentation when changing APIs, schemas, architecture, security, or AI behavior.
5. Record significant decisions in `docs/06-technical-decisions/DECISIONS.md`.
6. Add tests for new behavior.
7. Never hardcode or expose secrets.
8. Never use real patient records in fixtures, prompts, logs, screenshots, or examples.
9. Use synthetic or de-identified data for development.
10. Do not present an AI output as a diagnosis or guaranteed medical advice.
11. Respect consent, authorization, least privilege, and auditability.
12. Do not log sensitive health, identity, location, or model-input data.

When implementation and documentation disagree, stop and resolve the discrepancy. Do not silently create a new contract.
