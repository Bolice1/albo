"""Contracts for POST /internal/v1/risk-assessments/calculate (AI_ARCHITECTURE.md §6.3-6.4)."""

from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, Field, field_validator
from pydantic_core import PydanticCustomError

from app.contracts.common import (
    AssessmentStatus,
    EscalationCategory,
    FactorDirection,
    ImplementationType,
    NextStepPriority,
    RiskLevel,
    StrictContractModel,
)

InputScalarValue = int | float | str
HealthInputSourceType = Literal["self_reported", "imported", "provider_recorded", "generated"]
EnvironmentalQualityStatus = Literal["verified", "unverified", "failed", "stale"]


def _reject_boolean_value(value: object) -> object:
    if isinstance(value, bool):
        raise PydanticCustomError(
            "boolean_not_allowed", "Boolean values are not valid scalar measurements."
        )
    return value


class RiskAuthorizationContext(StrictContractModel):
    """Verified consent metadata forwarded by the Core API."""

    consent_verified: Literal[True]
    consent_purpose_code: Literal["preventive_risk_calculation", "wellbeing_check_ins"] = (
        "preventive_risk_calculation"
    )
    consent_version: str = Field(min_length=1, max_length=32)


class HealthInputItem(StrictContractModel):
    """Single allowlisted, PII-free health or lifestyle input in an immutable snapshot."""

    field_code: str = Field(min_length=1, max_length=100)
    value: InputScalarValue
    unit: str | None = Field(default=None, max_length=64)
    observed_at: AwareDatetime
    source_type: HealthInputSourceType = "self_reported"

    @field_validator("value", mode="before")
    @classmethod
    def check_not_bool(cls, value: object) -> object:
        return _reject_boolean_value(value)


class EnvironmentalObservationItem(StrictContractModel):
    """Normalized area-level environmental observation (zero GPS coordinates)."""

    observation_type: str = Field(min_length=1, max_length=64)
    value: int | float
    unit: str = Field(min_length=1, max_length=32)
    observed_at: AwareDatetime
    quality_status: EnvironmentalQualityStatus

    @field_validator("value", mode="before")
    @classmethod
    def check_not_bool(cls, value: object) -> object:
        return _reject_boolean_value(value)


class CheckInResponseItem(StrictContractModel):
    """Optional structured check-in item included in a risk calculation snapshot."""

    question_code: str = Field(min_length=1, max_length=100)
    value: InputScalarValue
    observed_at: AwareDatetime | None = None
    source_type: HealthInputSourceType = "self_reported"

    @field_validator("value", mode="before")
    @classmethod
    def check_not_bool(cls, value: object) -> object:
        return _reject_boolean_value(value)


class RiskInputsPayload(StrictContractModel):
    """Minimized snapshot inputs container."""

    health_inputs: list[HealthInputItem] = Field(default_factory=list, max_length=64)
    environmental_observations: list[EnvironmentalObservationItem] = Field(
        default_factory=list, max_length=32
    )
    check_in_responses: list[CheckInResponseItem] | None = Field(default=None, max_length=32)
    check_in_overlay: list[CheckInResponseItem] | None = Field(default=None, max_length=32)


class RiskCalculationRequest(StrictContractModel):
    """Internal request payload for POST /internal/v1/risk-assessments/calculate."""

    request_id: str = Field(min_length=1, max_length=128)
    use_case_code: str = Field(min_length=1, max_length=100)
    rule_model_version: str = Field(min_length=1, max_length=64)
    input_snapshot_id: str = Field(min_length=1, max_length=128)
    calculated_for_timestamp: AwareDatetime
    authorization_context: RiskAuthorizationContext
    inputs: RiskInputsPayload


class ContributingFactor(StrictContractModel):
    """Explainable factor contributing to a preventive risk indicator (RISK_SCORING.md §6.1)."""

    factor_code: str = Field(min_length=1, max_length=100)
    source_field: str = Field(min_length=1, max_length=100)
    observed_at: AwareDatetime
    source_type: str = Field(min_length=1, max_length=64)
    direction: FactorDirection
    explanation_key: str = Field(min_length=1, max_length=128)


class RecommendedNextStep(StrictContractModel):
    """Approved non-prescriptive preventive next step (RISK_SCORING.md §6.3)."""

    action_code: str = Field(min_length=1, max_length=100)
    priority: NextStepPriority
    facility_service_tags: list[str] | None = None


class RiskAssessmentResult(StrictContractModel):
    """Structured non-diagnostic indicator output."""

    level: RiskLevel | None
    score_band_or_weight_summary: str | None
    contributing_factors: list[ContributingFactor] = Field(default_factory=list)
    limitations: list[str] = Field(min_length=1)
    recommended_next_steps: list[RecommendedNextStep] = Field(default_factory=list)


class RiskSafetyMetadata(StrictContractModel):
    """Safety, completeness, and escalation provenance metadata."""

    non_diagnostic_verified: bool
    escalation_required: bool
    escalation_category: EscalationCategory | None = None
    reason_codes: list[str] = Field(default_factory=list)
    missing_or_stale_fields: list[str] = Field(default_factory=list)


class RiskCalculationResponse(StrictContractModel):
    """Internal response payload for POST /internal/v1/risk-assessments/calculate."""

    request_id: str
    input_snapshot_id: str
    use_case_code: str
    rule_model_version: str
    implementation_type: ImplementationType
    status: AssessmentStatus
    calculated_at: AwareDatetime
    result: RiskAssessmentResult
    safety_metadata: RiskSafetyMetadata
