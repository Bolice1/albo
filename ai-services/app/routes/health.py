"""Internal health and readiness endpoint (GET /internal/v1/health)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from model_adapters.risk_adapter import RiskModelAdapter

from app.config import Settings
from app.contracts.health import HealthResponse
from app.logging import get_request_id

router = APIRouter(tags=["internal-health"])


@router.get("/health", response_model=HealthResponse)
async def get_health(request: Request) -> HealthResponse:
    """Return service readiness, enabled rule versions, and assistant gate state."""
    settings: Settings = request.app.state.settings
    risk_adapter: RiskModelAdapter = request.app.state.risk_adapter
    req_id = getattr(request.state, "request_id", "") or get_request_id()

    loaded_versions = risk_adapter.list_loaded_versions(
        enabled_versions=settings.enabled_rule_version_set
    )
    return HealthResponse(
        status="ok",
        service="albo-ai-services",
        loaded_rule_versions=loaded_versions,
        assistant_enabled=settings.assistant_enabled,
        request_id=req_id,
    )
