"""Deterministic pre-model input guard for prompt injection and prohibited clinical demands."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, Literal

from app.safety.crisis_screener import normalize_for_matching

InputGuardCategory = Literal["prompt_injection", "prohibited_clinical_request"]

_PROMPT_INJECTION_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    (
        "INJECTION_INSTRUCTION_OVERRIDE",
        re.compile(
            r"\b(?:"
            r"ignore\s+(?:all\s+)?(?:previous|prior|above|earlier|system|safety)\s+(?:instructions|prompts|rules|guidelines|constraints|directives)|"
            r"disregard\s+(?:your|all|previous|safety)\s+(?:instructions|rules|guidelines|boundaries|prompts)|"
            r"forget\s+(?:everything|all\s+rules|your\s+instructions|your\s+safety|prior\s+rules)|"
            r"bypass\s+(?:your\s+|all\s+)?(?:safety|guardrails|filters|restrictions|rules)|"
            r"override\s+(?:system|safety)\s+(?:prompt|rules|protocol|guardrails)|"
            r"developer\s+mode|"
            r"dan\s+mode|"
            r"do\s+anything\s+now|"
            r"jailbreak"
            r")\b"
        ),
    ),
    (
        "INJECTION_CLINICAL_ROLEPLAY",
        re.compile(
            r"\b(?:"
            r"(?:pretend\s+(?:you\s+are|to\s+be)|act\s+as|role[- ]?play\s+as|you\s+are\s+now|assume\s+the\s+role\s+of)\s+"
            r"(?:a\s+|my\s+|an\s+|the\s+)?(?:licensed\s+|board[- ]certified\s+|chief\s+|senior\s+)?"
            r"(?:dr\.?\s+\w+|doctor|physician|clinician|cardiologist|psychiatrist|pharmacist|nurse|surgeon|therapist|medical\s+specialist|medical\s+doctor)|"
            r"respond\s+as\s+a\s+medical\s+authority"
            r")\b"
        ),
    ),
    (
        "INJECTION_SYSTEM_OR_SECRET_EXTRACTION",
        re.compile(
            r"\b(?:"
            r"(?:reveal|show|print|dump|display|repeat|output|leak|echo)\s+(?:me\s+)?(?:your\s+|the\s+|all\s+)?"
            r"(?:system\s+prompts?|hidden\s+prompts?|initial\s+instructions|developer\s+instructions|internal\s+instructions|internal\s+configuration|environment\s+variables|env\s+vars|secret\s+tokens?|api\s+keys?|internal_service_token)|"
            r"what\s+(?:is|are)\s+your\s+(?:system\s+prompts?|hidden\s+instructions|internal_service_token|api\s+keys?|secret\s+keys?)"
            r")\b"
        ),
    ),
    (
        "INJECTION_CROSS_USER_DATA_PROBE",
        re.compile(
            r"\b(?:"
            r"(?:show|read|fetch|access|get|summarize|compare|dump|list|query|lookup)\s+(?:me\s+)?"
            r"(?:another\s+(?:user|citizen|patient|person)'?s?|other\s+(?:users|patients|citizens)'?|all\s+(?:users|patients|citizens)|records?\s+for\s+(?:user|patient|citizen))|"
            r"(?:user_id|user_account_id|patient_id|citizen_id|account_id)\s*(?:[=:#]\s*[a-z0-9_-]+|\b[a-z0-9_-]+\b)|"
            r"(?:fetch|show|read|access|get|dump)\s+(?:user|patient|citizen)\s+\d+|"
            r"select\s+\*\s+from\s+\w+"
            r")\b"
        ),
    ),
)

_PROHIBITED_CLINICAL_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    (
        "PROHIBITED_DIAGNOSIS_REQUEST",
        re.compile(
            r"\b(?:"
            r"diagnose\s+(?:me|my\s+\w+|this\s+\w+)|"
            r"give\s+me\s+a\s+(?:medical\s+|clinical\s+)?diagnosis|"
            r"(?:confirm|rule\s+out)\s+(?:whether|if|that)?\s*(?:i\s+have\s+)?(?:diabetes|malaria|cholera|tuberculosis|hiv|cancer|hypertension|pneumonia|asthma|covid|typhoid|depression|infection|disease|illness)|"
            r"do\s+i\s+have\s+(?:diabetes|malaria|cholera|tuberculosis|hiv|cancer|hypertension|pneumonia|asthma|covid|typhoid|depression|bipolar|heart\s+disease|kidney\s+disease|an?\s+infection)|"
            r"what\s+(?:disease|illness|infection|disorder|medical\s+condition)\s+do\s+i\s+have|"
            r"tell\s+me\s+(?:exactly\s+)?what\s+(?:disease|illness|infection|disorder|condition)\s+i\s+have|"
            r"am\s+i\s+positive\s+for|"
            r"(?:interpret|analyze|read)\s+my\s+(?:lab\s+results?|blood\s+test|blood\s+work|x-?ray|mri|ct\s+scan|biopsy|ecg|urinalysis)"
            r")\b"
        ),
    ),
    (
        "PROHIBITED_PRESCRIPTION_OR_DOSAGE_REQUEST",
        re.compile(
            r"\b(?:"
            r"prescribe\s+(?:me|an?\s+\w+|medication|antibiotics?|pills?|drugs?|treatment)|"
            r"(?:give|write)\s+me\s+a\s+prescription|"
            r"what\s+(?:antibiotics?|medications?|drugs?|medicines?|pills?)\s+should\s+i\s+(?:take|buy|use|give)|"
            r"which\s+(?:antibiotics?|medications?|drugs?|medicines?|pills?)\s+(?:should\s+i\s+take|cures?|treats?)|"
            r"what\s+(?:is\s+the\s+)?(?:dosage|dose)\s+(?:of|for)\s+\w+|"
            r"how\s+(?:many|much)\s+(?:mg|milligrams|ml|pills|tablets|capsules)\s+of\s+\w+|"
            r"how\s+much\s+(?:amoxicillin|ciprofloxacin|azithromycin|coartem|artemether|metronidazole|doxycycline|metformin|amlodipine|lisinopril|insulin|ibuprofen|paracetamol)\s+should\s+i\s+take|"
            r"(?:amoxicillin|ciprofloxacin|azithromycin|coartem|artemether|metronidazole|doxycycline|metformin|amlodipine|lisinopril|insulin|ibuprofen|paracetamol)\s+(?:dosage|dose)|"
            r"dosage\s+for\s+(?:amoxicillin|ciprofloxacin|azithromycin|coartem|antibiotics?|metformin|ibuprofen|paracetamol|insulin)"
            r")\b"
        ),
    ),
    (
        "PROHIBITED_MEDICATION_CESSATION_REQUEST",
        re.compile(
            r"\b(?:"
            r"(?:should|can|is\s+it\s+okay\s+if|is\s+it\s+safe\s+to)\s+(?:i\s+)?(?:stop|quit|discontinue|skip|reduce|halve|double|change)\s+(?:taking\s+)?(?:my\s+)?"
            r"(?:insulin|medications?|medicines?|prescribed\s+\w+|blood\s+pressure\s+pills?|antihypertensives?|antiretrovirals?|arvs?|inhalers?|antibiotics?|antidepressants?|treatments?)|"
            r"stop\s+taking\s+my\s+(?:insulin|prescribed\s+\w+|blood\s+pressure\s+\w+|heart\s+\w+|pills|medications?|antibiotics?|treatments?)"
            r")\b"
        ),
    ),
)


@dataclass(frozen=True, slots=True)
class InputGuardResult:
    """Result of deterministic pre-model input guard screening."""

    blocked: bool
    category: InputGuardCategory | None
    reason_codes: tuple[str, ...]


def evaluate_input_guard(
    user_message: str,
    conversation_window_user_messages: Sequence[str] = (),
) -> InputGuardResult:
    """Inspect user_message for prompt injection or prohibited clinical diagnosis/prescription demands."""
    normalized_current = normalize_for_matching(user_message)

    injection_reasons: list[str] = []
    for code, pattern in _PROMPT_INJECTION_PATTERNS:
        if pattern.search(normalized_current):
            injection_reasons.append(code)

    # Also inspect recent user turns strictly for persistent jailbreak/override attempts
    for prior in conversation_window_user_messages:
        norm_prior = normalize_for_matching(prior)
        for code, pattern in _PROMPT_INJECTION_PATTERNS:
            if (
                code == "INJECTION_INSTRUCTION_OVERRIDE"
                and pattern.search(norm_prior)
                and code not in injection_reasons
                and "follow" in normalized_current
            ):
                injection_reasons.append(code)

    if injection_reasons:
        return InputGuardResult(
            blocked=True,
            category="prompt_injection",
            reason_codes=tuple(injection_reasons),
        )

    clinical_reasons: list[str] = []
    for code, pattern in _PROHIBITED_CLINICAL_PATTERNS:
        if pattern.search(normalized_current):
            clinical_reasons.append(code)

    if clinical_reasons:
        return InputGuardResult(
            blocked=True,
            category="prohibited_clinical_request",
            reason_codes=tuple(clinical_reasons),
        )

    return InputGuardResult(blocked=False, category=None, reason_codes=())
