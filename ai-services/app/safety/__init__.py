"""Deterministic pre- and post-processing AI and clinical safety guardrails."""

from app.safety.crisis_screener import (
    CrisisScreeningResult,
    normalize_for_matching,
    screen_combined_crisis,
    screen_structured_signals,
    screen_text_for_crisis,
)
from app.safety.escalation_templates import (
    ACUTE_MEDICAL_EMERGENCY_MESSAGE,
    ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER,
    ASSISTANT_UNAVAILABLE_MESSAGE,
    CHECKIN_NON_DIAGNOSTIC_DISCLAIMER,
    LOW_RISK_CAVEAT_STATEMENT,
    MENTAL_HEALTH_CRISIS_MESSAGE,
    POST_FILTER_SAFE_FALLBACK_MESSAGE,
    PROHIBITED_CLINICAL_REFUSAL_MESSAGE,
    PROMPT_INJECTION_REFUSAL_MESSAGE,
)
from app.safety.input_guard import InputGuardCategory, InputGuardResult, evaluate_input_guard
from app.safety.output_guard import (
    OutputGuardResult,
    detect_output_violations,
    verify_and_sanitize_output,
)

__all__ = [
    "ACUTE_MEDICAL_EMERGENCY_MESSAGE",
    "ASSISTANT_NON_DIAGNOSTIC_DISCLAIMER",
    "ASSISTANT_UNAVAILABLE_MESSAGE",
    "CHECKIN_NON_DIAGNOSTIC_DISCLAIMER",
    "LOW_RISK_CAVEAT_STATEMENT",
    "MENTAL_HEALTH_CRISIS_MESSAGE",
    "POST_FILTER_SAFE_FALLBACK_MESSAGE",
    "PROHIBITED_CLINICAL_REFUSAL_MESSAGE",
    "PROMPT_INJECTION_REFUSAL_MESSAGE",
    "CrisisScreeningResult",
    "InputGuardCategory",
    "InputGuardResult",
    "OutputGuardResult",
    "detect_output_violations",
    "evaluate_input_guard",
    "normalize_for_matching",
    "screen_combined_crisis",
    "screen_structured_signals",
    "screen_text_for_crisis",
    "verify_and_sanitize_output",
]
