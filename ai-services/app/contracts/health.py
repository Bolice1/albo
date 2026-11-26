"""Contract schema for GET /internal/v1/health."""

from __future__ import annotations

from typing import Literal

from app.contracts.common import StrictContractModel


class HealthResponse(StrictContractModel):
    """Liveness and readiness payload exposing loaded rule versions and assistant flag."""

    status: Literal["ok"] = "ok"
    service: Literal["albo-ai-services"] = "albo-ai-services"
    loaded_rule_versions: list[str]
    assistant_enabled: bool
    request_id: str
