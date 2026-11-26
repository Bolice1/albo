"""FastAPI application factory for Albo internal AI services (AI_ARCHITECTURE.md §4 & §6)."""

from __future__ import annotations

from fastapi import FastAPI
from model_adapters.assistant_adapter import (
    AssistantModelAdapter,
    TemplateGuidedAssistantAdapter,
)
from model_adapters.risk_adapter import DeterministicRuleEngineAdapter, RiskModelAdapter

from app.config import Settings, load_settings
from app.errors import register_exception_handlers
from app.logging import configure_logging
from app.middleware import (
    InternalAuthMiddleware,
    RequestIdMiddleware,
    RequestLoggingMiddleware,
)
from app.routes import build_internal_v1_router


def create_app(
    settings: Settings | None = None,
    *,
    risk_adapter: RiskModelAdapter | None = None,
    assistant_adapter: AssistantModelAdapter | None = None,
) -> FastAPI:
    """Instantiate an isolated FastAPI service with fail-fast config, auth, and redaction."""
    resolved_settings = settings if settings is not None else load_settings()
    logger = configure_logging(
        service=resolved_settings.SERVICE_NAME,
        environment=resolved_settings.ENVIRONMENT,
        level=resolved_settings.LOG_LEVEL,
    )

    app = FastAPI(
        title="Albo Internal AI Services",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    app.state.settings = resolved_settings
    app.state.logger = logger
    app.state.risk_adapter = (
        risk_adapter if risk_adapter is not None else DeterministicRuleEngineAdapter()
    )
    app.state.assistant_adapter = (
        assistant_adapter if assistant_adapter is not None else TemplateGuidedAssistantAdapter()
    )

    register_exception_handlers(app, logger)

    # Starlette executes user middlewares in reverse registration order (LIFO):
    # Incoming request order: RequestIdMiddleware -> RequestLoggingMiddleware -> InternalAuthMiddleware
    app.add_middleware(InternalAuthMiddleware, settings=resolved_settings, logger=logger)
    app.add_middleware(RequestLoggingMiddleware, logger=logger)
    app.add_middleware(RequestIdMiddleware)

    app.include_router(build_internal_v1_router())
    return app
