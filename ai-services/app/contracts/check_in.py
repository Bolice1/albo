"""Contracts for POST /internal/v1/check-ins/evaluate-safety."""

from __future__ import annotations

import re
from typing import Final, Literal

from pydantic import AwareDatetime, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.contracts.common import CheckInSafetyStatus, EscalationCategory, StrictContractModel

_QUESTION_CODE_RE: Final[re.Pattern[str]] = re.compile(r"^[a-z0-9_]{1,64}$")
CheckInScalar = int | float | str


def _validate_checkin_scalar(value: object) -> CheckInScalar:
    if isinstance(value, bool):
        raise PydanticCustomError(
            "boolean_not_allowed", "Boolean values are not allowed in check-in responses."
        )
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        if len(value) > 200:
            raise PydanticCustomError(
                "string_too_long", "Categorical check-in response exceeds max length."
            )
        return value
    raise PydanticCustomError("invalid_response_type", "Unsupported check-in response value type.")


class CheckInAuthorizationContext(StrictContractModel):
    """Verified consent metadata for structured wellbeing check-in screening."""

    consent_verified: Literal[True]
    consent_purpose_code: Literal["wellbeing_check_ins", "preventive_risk_calculation"] = (
        "wellbeing_check_ins"
    )
    consent_version: str = Field(min_length=1, max_length=32)


class CheckInAnswerItem(StrictContractModel):
    """Single structured check-in question response."""

    question_code: str = Field(min_length=1, max_length=64)
    response: CheckInScalar

    @model_validator(mode="before")
    @classmethod
    def normalize_value_key(cls, data: object) -> object:
        if isinstance(data, dict) and "value" in data and "response" not in data:
            mapped = dict(data)
            mapped["response"] = mapped.pop("value")
            return mapped
        return data

    @field_validator("question_code")
    @classmethod
    def validate_question_code(cls, value: str) -> str:
        if not _QUESTION_CODE_RE.match(value):
            raise PydanticCustomError("invalid_question_code", "Invalid question_code format.")
        return value

    @field_validator("response", mode="before")
    @classmethod
    def validate_response_scalar(cls, value: object) -> CheckInScalar:
        return _validate_checkin_scalar(value)


class CheckInSafetyRequest(StrictContractModel):
    """Request schema for deterministic wellbeing check-in safety screening."""

    request_id: str = Field(min_length=1, max_length=128)
    questionnaire_version: str = Field(min_length=1, max_length=64)
    completed_at: AwareDatetime
    authorization_context: CheckInAuthorizationContext
    responses: list[CheckInAnswerItem] | dict[str, CheckInScalar]
    free_text_reflection: str | None = Field(default=None, max_length=500)

    @field_validator("responses")
    @classmethod
    def validate_responses_collection(
        cls, value: list[CheckInAnswerItem] | dict[str, CheckInScalar]
    ) -> list[CheckInAnswerItem] | dict[str, CheckInScalar]:
        if isinstance(value, dict):
            if len(value) > 32:
                raise PydanticCustomError("too_many_responses", "Too many check-in responses.")
            for key, item_val in value.items():
                if not _QUESTION_CODE_RE.match(key):
                    raise PydanticCustomError(
                        "invalid_question_code", "Invalid question_code format."
                    )
                _validate_checkin_scalar(item_val)
            return value
        if len(value) > 32:
            raise PydanticCustomError("too_many_responses", "Too many check-in responses.")
        return value

    def normalized_responses(self) -> dict[str, CheckInScalar]:
        """Return responses as an ordered mapping of question_code -> value."""
        if isinstance(self.responses, dict):
            return dict(self.responses)
        return {item.question_code: item.response for item in self.responses}


class CheckInSafetyResponse(StrictContractModel):
    """Response schema for deterministic check-in crisis and distress evaluation."""

    request_id: str
    questionnaire_version: str
    safety_status: CheckInSafetyStatus
    escalation_required: bool
    escalation_category: EscalationCategory | None
    escalation_reason_codes: list[str]
    escalation_guidance_key: str | None
    recommended_facility_tags: list[str]
    non_diagnostic_disclaimer: str
