"""Bounded Stage 1 template-guided assistant adapter and mandatory pre/post safety pipeline."""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Final, Protocol, runtime_checkable

from app.contracts.assistant import (
    AssessmentContextSummary,
    AssistantRespondRequest,
    AssistantRespondResponse,
    AssistantSafetyMetadata,
)
from app.contracts.common import AssistantResponseType, SuggestedActionCode
from app.safety.crisis_screener import normalize_for_matching, screen_text_for_crisis
from app.safety.escalation_templates import (
    ACUTE_MEDICAL_EMERGENCY_MESSAGE,
    ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
    ASSISTANT_UNAVAILABLE_MESSAGE,
    MENTAL_HEALTH_CRISIS_MESSAGE,
    PROHIBITED_CLINICAL_REFUSAL_MESSAGE,
    PROMPT_INJECTION_REFUSAL_MESSAGE,
)
from app.safety.input_guard import evaluate_input_guard
from app.safety.output_guard import verify_and_sanitize_output

from model_adapters.knowledge_base import KNOWLEDGE_BASE_VERSION, match_knowledge_snippet

STAGE1_ASSISTANT_ADAPTER_VERSION: Final[str] = "assistant-v1.0.0-stage1"

_EXPLANATION_INTENT_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:"
    r"explain\s+(?:my|this|the)\s+(?:latest\s+|current\s+|recent\s+)?(?:preventive\s+)?(?:risk|assessment|indicator|result|score|level|factors?)|"
    r"what\s+does\s+my\s+(?:latest\s+|current\s+|recent\s+)?(?:preventive\s+)?(?:risk|assessment|indicator|result|level)\s+mean|"
    r"why\s+is\s+my\s+(?:latest\s+|current\s+)?(?:preventive\s+)?(?:risk|indicator|assessment|level)|"
    r"(?:understand|summarize|review)\s+my\s+(?:latest\s+|current\s+|recent\s+)?(?:preventive\s+)?(?:risk|assessment|indicator|factors?)|"
    r"my\s+(?:latest\s+|current\s+)?(?:preventive\s+)?(?:risk\s+assessment|risk\s+indicator|risk\s+level|contributing\s+factors?)"
    r")\b"
)

_CHECKIN_INTENT_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:"
    r"check[- ]?in|"
    r"(?:start|complete|do|take|guide\s+me\s+through)\s+a\s+(?:wellbeing|wellness|stress|daily|lifestyle)\s+(?:check|reflection)|"
    r"structured\s+(?:wellbeing\s+)?reflection"
    r")\b"
)

_FACILITY_INTENT_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:"
    r"(?:find|show|locate|search|nearest|nearby|closest|where\s+is|where\s+can\s+i\s+find)\s+"
    r"(?:a\s+|an\s+|the\s+|verified\s+)?(?:hospitals?|clinics?|pharmac(?:y|ies)|health\s+cent(?:er|re)s?|health(?:care)?\s+facilit(?:y|ies)|doctors?|providers?|community\s+health\s+workers?|chws?)|"
    r"(?:hospital|clinic|pharmacy|facility|hotline|emergency)\s+(?:phone\s+numbers?|numbers?|contacts?|address(?:es)?|locations?|directions?)|"
    r"phone\s+number\s+for\s+(?:a\s+|the\s+)?(?:hospital|clinic|pharmacy|doctor|facility)|"
    r"where\s+(?:should|can)\s+i\s+go\s+for\s+(?:a\s+checkup|care|testing|screening|consultation)"
    r")\b"
)

_EXPLANATION_HINTS: Final[frozenset[str]] = frozenset(
    {"explain_assessment", "assessment_explanation", "risk_explanation", "assessment"}
)
_CHECKIN_HINTS: Final[frozenset[str]] = frozenset(
    {"check_in", "checkin", "wellbeing_check_in", "complete_check_in"}
)
_FACILITY_HINTS: Final[frozenset[str]] = frozenset(
    {"facilities", "facility_search", "find_care", "nearby_facilities"}
)


@runtime_checkable
class AssistantModelAdapter(Protocol):
    """Uniform protocol for Stage 1 deterministic and future Stage 2 gated assistant adapters."""

    @property
    def adapter_version(self) -> str:
        """Immutable version identifier recorded for provenance and audit."""

    def respond(self, request: AssistantRespondRequest) -> AssistantRespondResponse:
        """Process a single caller-scoped turn through mandatory pre/post safety gates."""


def _format_utc_iso(dt_str_or_obj: object) -> str:
    text = str(dt_str_or_obj)
    if hasattr(dt_str_or_obj, "isoformat"):
        iso_fn = dt_str_or_obj.isoformat
        if callable(iso_fn):
            text = str(iso_fn())
    return text.replace("+00:00", "Z")


