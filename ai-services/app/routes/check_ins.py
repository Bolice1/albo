"""Internal check-in safety screening endpoint (POST /internal/v1/check-ins/evaluate-safety)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Final

from fastapi import APIRouter, Request

from app.config import Settings
from app.contracts.check_in import CheckInSafetyRequest, CheckInSafetyResponse, CheckInScalar
from app.contracts.common import CheckInSafetyStatus
from app.errors import DomainError
from app.logging import StructuredLogger, get_request_id
from app.safety.crisis_screener import screen_combined_crisis
from app.safety.escalation_templates import CHECKIN_NON_DIAGNOSTIC_DISCLAIMER

router = APIRouter(tags=["internal-check-ins"])

_DISTRESS_SCORE_KEYS: Final[frozenset[str]] = frozenset(
    {
        "stress_frequency_score",
        "exhaustion_score",
        "sleep_quality_score",
        "emotional_exhaustion_score",
        "overwhelm_score",
    }
)
_ELEVATED_DISTRESS_STRINGS: Final[frozenset[str]] = frozenset(
    {"severe", "very_high", "nearly_every_day", "almost_always", "constant"}
)


def _has_elevated_non_crisis_distress(responses: Mapping[str, CheckInScalar]) -> bool:
    high_count = 0
    for key, val in responses.items():
        norm_key = key.strip().lower()
        if (
            isinstance(val, (int, float))
            and not isinstance(val, bool)
            and norm_key in _DISTRESS_SCORE_KEYS
        ):
            if val >= 4:
                return True
            if val >= 3:
                high_count += 1
        elif (
            isinstance(val, str)
            and norm_key in _DISTRESS_SCORE_KEYS
            and val.strip().lower() in _ELEVATED_DISTRESS_STRINGS
        ):
            return True
    return high_count >= 2


def evaluate_checkin_safety_payload(payload: CheckInSafetyRequest) -> CheckInSafetyResponse:
    """Deterministically screen structured check-in responses and optional reflection text."""
    normalized = payload.normalized_responses()
    texts: list[str] = []
    if payload.free_text_reflection:
        texts.append(payload.free_text_reflection)
    for val in normalized.values():
        if isinstance(val, str) and len(val) > 2:
            texts.append(val)

    crisis = screen_combined_crisis(texts=texts, signals=normalized)
    if crisis.escalation_required:
        return CheckInSafetyResponse(
            request_id=payload.request_id,
            questionnaire_version=payload.questionnaire_version,
            safety_status="escalated",
            escalation_required=True,
            escalation_category=crisis.escalation_category,
            escalation_reason_codes=list(crisis.reason_codes),
            escalation_guidance_key=crisis.guidance_key,
            recommended_facility_tags=list(crisis.recommended_facility_tags),
            non_diagnostic_disclaimer=CHECKIN_NON_DIAGNOSTIC_DISCLAIMER,
        )

    safety_status: CheckInSafetyStatus = "normal"
    reason_codes: list[str] = []
    guidance_key: str | None = None
    facility_tags: list[str] = []

    if _has_elevated_non_crisis_distress(normalized):
        safety_status = "needs_review"
        reason_codes = ["ELEVATED_STRESS_OR_EXHAUSTION_PATTERN"]
        guidance_key = "checkin.elevated_stress_support.v1"
        facility_tags = ["primary_care", "mental_health_support"]

    return CheckInSafetyResponse(
        request_id=payload.request_id,
        questionnaire_version=payload.questionnaire_version,
        safety_status=safety_status,
        escalation_required=False,
        escalation_category=None,
        escalation_reason_codes=reason_codes,
        escalation_guidance_key=guidance_key,
        recommended_facility_tags=facility_tags,
        non_diagnostic_disclaimer=CHECKIN_NON_DIAGNOSTIC_DISCLAIMER,
    )


@router.post("/check-ins/evaluate-safety", response_model=CheckInSafetyResponse)
async def evaluate_checkin_safety(
    payload: CheckInSafetyRequest,
    request: Request,
) -> CheckInSafetyResponse:
    """Screen a wellbeing check-in for crisis/acute signals without logging user answers."""
    settings: Settings = request.app.state.settings
    logger: StructuredLogger = request.app.state.logger
    req_id = getattr(request.state, "request_id", "") or get_request_id()

    if not settings.checkin_safety_enabled:
        raise DomainError(
            status_code=503,
            code="FEATURE_DISABLED",
            message="Wellbeing check-in safety screening is currently disabled in this environment.",
        )

    response = evaluate_checkin_safety_payload(payload)
    logger.info(
        "checkin_safety_evaluated",
        request_id=req_id,
        rule_model_version=payload.questionnaire_version,
        safety_reason_codes=response.escalation_reason_codes,
    )
    return response
