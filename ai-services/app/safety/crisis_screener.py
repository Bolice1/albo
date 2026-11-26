"""Deterministic two-category crisis and acute medical red-flag screener (FR-024, AI_SAFETY.md §4)."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from app.contracts.common import EscalationCategory

_WHITESPACE_RE: Final[re.Pattern[str]] = re.compile(r"\s+")

# Category A: Self-harm, suicidal ideation, and acute emotional crisis (English, French, Kinyarwanda)
_CATEGORY_A_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    (
        "CRISIS_SUICIDAL_IDEATION",
        re.compile(
            r"\b(?:"
            r"suicid(?:e|al|ality)|"
            r"kill(?:ing)?\s+myself|"
            r"take\s+my\s+(?:own\s+)?life|"
            r"end(?:ing)?\s+my\s+life|"
            r"end\s+it\s+all|"
            r"want(?:ing)?\s+to\s+die|"
            r"wanna\s+die|"
            r"wish\s+i\s+(?:were|was)\s+dead|"
            r"better\s+off\s+dead|"
            r"no\s+reason\s+(?:left\s+)?to\s+live|"
            r"nothing\s+left\s+to\s+live\s+for|"
            r"not\s+worth\s+living|"
            r"(?:can'?t|cannot)\s+go\s+on\s+living|"
            r"(?:don'?t|do\s+not)\s+want\s+to\s+(?:wake\s+up|be\s+alive|live(?:\s+anymore)?|exist)"
            r")\b"
        ),
    ),
    (
        "CRISIS_SELF_HARM_INTENT",
        re.compile(
            r"\b(?:"
            r"self[- ]?harm(?:ing)?|"
            r"hurt(?:ing)?\s+myself|"
            r"harm(?:ing)?\s+myself|"
            r"cut(?:ting)?\s+myself|"
            r"burn(?:ing)?\s+myself|"
            r"hang(?:ing)?\s+myself|"
            r"jump(?:ing)?\s+(?:off|from)\s+(?:a\s+|the\s+)?(?:bridge|building|roof|cliff)|"
            r"overdos(?:e|ing)|"
            r"(?:drink|swallow|take)\s+(?:rat\s+|household\s+)?poison|"
            r"(?:take|swallow)\s+all\s+(?:my|these|the)\s+(?:pills|tablets|medication)"
            r")\b"
        ),
    ),
    (
        "CRISIS_MULTILINGUAL_SELF_HARM",
        re.compile(
            r"\b(?:"
            r"me\s+suicider|"
            r"envie\s+de\s+mourir|"
            r"je\s+veux\s+mourir|"
            r"mettre\s+fin\s+a\s+mes\s+jours|"
            r"me\s+tuer|"
            r"me\s+faire\s+du\s+mal|"
            r"plus\s+(?:aucune\s+)?raison\s+de\s+vivre|"
            r"kwiyahura|"
            r"ndashaka\s+kwiyahura|"
            r"ndashaka\s+gupfa|"
            r"kwigirira\s+nabi"
            r")\b"
        ),
    ),
)

# Category B: Severe physical danger signs and acute medical emergencies
_CATEGORY_B_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    (
        "ACUTE_CARDIAC_CHEST_PAIN",
        re.compile(
            r"\b(?:"
            r"(?:crushing|severe|intense|squeezing|heavy|sharp|sudden)\s+chest\s+(?:pain|pressure|tightness)|"
            r"chest\s+(?:pain|pressure|tightness)\s+(?:radiating|spreading|with\s+sweating|and\s+sweating|and\s+shortness|with\s+shortness|and\s+difficulty\s+breathing|in\s+my\s+left\s+arm)|"
            r"pain\s+in\s+my\s+chest\s+and\s+(?:left\s+arm|jaw|back)|"
            r"having\s+a\s+heart\s+attack|"
            r"douleur\s+thoracique\s+(?:intense|aigue|severe)"
            r")\b"
        ),
    ),
    (
        "ACUTE_SEVERE_DYSPNEA",
        re.compile(
            r"\b(?:"
            r"(?:can'?t|cannot)\s+breathe|"
            r"struggling\s+to\s+breathe|"
            r"gasping\s+for\s+(?:air|breath)|"
            r"barely\s+able\s+to\s+breathe|"
            r"severe\s+(?:shortness\s+of\s+breath|difficulty\s+breathing|breathing\s+difficulty)|"
            r"choking\s+and\s+(?:can'?t|cannot)|"
            r"lips\s+(?:are\s+)?turning\s+blue|"
            r"throat\s+(?:is\s+)?swelling\s+shut|"
            r"je\s+n'?arrive\s+pas\s+a\s+respirer|"
            r"sinshobora\s+guhumeka"
            r")\b"
        ),
    ),
    (
        "ACUTE_NEUROLOGICAL_OR_UNCONSCIOUS",
        re.compile(
            r"\b(?:"
            r"unconscious|"
            r"loss\s+of\s+consciousness|"
            r"losing\s+consciousness|"
            r"passed\s+out|"
            r"fainted\s+and|"
            r"unresponsive|"
            r"having\s+a\s+seizure|"
            r"seizures?\s+right\s+now|"
            r"convuls(?:ing|ions)|"
            r"face\s+(?:is\s+)?drooping|"
            r"slurred\s+speech|"
            r"sudden\s+(?:weakness|numbness|paralysis)\s+on\s+one\s+side|"
            r"(?:having|signs\s+of)\s+a\s+stroke"
            r")\b"
        ),
    ),
    (
        "ACUTE_HEMORRHAGE_OR_DANGER_FEVER",
        re.compile(
            r"\b(?:"
            r"coughing\s+(?:up\s+)?blood|"
            r"vomiting\s+blood|"
            r"throwing\s+up\s+blood|"
            r"bleeding\s+(?:heavily|uncontrollably|won'?t\s+stop)|"
            r"(?:high\s+)?fever\s+(?:with|and)\s+(?:a\s+)?(?:stiff\s+neck|confusion|delirium|convulsions|lethargy|unconsciousness)|"
            r"stiff\s+neck\s+and\s+(?:high\s+)?fever|"
            r"anaphylaxis|"
            r"snake\s*bite"
            r")\b"
        ),
    ),
)

_STRUCTURED_CATEGORY_A_KEYS: Final[frozenset[str]] = frozenset(
    {
        "self_harm_signal",
        "suicidal_ideation_signal",
        "self_harm_thoughts",
        "crisis_support_flag",
    }
)

_STRUCTURED_CATEGORY_B_KEYS: Final[frozenset[str]] = frozenset(
    {
        "acute_medical_danger_signal",
        "severe_chest_pain_signal",
        "severe_dyspnea_signal",
        "unconsciousness_signal",
    }
)

_TRUTHY_CRISIS_STRINGS: Final[frozenset[str]] = frozenset(
    {
        "yes",
        "true",
        "present",
        "active",
        "sometimes",
        "often",
        "frequent",
        "severe",
        "high",
        "1",
        "2",
        "3",
        "4",
    }
)

_BENIGN_ZERO_STRINGS: Final[frozenset[str]] = frozenset(
    {"no", "none", "never", "absent", "false", "0", "not_at_all"}
)


@dataclass(frozen=True, slots=True)
class CrisisScreeningResult:
    """Result of deterministic pre-model crisis and emergency screening."""

    escalation_required: bool
    escalation_category: EscalationCategory | None
    reason_codes: tuple[str, ...]
    recommended_facility_tags: tuple[str, ...]
    guidance_key: str | None


def normalize_for_matching(text: str) -> str:
    """Normalize accents, smart apostrophes, casing, and whitespace for deterministic regex matching."""
    replaced = text.replace("\u2019", "'").replace("\u2018", "'").replace("`", "'")
    decomposed = unicodedata.normalize("NFKD", replaced)
    ascii_approx = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _WHITESPACE_RE.sub(" ", ascii_approx.lower()).strip()


def _is_positive_signal(value: int | float | str) -> bool:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value > 0
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in _BENIGN_ZERO_STRINGS:
            return False
        if cleaned in _TRUTHY_CRISIS_STRINGS:
            return True
    return False


def screen_text_for_crisis(text: str) -> CrisisScreeningResult:
    """Evaluate free text for Category A (mental-health crisis) or Category B (medical emergency)."""
    return screen_combined_crisis(texts=(text,))


def screen_structured_signals(
    signals: Mapping[str, int | float | str],
) -> CrisisScreeningResult:
    """Evaluate structured check-in or health-input fields for crisis/emergency flags."""
    return screen_combined_crisis(signals=signals)


def screen_combined_crisis(
    *,
    texts: Sequence[str] = (),
    signals: Mapping[str, int | float | str] | None = None,
) -> CrisisScreeningResult:
    """Deterministically screen both structured items and free-text turns."""
    cat_a_reasons: list[str] = []
    cat_b_reasons: list[str] = []

    if signals:
        for key, val in signals.items():
            norm_key = key.strip().lower()
            if norm_key in _STRUCTURED_CATEGORY_A_KEYS and _is_positive_signal(val):
                cat_a_reasons.append("STRUCTURED_SELF_HARM_SIGNAL")
            elif norm_key in _STRUCTURED_CATEGORY_B_KEYS and _is_positive_signal(val):
                cat_b_reasons.append("STRUCTURED_ACUTE_MEDICAL_SIGNAL")

    for raw_text in texts:
        if not raw_text:
            continue
        normalized = normalize_for_matching(raw_text)
        for code, pattern in _CATEGORY_A_PATTERNS:
            if pattern.search(normalized) and code not in cat_a_reasons:
                cat_a_reasons.append(code)
        for code, pattern in _CATEGORY_B_PATTERNS:
            if pattern.search(normalized) and code not in cat_b_reasons:
                cat_b_reasons.append(code)

    if not cat_a_reasons and not cat_b_reasons:
        return CrisisScreeningResult(
            escalation_required=False,
            escalation_category=None,
            reason_codes=(),
            recommended_facility_tags=(),
            guidance_key=None,
        )

    # Category A takes primary category classification if present, while preserving all reason codes & tags
    all_reasons = tuple(dict.fromkeys([*cat_a_reasons, *cat_b_reasons]))
    facility_tags: list[str] = []
    if cat_a_reasons:
        facility_tags.extend(["mental_health_support", "emergency_care"])
    if cat_b_reasons:
        for tag in ("emergency_care", "urgent_care", "hospital"):
            if tag not in facility_tags:
                facility_tags.append(tag)

    primary_category: EscalationCategory = (
        "mental_health_crisis" if cat_a_reasons else "acute_medical_emergency"
    )
    guidance_key = (
        "escalation.mental_health_crisis.rwanda_v1"
        if primary_category == "mental_health_crisis"
        else "escalation.acute_medical_emergency.rwanda_v1"
    )

    return CrisisScreeningResult(
        escalation_required=True,
        escalation_category=primary_category,
        reason_codes=all_reasons,
        recommended_facility_tags=tuple(facility_tags),
        guidance_key=guidance_key,
    )