def _humanize_code(code: str) -> str:
    return code.replace("_", " ").strip()


def _build_assessment_explanation(
    summary: AssessmentContextSummary | None,
) -> tuple[
    str,
    str | None,
    str | None,
    list[SuggestedActionCode],
    list[str],
]:
    if summary is None:
        msg = (
            "No authorized preventive risk indicator summary was included in this conversation "
            "context yet. You can open your risk assessment details in Albo or submit fresh "
            "consented lifestyle inputs so an indicator can be calculated and explained."
        )
        return msg, None, None, ["view_risk_detail"], []

    calc_ts = _format_utc_iso(summary.calculated_at)
    use_case_label = _humanize_code(summary.use_case_code)

    if summary.status != "complete" or summary.level is None:
        lims = (
            " ".join(summary.limitations)
            if summary.limitations
            else (
                "Required inputs were missing, stale, or unavailable; missing data never implies low risk."
            )
        )
        steps_text = (
            ", ".join(_humanize_code(s.action_code) for s in summary.recommended_next_steps)
            if summary.recommended_next_steps
            else "provide fresh required inputs"
        )
        msg = (
            f"Your {use_case_label} assessment (calculated at {calc_ts} using "
            f"{summary.rule_model_version}) has status '{summary.status}' with no preventive "
            f"level assigned. Limitations: {lims} Recommended next steps: {steps_text}."
        )
        facility_tags: list[str] = []
        for step in summary.recommended_next_steps:
            if step.facility_service_tags:
                for tag in step.facility_service_tags:
                    if tag not in facility_tags:
                        facility_tags.append(tag)
        actions: list[SuggestedActionCode] = ["view_risk_detail"]
        if facility_tags:
            actions.append("view_facilities")
        return msg, summary.assessment_id, summary.rule_model_version, actions, facility_tags

    if summary.contributing_factors:
        factor_parts: list[str] = []
        for f in summary.contributing_factors:
            role_desc = (
                "elevates tracked preventive exposure"
                if f.direction == "increases_risk"
                else "acts as a protective habit"
            )
            factor_parts.append(f"{_humanize_code(f.factor_code)} ({role_desc})")
        factors_summary = "; ".join(factor_parts)
    else:
        factors_summary = "evaluated inputs fell within neutral preventive bands"

    limitations_summary = (
        " ".join(summary.limitations)
        if summary.limitations
        else "This is a non-diagnostic preventive indicator and does not confirm or rule out illness."
    )
    next_steps_summary = (
        ", ".join(_humanize_code(s.action_code) for s in summary.recommended_next_steps)
        if summary.recommended_next_steps
        else "maintain routine preventive habits"
    )

    facility_tags = []
    for step in summary.recommended_next_steps:
        if step.facility_service_tags:
            for tag in step.facility_service_tags:
                if tag not in facility_tags:
                    facility_tags.append(tag)

    actions = ["view_risk_detail"]
    if summary.level == "high" or facility_tags:
        actions.append("view_facilities")

    msg = (
        f"Your {use_case_label} preventive risk indicator (calculated at {calc_ts} under "
        f"{summary.rule_model_version}) is '{summary.level}'. Key contributing factors: "
        f"{factors_summary}. Recommended preventive next steps: {next_steps_summary}. "
        f"Important limitations: {limitations_summary}"
    )
    return msg, summary.assessment_id, summary.rule_model_version, actions, facility_tags


def _infer_facility_tags(normalized_msg: str) -> list[str]:
    tags: list[str] = []
    if "pharmac" in normalized_msg:
        tags.append("pharmacy")
    if any(term in normalized_msg for term in ("mental", "counsel", "wellbeing", "stress")):
        tags.append("mental_health_support")
    if any(term in normalized_msg for term in ("community health", "chw")):
        tags.append("community_health_worker")
    if "primary_care" not in tags:
        tags.append("primary_care")
    return tags


