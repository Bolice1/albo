"""Internal safety-gated assistant endpoint (POST /internal/v1/assistant/respond)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from model_adapters.assistant_adapter import AssistantModelAdapter, run_guarded_assistant_turn

from app.config import Settings
from app.contracts.assistant import AssistantRespondRequest, AssistantRespondResponse
from app.errors import DomainError
from app.logging import StructuredLogger, get_request_id
from app.safety.escalation_templates import ASSISTANT_UNAVAILABLE_MESSAGE

router = APIRouter(tags=["internal-assistant"])


@router.post("/assistant/respond", response_model=AssistantRespondResponse)
async def respond_assistant(
    payload: AssistantRespondRequest,
    request: Request,
) -> AssistantRespondResponse:
    """Process a single bounded assistant turn gated by ASSISTANT_ENABLED and pre/post guards."""
    settings: Settings = request.app.state.settings
    logger: StructuredLogger = request.app.state.logger
    assistant_adapter: AssistantModelAdapter = request.app.state.assistant_adapter
    req_id = getattr(request.state, "request_id", "") or get_request_id()

    if not settings.assistant_enabled:
        raise DomainError(
            status_code=503,
            code="FEATURE_DISABLED",
            message=ASSISTANT_UNAVAILABLE_MESSAGE,
        )

    response = run_guarded_assistant_turn(payload, assistant_adapter)
    logger.info(
        "assistant_turn_completed",
        request_id=req_id,
        rule_model_version=response.adapter_version,
        safety_reason_codes=response.safety_metadata.reason_codes,
    )
    return response
