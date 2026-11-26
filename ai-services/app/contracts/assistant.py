"""Contracts for POST /internal/v1/assistant/respond (AI_ASSISTANT.md §5.1 & §6)."""

from __future__ import annotations

import re
from typing import Final, Literal

from pydantic import AwareDatetime, Field, field_validator
from pydantic_core import PydanticCustomError

from app.contracts.common import (
    AssessmentStatus,
    AssistantResponseType,
    EscalationCategory,
    RiskLevel,
    StrictContractModel,
    SuggestedActionCode,
)
from app.contracts.risk_assessment import ContributingFactor, RecommendedNextStep

_CONTROL_CHAR_RE: Final[re.Pattern[str]] = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _sanitize_text_message(value: str) -> str:
    cleaned = _CONTROL_CHAR_RE.sub("", value).strip()
    if not cleaned:
        raise PydanticCustomError(
            "empty_message", "Message text cannot be empty after control-character stripping."
        )
    return cleaned


class AssistantAuthorizationContext(StrictContractModel):
    """Verified consent metadata confirming assistant_conversations consent."""

    consent_verified: Literal[True]
    consent_purpose_code: Literal["assistant_conversations"]
    consent_version: str = Field(min_length=1, max_length=32)


class ConversationTurn(StrictContractModel):
    """Single bounded prior turn in the current session window."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)

    @field_validator("content")
    @classmethod
    def sanitize_turn_content(cls, value: str) -> str:
        return _sanitize_text_message(value)


class AssessmentContextSummary(StrictContractModel):
    """Caller's authorized risk assessment summary passed for grounded explanation."""

    assessment_id: str = Field(min_length=1, max_length=128)
    use_case_code: str = Field(min_length=1, max_length=100)
    rule_model_version: str = Field(min_length=1, max_length=64)
    status: AssessmentStatus
    level: RiskLevel | None = None
    calculated_at: AwareDatetime
    contributing_factors: list[ContributingFactor] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    recommended_next_steps: list[RecommendedNextStep] = Field(default_factory=list)


class AuthorizedContextSnapshot(StrictContractModel):
    """Minimum necessary caller-scoped context snapshot (zero PII or GPS coordinates)."""

    latest_assessment: AssessmentContextSummary | None = None
    has_verified_facilities: bool = False
    topic_hint: str | None = Field(default=None, max_length=64)


class AssistantRespondRequest(StrictContractModel):
    """Internal request payload for POST /internal/v1/assistant/respond."""

    request_id: str = Field(min_length=1, max_length=128)
    conversation_id: str = Field(min_length=1, max_length=128)
    authorization_context: AssistantAuthorizationContext
    user_message: str = Field(min_length=1, max_length=1000)
    conversation_window: list[ConversationTurn] = Field(default_factory=list, max_length=5)
    authorized_context_snapshot: AuthorizedContextSnapshot = Field(
        default_factory=AuthorizedContextSnapshot
    )

    @field_validator("user_message")
    @classmethod
    def sanitize_user_message(cls, value: str) -> str:
        return _sanitize_text_message(value)


class AssistantSafetyMetadata(StrictContractModel):
    """Deterministic pre/post safety filter and crisis-escalation telemetry flags."""

    pre_filter_triggered: bool
    post_filter_triggered: bool
    escalation_required: bool
    escalation_category: EscalationCategory | None = None
    reason_codes: list[str] = Field(default_factory=list)


class AssistantRespondResponse(StrictContractModel):
    """Bounded structured response for POST /internal/v1/assistant/respond."""

    request_id: str
    conversation_id: str
    adapter_version: str
    response_type: AssistantResponseType
    message_text: str
    disclaimer: str
    referenced_assessment_id: str | None = None
    rule_model_version: str | None = None
    suggested_actions: list[SuggestedActionCode] = Field(default_factory=list)
    recommended_facility_tags: list[str] = Field(default_factory=list)
    safety_metadata: AssistantSafetyMetadata