def _enforce_pre_safety_gates(
    request: AssistantRespondRequest,
    *,
    adapter_version: str,
) -> AssistantRespondResponse | None:
    """Execute deterministic FR-024 crisis screener FIRST and input_guard SECOND."""
    crisis = screen_text_for_crisis(request.user_message)
    if crisis.escalation_required:
        raw_escalation_copy = (
            MENTAL_HEALTH_CRISIS_MESSAGE
            if crisis.escalation_category == "mental_health_crisis"
            else ACUTE_MEDICAL_EMERGENCY_MESSAGE
        )
        post_check = verify_and_sanitize_output(raw_escalation_copy)
        reason_codes = list(crisis.reason_codes)
        if post_check.triggered:
            reason_codes.extend(post_check.reason_codes)
        return AssistantRespondResponse(
            request_id=request.request_id,
            conversation_id=request.conversation_id,
            adapter_version=adapter_version,
            response_type="escalation",
            message_text=post_check.sanitized_text,
            disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
            referenced_assessment_id=None,
            rule_model_version=None,
            suggested_actions=["contact_emergency_support", "view_facilities"],
            recommended_facility_tags=list(crisis.recommended_facility_tags),
            safety_metadata=AssistantSafetyMetadata(
                pre_filter_triggered=True,
                post_filter_triggered=post_check.triggered,
                escalation_required=True,
                escalation_category=crisis.escalation_category,
                reason_codes=reason_codes,
            ),
        )

    prior_user_turns = [t.content for t in request.conversation_window if t.role == "user"]
    guard = evaluate_input_guard(request.user_message, prior_user_turns)
    if guard.blocked:
        refusal_copy = (
            PROMPT_INJECTION_REFUSAL_MESSAGE
            if guard.category == "prompt_injection"
            else PROHIBITED_CLINICAL_REFUSAL_MESSAGE
        )
        actions: list[SuggestedActionCode] = (
            ["view_facilities"]
            if guard.category == "prohibited_clinical_request"
            else ["view_risk_detail"]
        )
        post_check = verify_and_sanitize_output(refusal_copy)
        reasons = list(guard.reason_codes)
        if post_check.triggered:
            reasons.extend(post_check.reason_codes)
        return AssistantRespondResponse(
            request_id=request.request_id,
            conversation_id=request.conversation_id,
            adapter_version=adapter_version,
            response_type="refusal",
            message_text=post_check.sanitized_text,
            disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
            referenced_assessment_id=None,
            rule_model_version=None,
            suggested_actions=actions,
            recommended_facility_tags=(
                ["primary_care"] if guard.category == "prohibited_clinical_request" else []
            ),
            safety_metadata=AssistantSafetyMetadata(
                pre_filter_triggered=True,
                post_filter_triggered=post_check.triggered,
                escalation_required=False,
                escalation_category=None,
                reason_codes=reasons,
            ),
        )

    return None


