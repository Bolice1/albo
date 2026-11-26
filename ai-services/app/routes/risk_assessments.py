"""Internal risk calculation endpoint (POST /internal/v1/risk-assessments/calculate)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from model_adapters.risk_adapter import RiskModelAdapter

from app.config import Settings
from app.contracts.risk_assessment import RiskCalculationRequest, RiskCalculationResponse
from app.logging import StructuredLogger, get_request_id

router = APIRouter(tags=["internal-risk-assessments"])


@router.post("/risk-assessments/calculate", response_model=RiskCalculationResponse)
async def calculate_risk_assessment(
    payload: RiskCalculationRequest,
    request: Request,
) -> RiskCalculationResponse:
    """Execute a deterministic, reproducible preventive risk indicator calculation."""
    settings: Settings = request.app.state.settings
    risk_adapter: RiskModelAdapter = request.app.state.risk_adapter
    logger: StructuredLogger = request.app.state.logger
    req_id = getattr(request.state, "request_id", "") or get_request_id()

    response = risk_adapter.calculate_risk(
        payload,
        enabled_versions=settings.enabled_rule_version_set,
    )

    logger.info(
        "risk_assessment_calculated",
        request_id=req_id,
        use_case_code=response.use_case_code,
        rule_model_version=response.rule_model_version,
        assessment_status=response.status,
        safety_reason_codes=response.safety_metadata.reason_codes,
    )
    return response
