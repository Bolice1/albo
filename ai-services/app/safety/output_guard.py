"""Deterministic post-model output guard enforcing HAZ-03 and HAZ-04."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from app.safety.crisis_screener import normalize_for_matching
from app.safety.escalation_templates import POST_FILTER_SAFE_FALLBACK_MESSAGE

# Strip approved ISO-8601 timestamps and rule-version tags before phone-number scanning
_ISO_TIMESTAMP_RE: Final[re.Pattern[str]] = re.compile(
    r"\b\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[zZ]|[+-]\d{2}:\d{2})?\b"
)
_ISO_DATE_RE: Final[re.Pattern[str]] = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_SEMVER_TAG_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:rules|assistant|model|kb)-v\d+\.\d+\.\d+(?:-[a-z0-9]+)?\b", re.IGNORECASE
)

_DIAGNOSTIC_CLAIM_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(
        r"\byou\s+(?:have|definitely\s+have|likely\s+have|are\s+suffering\s+from|are\s+diagnosed\s+with|tested\s+positive\s+for)\s+"
        r"(?:diabetes|malaria|cholera|hypertension|heart\s+disease|cancer|asthma|tuberculosis|pneumonia|depression|clinical\s+anxiety|covid|typhoid)\b"
    ),
    re.compile(r"\bconfirmed\s+(?:medical\s+|clinical\s+)?diagnosis\b"),
    re.compile(r"\b(?:my|the|your)\s+clinical\s+diagnosis\s+is\b"),
    re.compile(r"\bthis\s+(?:confirms|proves)\s+(?:that\s+)?you\s+(?:have|do\s+not\s+have)\b"),
    re.compile(
        r"\b(?:completely\s+)?rules\s+out\s+(?:any\s+|all\s+)?(?:disease|illness|malaria|diabetes|infection)\b"
    ),
)

_PRESCRIPTION_CLAIM_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(
        r"\btake\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|milligrams?|milliliters?|tablets?|capsules?|pills?)\b"
    ),
    re.compile(
        r"\b(?:start\s+taking|i\s+prescribe|prescribing\s+you|take\s+a\s+course\s+of)\s+"
        r"(?:amoxicillin|ciprofloxacin|azithromycin|coartem|artemether|metronidazole|doxycycline|metformin|amlodipine|lisinopril|insulin|antibiotics?)\b"
    ),
    re.compile(
        r"\b(?:amoxicillin|ciprofloxacin|azithromycin|coartem|artemether|metronidazole|doxycycline|metformin|amlodipine|lisinopril)\s+\d+\s*(?:mg|ml)\b"
    ),
    re.compile(
        r"\b(?:stop|discontinue)\s+taking\s+your\s+(?:prescribed\s+)?(?:insulin|medication|blood\s+pressure|pills)\b"
    ),
)

_UNVERIFIED_URL_OR_PHONE_PATTERNS: Final[tuple[re.Pattern[str], ...]] = (
    re.compile(r"https?://\S+", re.IGNORECASE),
    re.compile(r"\bwww\.\S+", re.IGNORECASE),
    # International / Rwanda / standard telephone patterns (+250 788 123 456, 0788-123-456, (555) 123-4567)
    re.compile(r"(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3,4}\)?[\s.-]?)\d{3}[\s.-]?\d{3,4}\b"),
    # Emergency shortcodes embedded in free-generated prose rather than Core API verified cards
    re.compile(
        r"\b(?:call|dial|phone|hotline|whatsapp)\s*(?:at|:)?\s*\+?\d{3,12}\b", re.IGNORECASE
    ),
)

_HALLUCINATED_FACILITY_NAME_RE: Final[re.Pattern[str]] = re.compile(
    r"\b(?:"
    r"king\s+faisal\s+hospital|"
    r"chuk\b|"
    r"university\s+teaching\s+hospital\s+of\s+kigali|"
    r"kibagabaga\s+(?:district\s+)?hospital|"
    r"nyarugenge\s+(?:district\s+)?hospital|"
    r"muhima\s+(?:district\s+)?hospital|"
    r"masaka\s+(?:district\s+)?hospital|"
    r"rwanda\s+military\s+hospital|"
    r"ndera\s+neuropsychiatric\s+hospital|"
    r"[A-Z][a-z]+\s+(?:District\s+|Referral\s+|General\s+|Memorial\s+)?(?:Hospital|Clinic|Health\s+Center|Pharmacy)"
    r")",
)


@dataclass(frozen=True, slots=True)
class OutputGuardResult:
    """Result of scanning candidate model text against non-diagnostic and contact-integrity rules."""

    triggered: bool
    sanitized_text: str
    reason_codes: tuple[str, ...]


def detect_output_violations(text: str) -> tuple[str, ...]:
    """Return all deterministic safety violation codes found in a candidate text string."""
    reasons: list[str] = []
    normalized = normalize_for_matching(text)

    for pattern in _DIAGNOSTIC_CLAIM_PATTERNS:
        if pattern.search(normalized):
            reasons.append("POST_FILTER_DIAGNOSTIC_CLAIM_BLOCKED")
            break

    for pattern in _PRESCRIPTION_CLAIM_PATTERNS:
        if pattern.search(normalized):
            reasons.append("POST_FILTER_PRESCRIPTION_CLAIM_BLOCKED")
            break

    scrubbed_dates = _SEMVER_TAG_RE.sub("", _ISO_DATE_RE.sub("", _ISO_TIMESTAMP_RE.sub("", text)))
    for pattern in _UNVERIFIED_URL_OR_PHONE_PATTERNS:
        if pattern.search(scrubbed_dates):
            reasons.append("POST_FILTER_UNVERIFIED_CONTACT_BLOCKED")
            break

    if _HALLUCINATED_FACILITY_NAME_RE.search(text) or _HALLUCINATED_FACILITY_NAME_RE.search(
        normalized
    ):
        reasons.append("POST_FILTER_UNVERIFIED_FACILITY_BLOCKED")

    return tuple(reasons)


def verify_and_sanitize_output(candidate_text: str) -> OutputGuardResult:
    """Block unsafe candidate text and substitute the reviewed non-diagnostic fallback."""
    violations = detect_output_violations(candidate_text)
    if violations:
        return OutputGuardResult(
            triggered=True,
            sanitized_text=POST_FILTER_SAFE_FALLBACK_MESSAGE,
            reason_codes=violations,
        )
    return OutputGuardResult(
        triggered=False,
        sanitized_text=candidate_text,
        reason_codes=(),
    )