class TemplateGuidedAssistantAdapter:
    """Stage 1 in-house template and curated-knowledge assistant (zero external LLM calls)."""

    def __init__(
        self,
        *,
        adapter_version: str = STAGE1_ASSISTANT_ADAPTER_VERSION,
        candidate_override_fn: Callable[[AssistantRespondRequest], str] | None = None,
    ) -> None:
        self._adapter_version = adapter_version
        self._candidate_override_fn = candidate_override_fn

    @property
    def adapter_version(self) -> str:
        return self._adapter_version

    def respond(self, request: AssistantRespondRequest) -> AssistantRespondResponse:
        # 1. Pre-model crisis screener (FR-024) + 2. Pre-model input guard (HAZ-03, HAZ-06)
        pre_gated = _enforce_pre_safety_gates(request, adapter_version=self._adapter_version)
        if pre_gated is not None:
            return pre_gated

        # 3. Deterministic Stage 1 intent routing
        normalized_msg = normalize_for_matching(request.user_message)
        raw_hint = request.authorized_context_snapshot.topic_hint
        norm_hint = normalize_for_matching(raw_hint).replace(" ", "_") if raw_hint else ""

        response_type: AssistantResponseType
        candidate_text: str
        ref_assessment_id: str | None = None
        ref_rule_version: str | None = None
        suggested_actions: list[SuggestedActionCode]
        facility_tags: list[str] = []

        if norm_hint in _EXPLANATION_HINTS or _EXPLANATION_INTENT_RE.search(normalized_msg):
            response_type = "explanation"
            (
                candidate_text,
                ref_assessment_id,
                ref_rule_version,
                suggested_actions,
                facility_tags,
            ) = _build_assessment_explanation(request.authorized_context_snapshot.latest_assessment)
        elif norm_hint in _CHECKIN_HINTS or _CHECKIN_INTENT_RE.search(normalized_msg):
            response_type = "check_in_prompt"
            candidate_text = (
                "A structured Albo wellbeing check-in helps you pause and reflect on recent "
                "stress frequency, emotional exhaustion, and sleep quality using a versioned "
                "non-diagnostic questionnaire. Your responses are saved only when your wellbeing "
                "check-in consent is active. Select the check-in action in Albo whenever you are "
                "ready to begin."
            )
            suggested_actions = ["complete_check_in"]
        elif norm_hint in _FACILITY_HINTS or _FACILITY_INTENT_RE.search(normalized_msg):
            response_type = "preventive_guidance"
            availability_clause = (
                "Verified facility records are available for your current session and attached by "
                "Albo's facility directory."
                if request.authorized_context_snapshot.has_verified_facilities
                else "Use the facility directory action in Albo to search verified healthcare "
                "locations and up-to-date contact details."
            )
            candidate_text = (
                "To protect your safety and prevent inaccurate directions or contact details, "
                "Albo Assistant never generates hospital names, street addresses, or telephone "
                f"numbers from AI text. {availability_clause}"
            )
            suggested_actions = ["view_facilities"]
            facility_tags = _infer_facility_tags(normalized_msg)
        else:
            response_type = "preventive_guidance"
            snippet = match_knowledge_snippet(request.user_message, raw_hint)
            candidate_text = (
                f"{snippet.guidance_text} (Reference: {snippet.guideline_source}; "
                f"{KNOWLEDGE_BASE_VERSION})."
            )
            suggested_actions = list(snippet.suggested_actions)
            if "view_facilities" in suggested_actions:
                facility_tags = ["primary_care"]

        if self._candidate_override_fn is not None:
            candidate_text = self._candidate_override_fn(request)

        # 4. Mandatory post-model output guard (HAZ-03, HAZ-04)
        post_guard = verify_and_sanitize_output(candidate_text)
        if post_guard.triggered:
            return AssistantRespondResponse(
                request_id=request.request_id,
                conversation_id=request.conversation_id,
                adapter_version=self._adapter_version,
                response_type="refusal",
                message_text=post_guard.sanitized_text,
                disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
                referenced_assessment_id=None,
                rule_model_version=None,
                suggested_actions=["view_facilities"],
                recommended_facility_tags=["primary_care"],
                safety_metadata=AssistantSafetyMetadata(
                    pre_filter_triggered=False,
                    post_filter_triggered=True,
                    escalation_required=False,
                    escalation_category=None,
                    reason_codes=list(post_guard.reason_codes),
                ),
            )

        return AssistantRespondResponse(
            request_id=request.request_id,
            conversation_id=request.conversation_id,
            adapter_version=self._adapter_version,
            response_type=response_type,
            message_text=post_guard.sanitized_text,
            disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
            referenced_assessment_id=ref_assessment_id,
            rule_model_version=ref_rule_version,
            suggested_actions=suggested_actions,
            recommended_facility_tags=facility_tags,
            safety_metadata=AssistantSafetyMetadata(
                pre_filter_triggered=False,
                post_filter_triggered=False,
                escalation_required=False,
                escalation_category=None,
                reason_codes=[],
            ),
        )


def run_guarded_assistant_turn(
    request: AssistantRespondRequest,
    adapter: AssistantModelAdapter,
) -> AssistantRespondResponse:
    """Enforce deterministic crisis/input/output guards and graceful degradation around any adapter."""
    pre_gated = _enforce_pre_safety_gates(request, adapter_version=adapter.adapter_version)
    if pre_gated is not None:
        return pre_gated

    try:
        candidate = adapter.respond(request)
    except Exception:
        return AssistantRespondResponse(
            request_id=request.request_id,
            conversation_id=request.conversation_id,
            adapter_version=adapter.adapter_version,
            response_type="unavailable",
            message_text=ASSISTANT_UNAVAILABLE_MESSAGE,
            disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
            referenced_assessment_id=None,
            rule_model_version=None,
            suggested_actions=["view_facilities"],
            recommended_facility_tags=[],
            safety_metadata=AssistantSafetyMetadata(
                pre_filter_triggered=False,
                post_filter_triggered=False,
                escalation_required=False,
                escalation_category=None,
                reason_codes=["ADAPTER_RUNTIME_UNAVAILABLE"],
            ),
        )

    post_check = verify_and_sanitize_output(candidate.message_text)
    if post_check.triggered:
        combined_reasons = list(
            dict.fromkeys([*candidate.safety_metadata.reason_codes, *post_check.reason_codes])
        )
        return AssistantRespondResponse(
            request_id=candidate.request_id,
            conversation_id=candidate.conversation_id,
            adapter_version=candidate.adapter_version,
            response_type="refusal",
            message_text=post_check.sanitized_text,
            disclaimer=ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
            referenced_assessment_id=None,
            rule_model_version=None,
            suggested_actions=["view_facilities"],
            recommended_facility_tags=["primary_care"],
            safety_metadata=AssistantSafetyMetadata(
                pre_filter_triggered=candidate.safety_metadata.pre_filter_triggered,
                post_filter_triggered=True,
                escalation_required=candidate.safety_metadata.escalation_required,
                escalation_category=candidate.safety_metadata.escalation_category,
                reason_codes=combined_reasons,
            ),
        )

    return candidate
