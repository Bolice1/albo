# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.13.9 /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY data_processing ./data_processing
COPY risk_engine ./risk_engine
COPY model_adapters ./model_adapters


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

RUN groupadd --system --gid 10001 albo \
    && useradd --system --uid 10001 --gid albo --no-create-home --shell /usr/sbin/nologin albo

WORKDIR /app

COPY --from=builder --chown=albo:albo /app/.venv /app/.venv
COPY --from=builder --chown=albo:albo /app/app /app/app
COPY --from=builder --chown=albo:albo /app/data_processing /app/data_processing
COPY --from=builder --chown=albo:albo /app/risk_engine /app/risk_engine
COPY --from=builder --chown=albo:albo /app/model_adapters /app/model_adapters

USER albo

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/internal/v1/health', timeout=3)"]

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
