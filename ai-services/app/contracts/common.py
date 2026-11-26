"""Common base contract models, error envelopes, and shared literal types."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RiskLevel = Literal["low", "moderate", "high"]
AssessmentStatus = Literal["complete", "limited", "failed"]
ImplementationType = Literal["rule", "weighted_score"]
EscalationCategory = Literal["mental_health_crisis", "acute_medical_emergency"]
FactorDirection = Literal["increases_risk", "protective"]
NextStepPriority = Literal["routine", "standard", "timely", "urgent_escalation"]
CheckInSafetyStatus = Literal["normal", "needs_review", "escalated"]

AssistantResponseType = Literal[
    "explanation",
    "preventive_guidance",
    "check_in_prompt",
    "refusal",
    "escalation",
    "unavailable",
]

SuggestedActionCode = Literal[
    "view_facilities",
    "view_risk_detail",
    "complete_check_in",
    "contact_emergency_support",
    "manage_consents",
]


class StrictContractModel(BaseModel):
    """Immutable strict Pydantic v2 base contract rejecting all unapproved/PII fields."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class ErrorDetail(StrictContractModel):
    """Redacted validation or domain error detail carrying only field path and reason code."""

    field: str
    reason: str


class ErrorBody(StrictContractModel):
    """Standard API error body (CODING_STANDARDS.md §8.1, API_DOCUMENTATION.md §6)."""

    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str


class ErrorEnvelope(StrictContractModel):
    """Standard top-level API error envelope."""

    error: ErrorBody
